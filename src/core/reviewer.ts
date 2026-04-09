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
    const issueRegex = /\{\s*"severity"\s*:\s*"(critical|warning|info)"\s*,\s*"category"\s*:\s*"(\w+)"\s*,\s*"file"\s*:\s*"([^"]+)"\s*(?:,\s*"line"\s*:\s*(\d+))?\s*,\s*"title"\s*:\s*"((?:[^"\\]|\\.)*)"\s*,\s*"description"\s*:\s*"((?:[^"\\]|\\.)*)"\s*(?:,\s*"suggestion"\s*:\s*"((?:[^"\\]|\\.)*)")?\s*\}/gs
    let match
    while ((match = issueRegex.exec(text)) !== null) {
      issues.push({
        severity: match[1] as 'critical' | 'warning' | 'info',
        category: match[2] as 'bug' | 'security' | 'performance' | 'style' | 'design',
        file: match[3],
        line: match[4] ? parseInt(match[4], 10) : undefined,
        title: match[5].replace(/\\"/g, '"'),
        description: match[6].replace(/\\"/g, '"'),
        suggestion: match[7]?.replace(/\\"/g, '"'),
      })
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
