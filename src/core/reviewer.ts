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
  baseBranch?: string
  headBranch?: string
  skillPath?: string
  env?: Record<string, string>
  projectConfig?: ProjectConfig
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_SKILL = path.resolve(__dirname, '..', 'skills', 'review.md')

export class Reviewer {
  async review(options: ReviewOptions): Promise<ReviewReport> {
    const { repoPath, env, projectConfig } = options

    // Resolve skill: custom project skill > explicit skillPath > default
    let skillPath: string
    if (projectConfig?.skill) {
      skillPath = path.resolve(repoPath, projectConfig.skill)
      if (!fs.existsSync(skillPath)) {
        console.warn(`Custom skill not found: ${skillPath}, falling back to default`)
        skillPath = options.skillPath ?? DEFAULT_SKILL
      }
    } else {
      skillPath = options.skillPath ?? DEFAULT_SKILL
    }

    const skillContent = fs.readFileSync(skillPath, 'utf-8')

    // Filter diff if config has include/exclude/maxFiles
    const diff = projectConfig ? filterDiff(options.diff, projectConfig) : options.diff

    // Build prompt using prompt-builder
    const prompt = buildPrompt(skillContent, diff, projectConfig ?? {}, {
      baseBranch: options.baseBranch,
      headBranch: options.headBranch,
    })

    const allowedTools = [
      'Read', 'Glob', 'Grep',
      'Bash(git log:*)',
      'Bash(git diff:*)',
      'Bash(git show:*)',
      'Bash(git blame:*)',
    ].join(',')

    const args = [
      '--print',
      '--allowedTools', allowedTools,
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
        // JSON parse failed — try to salvage truncated JSON
        console.warn('Warning: JSON parse failed, attempting to salvage truncated output')
      }
    }

    // Strategy: extract fields from truncated/broken JSON via regex
    const salvaged = this.salvagedFromPartialJSON(trimmed)
    if (salvaged) {
      return salvaged
    }

    // Final fallback: wrap raw text as report
    console.warn('Warning: AI returned non-JSON output, wrapping as raw report')
    return {
      summary: trimmed.slice(0, 300).replace(/[{}"]/g, '').trim(),
      score: 0,
      issues: [],
      suggestions: [],
      metadata: {
        model: 'unknown',
        duration: 0,
        filesReviewed: 0,
      },
    }
  }

  private salvagedFromPartialJSON(text: string): ReviewReport | null {
    // Try to extract summary and score even from truncated JSON
    const summaryMatch = text.match(/"summary"\s*:\s*"((?:[^"\\]|\\.)*)"/s)
    const scoreMatch = text.match(/"score"\s*:\s*(\d+)/)

    if (!summaryMatch || !scoreMatch) return null

    const summary = summaryMatch[1].replace(/\\n/g, ' ').replace(/\\"/g, '"')
    const score = parseInt(scoreMatch[1], 10)

    // Try to extract complete issue objects
    const issues: ReviewReport['issues'] = []
    // Match issue objects — flexible field order using individual field extraction
    const issueBlockRegex = /\{\s*"severity"\s*:\s*"(critical|warning|info)"[^}]*\}/gs
    let blockMatch
    while ((blockMatch = issueBlockRegex.exec(text)) !== null) {
      const block = blockMatch[0]
      const sev = block.match(/"severity"\s*:\s*"(critical|warning|info)"/)
      const cat = block.match(/"category"\s*:\s*"(\w+)"/)
      const fil = block.match(/"file"\s*:\s*"([^"]+)"/)
      const lin = block.match(/"line"\s*:\s*(\d+)/)
      const com = block.match(/"commit"\s*:\s*"([^"]+)"/)
      const tit = block.match(/"title"\s*:\s*"((?:[^"\\]|\\.)*)"/)
      const desc = block.match(/"description"\s*:\s*"((?:[^"\\]|\\.)*)"/)
      const sug = block.match(/"suggestion"\s*:\s*"((?:[^"\\]|\\.)*)"/)

      if (sev && cat && fil && tit && desc) {
        issues.push({
          severity: sev[1] as 'critical' | 'warning' | 'info',
          category: cat[1] as 'bug' | 'security' | 'performance' | 'style' | 'design',
          file: fil[1],
          line: lin ? parseInt(lin[1], 10) : undefined,
          commit: com?.[1],
          title: tit[1].replace(/\\"/g, '"'),
          description: desc[1].replace(/\\"/g, '"'),
          suggestion: sug?.[1]?.replace(/\\"/g, '"'),
        })
      }
    }

    // Try to extract suggestions
    const suggestions: ReviewReport['suggestions'] = []
    const sugRegex = /\{\s*"title"\s*:\s*"((?:[^"\\]|\\.)*)"\s*,\s*"description"\s*:\s*"((?:[^"\\]|\\.)*)"\s*\}/gs
    // Only look in the "suggestions" section to avoid false matches
    const sugSection = text.match(/"suggestions"\s*:\s*\[([\s\S]*?)(?:\]|$)/)
    if (sugSection) {
      let sugMatch
      while ((sugMatch = sugRegex.exec(sugSection[1])) !== null) {
        suggestions.push({
          title: sugMatch[1].replace(/\\"/g, '"'),
          description: sugMatch[2].replace(/\\"/g, '"'),
        })
      }
    }

    console.warn(`Salvaged from truncated JSON: score=${score}, issues=${issues.length}, suggestions=${suggestions.length}`)

    return {
      summary,
      score,
      issues,
      suggestions,
      metadata: { model: 'unknown', duration: 0, filesReviewed: 0 },
    }
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
