import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { DiffResult, ReviewReport } from '../types.js'
import { buildPrompt } from './prompt-builder.js'
import { filterDiff } from './differ.js'
import type { ProjectConfig } from '../config/project-config.js'

export interface ReviewOptions {
  repoPath: string
  diff: DiffResult
  skillPath?: string
  env?: Record<string, string>
  projectConfig?: ProjectConfig
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_SKILL = path.resolve(__dirname, '..', 'skills', 'review.md')

export class Reviewer {
  async review(options: ReviewOptions): Promise<ReviewReport> {
    const { repoPath, env, projectConfig } = options
    const skillPath = options.skillPath ?? DEFAULT_SKILL

    const skillContent = fs.readFileSync(skillPath, 'utf-8')

    // Filter diff if config has include/exclude/maxFiles
    const diff = projectConfig ? filterDiff(options.diff, projectConfig) : options.diff

    // Build prompt using prompt-builder
    const prompt = buildPrompt(skillContent, diff, projectConfig ?? {})

    const args = [
      '--print',
      '--allowedTools', 'Read,Glob,Grep',
      '-p', prompt,
    ]

    const output = await this.spawnClaude(args, repoPath, env)
    return this.parseOutput(output)
  }

  private spawnClaude(args: string[], cwd: string, extraEnv?: Record<string, string>): Promise<string> {
    return new Promise((resolve, reject) => {
      const proc = spawn('claude', args, {
        cwd,
        env: { ...process.env, ...extraEnv },
        stdio: ['pipe', 'pipe', 'pipe'],
      })

      // Close stdin immediately so claude doesn't wait for input
      proc.stdin.end()

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
          reject(new Error(`claude exited with code ${code}\nstderr: ${stderr}\nstdout: ${stdout.slice(0, 500)}`))
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
    const trimmed = raw.trim()

    // Try to extract JSON — multiple strategies
    const jsonStr = this.extractJSON(trimmed)
    if (jsonStr) {
      try {
        const parsed = JSON.parse(jsonStr)
        if (typeof parsed.summary === 'string' && typeof parsed.score === 'number') {
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
      } catch {
        // Fall through to raw fallback
      }
    }

    // Fallback: model returned non-JSON (e.g. Markdown), wrap it as a report
    console.warn('Warning: AI returned non-JSON output, wrapping as raw report')
    return {
      summary: trimmed.slice(0, 200),
      score: 0,
      issues: [],
      suggestions: [],
      metadata: {
        model: 'unknown',
        duration: 0,
        filesReviewed: 0,
      },
      rawOutput: trimmed,
    } as ReviewReport & { rawOutput: string }
  }

  private extractJSON(text: string): string | null {
    // Strategy 1: markdown code fence
    const fenceMatch = text.match(/```(?:json)?\s*\n([\s\S]*?)\n\s*```/)
    if (fenceMatch) {
      return fenceMatch[1].trim()
    }

    // Strategy 2: find outermost { ... }
    const startIdx = text.indexOf('{')
    const endIdx = text.lastIndexOf('}')
    if (startIdx !== -1 && endIdx > startIdx) {
      return text.slice(startIdx, endIdx + 1)
    }

    return null
  }
}
