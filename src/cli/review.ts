// src/cli/review.ts
import type { GitService } from '../core/git.js'
import type { Reviewer } from '../core/reviewer.js'
import type { DiffResult, ReviewReport } from '../types.js'
import type { PlatformAdapter } from '../platforms/types.js'
import { parsePRUrl } from '../platforms/url-parser.js'
import { parseDiff } from '../core/differ.js'
import { toJSON, toMarkdown, toTerminal } from '../core/reporter.js'
import { loadConfig } from '../config.js'
import { loadProjectConfig } from '../config/project-config.js'
import { GiteeAdapter } from '../platforms/gitee.js'
import { saveReview } from '../store/history.js'
import { getDb } from '../store/db.js'
import fs from 'node:fs'
import path from 'node:path'

interface ReviewDeps {
  gitService: GitService
  reviewer: Reviewer
  parseDiff?: (raw: string) => DiffResult
}

export interface ReviewCommandOptions {
  pr?: string
  repo?: string
  base?: string
  head?: string
  format?: 'json' | 'markdown' | 'terminal'
  output?: string
  comment?: boolean
}

export function buildReviewAction(deps: ReviewDeps) {
  return async (options: ReviewCommandOptions) => {
    const config = loadConfig()
    const { gitService, reviewer } = deps
    const diffParser = deps.parseDiff ?? parseDiff

    let owner: string
    let repo: string
    let prNumber: number
    let repoPath: string
    let baseBranch: string
    let headBranch: string
    let adapter: PlatformAdapter | null = null

    if (options.pr) {
      // PR URL mode
      const parsed = parsePRUrl(options.pr)
      owner = parsed.owner
      repo = parsed.repo
      prNumber = parsed.number

      if (parsed.platform === 'gitee') {
        adapter = new GiteeAdapter({
          baseUrl: parsed.baseUrl,
          token: config.giteeToken,
        })
      }

      const prInfo = await adapter!.getPRInfo(owner, repo, prNumber)
      repoPath = gitService.getWorkDir(prInfo.repoCloneUrl)
      baseBranch = prInfo.baseBranch
      headBranch = prInfo.headBranch

      await gitService.cloneOrFetch(prInfo.repoCloneUrl, repoPath)
    } else if (options.repo && options.base && options.head) {
      // Local mode
      repoPath = options.repo
      baseBranch = options.base
      headBranch = options.head
      owner = ''
      repo = ''
      prNumber = 0
    } else {
      throw new Error('Provide --pr <url> or --repo with --base and --head')
    }

    // Checkout head branch and get diff
    await gitService.checkout(repoPath, headBranch)
    // Load project-level config
    const projectConfig = loadProjectConfig(repoPath)
    const rawDiff = await gitService.getDiff(repoPath, baseBranch, headBranch)
    const diff = diffParser(rawDiff)

    // Run review
    const report = await reviewer.review({
      repoPath,
      diff,
      baseBranch,
      headBranch,
      projectConfig,
      env: config.apiBaseUrl !== 'https://api.anthropic.com'
        ? { ANTHROPIC_BASE_URL: config.apiBaseUrl, ANTHROPIC_AUTH_TOKEN: config.apiToken }
        : undefined,
    })

    // Format output
    const format = options.format ?? config.defaultFormat
    let formatted: string
    switch (format) {
      case 'json':
        formatted = toJSON(report)
        break
      case 'markdown':
        formatted = toMarkdown(report, projectConfig.reportLanguage)
        break
      default:
        formatted = toTerminal(report)
    }

    // Write to file or stdout
    if (options.output) {
      fs.writeFileSync(options.output, formatted + '\n')
      console.log(`Report written to ${options.output}`)
    } else {
      console.log(formatted)
    }

    // Writeback to PR
    if (options.comment && adapter) {
      const markdown = toMarkdown(report, projectConfig.reportLanguage)
      await adapter.postComment(owner, repo, prNumber, markdown)

      // Post line-level comments for critical/warning issues
      for (const issue of report.issues) {
        if ((issue.severity === 'critical' || issue.severity === 'warning') && issue.line) {
          const body = `**[${issue.severity.toUpperCase()}]** ${issue.title}\n\n${issue.description}${issue.suggestion ? `\n\n**Suggestion:** ${issue.suggestion}` : ''}`
          await adapter.postLineComment(owner, repo, prNumber, issue.file, issue.line, body)
        }
      }

      // Set PR label (block or pass)
      const criticalCount = report.issues.filter(i => i.severity === 'critical').length
      const shouldBlock = (projectConfig.blockOnCritical ?? true) && criticalCount > 0
      await adapter.setReviewLabel(owner, repo, prNumber, shouldBlock)

      console.log('Review comments posted to PR.')
      if (shouldBlock) {
        console.log(`BLOCKED: ${criticalCount} critical issue(s) found.`)
        process.exit(1)
      }
    }

    // Save to history
    try {
      getDb()
      const repoName = owner && repo ? `${owner}/${repo}` : path.basename(repoPath)
      const saveCriticalCount = report.issues.filter(i => i.severity === 'critical').length
      const saveBlocked = (projectConfig.blockOnCritical ?? true) && saveCriticalCount > 0
      saveReview({
        repo: repoName,
        prNumber: prNumber || undefined,
        baseBranch,
        headBranch,
        report,
        diff,
        blocked: saveBlocked,
      })
    } catch (err) {
      console.warn(`Warning: failed to save review history: ${(err as Error).message}`)
    }

    return report
  }
}
