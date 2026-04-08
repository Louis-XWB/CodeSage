import { describe, it, expect, vi, beforeEach } from 'vitest'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Reviewer } from '../reviewer.js'
import type { DiffResult, ReviewReport } from '../../types.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REAL_SKILL = path.resolve(__dirname, '..', '..', 'skills', 'review.md')

// Mock child_process.spawn
vi.mock('node:child_process', () => {
  const { EventEmitter } = require('node:events')
  const { Readable } = require('node:stream')

  return {
    spawn: vi.fn(() => {
      const proc = new EventEmitter()

      const validReport: ReviewReport = {
        summary: 'Good PR',
        score: 90,
        issues: [],
        suggestions: [],
        metadata: { model: 'claude-sonnet-4-6', duration: 5000, filesReviewed: 2 },
      }
      const stdout = Readable.from([JSON.stringify(validReport)])
      const stderr = Readable.from([''])
      proc.stdout = stdout
      proc.stderr = stderr

      // Emit close in next tick
      setTimeout(() => proc.emit('close', 0), 10)
      return proc
    }),
  }
})

describe('Reviewer', () => {
  const sampleDiff: DiffResult = {
    files: [
      { path: 'src/foo.ts', status: 'modified', hunks: [] },
    ],
    stats: { additions: 5, deletions: 2, filesChanged: 1 },
  }

  it('calls claude CLI and parses JSON output', async () => {
    const reviewer = new Reviewer()
    const report = await reviewer.review({
      repoPath: '/tmp/test-repo',
      diff: sampleDiff,
      skillPath: REAL_SKILL,
    })
    expect(report.score).toBe(90)
    expect(report.summary).toBe('Good PR')
  })

  it('passes correct arguments to claude CLI', async () => {
    const { spawn } = await import('node:child_process')
    const reviewer = new Reviewer()
    await reviewer.review({
      repoPath: '/tmp/test-repo',
      diff: sampleDiff,
      skillPath: REAL_SKILL,
    })

    expect(spawn).toHaveBeenCalledWith(
      'claude',
      expect.arrayContaining(['--print']),
      expect.objectContaining({
        cwd: '/tmp/test-repo',
      }),
    )
  })

  it('includes env overrides when provided', async () => {
    const { spawn } = await import('node:child_process')
    const reviewer = new Reviewer()
    await reviewer.review({
      repoPath: '/tmp/test-repo',
      diff: sampleDiff,
      skillPath: REAL_SKILL,
      env: { ANTHROPIC_BASE_URL: 'https://custom.api.com' },
    })

    expect(spawn).toHaveBeenCalledWith(
      'claude',
      expect.any(Array),
      expect.objectContaining({
        env: expect.objectContaining({
          ANTHROPIC_BASE_URL: 'https://custom.api.com',
        }),
      }),
    )
  })
})
