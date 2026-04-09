// src/server/index.ts
import Fastify from 'fastify'
import { GitService } from '../core/git.js'
import { Reviewer } from '../core/reviewer.js'
import { parseDiff } from '../core/differ.js'
import { toMarkdown } from '../core/reporter.js'
import { GiteeAdapter } from '../platforms/gitee.js'
import { loadConfig } from '../config.js'
import { loadProjectConfig } from '../config/project-config.js'
import { TaskQueue } from './queue.js'
import { saveReview } from '../store/history.js'
import { getDb } from '../store/db.js'

// Allow self-signed certs for private Gitee deployments
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

export async function createServer(port = 3000) {
  const app = Fastify({ logger: true })
  const config = loadConfig()
  const queue = new TaskQueue(2)
  const gitService = new GitService()
  const reviewer = new Reviewer()
  getDb() // Initialize history database

  // Deduplication: track recently reviewed PRs to prevent webhook loops
  // key: "owner/repo#number:headSha", value: timestamp
  const reviewedPRs = new Map<string, number>()
  const DEDUP_WINDOW_MS = 5 * 60 * 1000 // 5 minutes

  app.log.info(`Config: platform=${config.platform}, giteeBaseUrl=${config.giteeBaseUrl}`)

  app.get('/health', async () => ({ status: 'ok' }))

  app.post('/webhook/gitee', async (request, reply) => {
    const body = request.body as Record<string, unknown>
    const hookName = request.headers['x-gitee-event'] as string

    // Only handle PR events
    if (hookName !== 'Merge Request Hook') {
      return reply.code(200).send({ message: 'ignored' })
    }

    const action = (body as Record<string, unknown>).action as string
    if (!['open', 'update'].includes(action)) {
      return reply.code(200).send({ message: 'ignored' })
    }

    const pr = (body as Record<string, unknown>).pull_request as Record<string, unknown>
    const repository = (body as Record<string, unknown>).repository as Record<string, unknown>
    const fullName = repository.full_name as string
    const [owner, repo] = fullName.split('/')
    const prNumber = pr.number as number
    const baseBranch = ((pr.base as Record<string, unknown>).ref) as string
    const headBranch = ((pr.head as Record<string, unknown>).ref) as string
    const headSha = ((pr.head as Record<string, unknown>).sha) as string || ''
    const cloneUrl = (repository.clone_url ?? repository.html_url ?? repository.ssh_url) as string

    // Dedup: skip if this PR+SHA was reviewed recently
    const dedupKey = `${fullName}#${prNumber}:${headSha}`
    const lastReviewed = reviewedPRs.get(dedupKey)
    if (lastReviewed && Date.now() - lastReviewed < DEDUP_WINDOW_MS) {
      app.log.info(`Skipping duplicate review for ${dedupKey}`)
      return reply.code(200).send({ message: 'already reviewed' })
    }
    reviewedPRs.set(dedupKey, Date.now())

    // Clean up old entries
    for (const [key, ts] of reviewedPRs) {
      if (Date.now() - ts > DEDUP_WINDOW_MS) reviewedPRs.delete(key)
    }

    // Enqueue review task
    queue.enqueue(async () => {
      try {
        const adapter = new GiteeAdapter({
          baseUrl: config.giteeBaseUrl,
          token: config.giteeToken,
        })

        const workDir = gitService.getWorkDir(cloneUrl)
        await gitService.cloneOrFetch(cloneUrl, workDir)
        await gitService.checkout(workDir, headBranch)
        const projectConfig = loadProjectConfig(workDir)
        const rawDiff = await gitService.getDiff(workDir, baseBranch, headBranch)
        const diff = parseDiff(rawDiff)

        const report = await reviewer.review({
          repoPath: workDir,
          diff,
          baseBranch,
          headBranch,
          projectConfig,
          env: config.apiBaseUrl !== 'https://api.anthropic.com'
            ? { ANTHROPIC_BASE_URL: config.apiBaseUrl, ANTHROPIC_AUTH_TOKEN: config.apiToken }
            : undefined,
        })

        // Post summary comment
        const markdown = toMarkdown(report, projectConfig.reportLanguage)
        await adapter.postComment(owner, repo, prNumber, markdown)

        // Post line comments for critical/warning issues
        for (const issue of report.issues) {
          if ((issue.severity === 'critical' || issue.severity === 'warning') && issue.line) {
            const commentBody = `**[${issue.severity.toUpperCase()}]** ${issue.title}\n\n${issue.description}${issue.suggestion ? `\n\n**Suggestion:** ${issue.suggestion}` : ''}`
            await adapter.postLineComment(owner, repo, prNumber, issue.file, issue.line, commentBody)
          }
        }

        // Set PR label (block or pass)
        const criticalCount = report.issues.filter(i => i.severity === 'critical').length
        const shouldBlock = (projectConfig.blockOnCritical ?? true) && criticalCount > 0
        await adapter.setReviewLabel(owner, repo, prNumber, shouldBlock)

        // Save to history
        try {
          saveReview({
            repo: `${owner}/${repo}`,
            prNumber,
            baseBranch,
            headBranch,
            report,
            diff,
            blocked: shouldBlock,
          })
        } catch (err) {
          app.log.warn(`Failed to save review history: ${(err as Error).message}`)
        }

        app.log.info(`Review completed for ${owner}/${repo}#${prNumber}: score ${report.score}, blocked=${shouldBlock}`)
      } catch (err) {
        app.log.error(`Review failed for ${owner}/${repo}#${prNumber}: ${(err as Error).message}`)
      }
    })

    return reply.code(202).send({ message: 'review queued' })
  })

  await app.listen({ port, host: '0.0.0.0' })
  return app
}

// Allow running directly
const isDirectRun = process.argv[1] && (
  process.argv[1].endsWith('server/index.js') ||
  process.argv[1].endsWith('server/index.ts')
)
if (isDirectRun) {
  const port = parseInt(process.env.PORT ?? '3000', 10)
  createServer(port)
}
