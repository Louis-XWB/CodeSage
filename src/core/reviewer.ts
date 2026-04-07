import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { DiffResult, ReviewReport } from '../types.js'

export interface ReviewOptions {
  repoPath: string
  diff: DiffResult
  skillPath?: string
  env?: Record<string, string>
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_SKILL = path.resolve(__dirname, '..', 'skills', 'review.md')

export class Reviewer {
  async review(options: ReviewOptions): Promise<ReviewReport> {
    const { repoPath, diff, env } = options
    const skillPath = options.skillPath ?? DEFAULT_SKILL

    const diffSummary = this.buildDiffSummary(diff)

    const prompt = `Review this PR.\n\nChanged files:\n${diffSummary}`

    const args = [
      '--print',
      '--allowedTools', 'Read,Glob,Grep',
      '-p', prompt,
    ]

    const output = await this.spawnClaude(args, repoPath, env)
    return this.parseOutput(output)
  }

  private buildDiffSummary(diff: DiffResult): string {
    const lines: string[] = []
    lines.push(`Files changed: ${diff.stats.filesChanged} (+${diff.stats.additions} -${diff.stats.deletions})`)
    lines.push('')
    for (const file of diff.files) {
      lines.push(`[${file.status}] ${file.path}`)
      for (const hunk of file.hunks) {
        lines.push(hunk.content)
      }
      lines.push('')
    }
    return lines.join('\n')
  }

  private spawnClaude(args: string[], cwd: string, extraEnv?: Record<string, string>): Promise<string> {
    return new Promise((resolve, reject) => {
      const proc = spawn('claude', args, {
        cwd,
        env: { ...process.env, ...extraEnv },
      })

      let stdout = ''
      let stderr = ''

      proc.stdout.on('data', (data: Buffer) => {
        stdout += data.toString()
      })

      proc.stderr.on('data', (data: Buffer) => {
        stderr += data.toString()
      })

      proc.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`claude exited with code ${code}: ${stderr}`))
        } else {
          resolve(stdout)
        }
      })

      proc.on('error', (err) => {
        reject(new Error(`Failed to spawn claude: ${err.message}`))
      })
    })
  }

  private parseOutput(raw: string): ReviewReport {
    // Try to extract JSON from the output — Claude may wrap it in markdown fences
    let jsonStr = raw.trim()

    // Strip markdown code fences if present
    const jsonMatch = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/)
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim()
    }

    // Try to find JSON object boundaries
    const startIdx = jsonStr.indexOf('{')
    const endIdx = jsonStr.lastIndexOf('}')
    if (startIdx !== -1 && endIdx !== -1) {
      jsonStr = jsonStr.slice(startIdx, endIdx + 1)
    }

    const parsed = JSON.parse(jsonStr)

    // Validate required fields
    if (typeof parsed.summary !== 'string' || typeof parsed.score !== 'number') {
      throw new Error('Invalid review output: missing summary or score')
    }

    return {
      summary: parsed.summary,
      score: parsed.score,
      issues: parsed.issues ?? [],
      suggestions: parsed.suggestions ?? [],
      metadata: parsed.metadata ?? {
        model: 'unknown',
        duration: 0,
        filesReviewed: 0,
      },
    }
  }
}
