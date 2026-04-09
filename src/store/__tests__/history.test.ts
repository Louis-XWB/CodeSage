import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { saveReview, getHistory, getRepoStats, listRepos } from '../history.js'
import { getDb, closeDb } from '../db.js'
import type { ReviewReport, DiffResult } from '../../types.js'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const testDir = path.join(os.tmpdir(), 'codesage-history-test-' + Date.now())
const dbPath = path.join(testDir, 'test.db')

const sampleReport: ReviewReport = {
  summary: 'Found critical security issues.',
  score: 35,
  issues: [
    { severity: 'critical', category: 'security', file: 'src/app.ts', line: 10, title: 'SQL injection', description: 'Unsafe query', suggestion: 'Use params' },
    { severity: 'warning', category: 'performance', file: 'src/api.ts', title: 'N+1 query', description: 'Loop query' },
    { severity: 'info', category: 'style', file: 'src/utils.ts', title: 'Naming', description: 'Mixed case' },
  ],
  suggestions: [{ title: 'Add validation', description: 'Validate inputs' }],
  metadata: { model: 'test-model', duration: 5000, filesReviewed: 3 },
}

const sampleDiff: DiffResult = {
  files: [
    { path: 'src/app.ts', status: 'modified', hunks: [] },
    { path: 'src/api.ts', status: 'added', hunks: [] },
  ],
  stats: { additions: 50, deletions: 10, filesChanged: 2 },
}

describe('history store', () => {
  beforeEach(() => {
    fs.mkdirSync(testDir, { recursive: true })
    getDb(dbPath)
  })

  afterEach(() => {
    closeDb()
    fs.rmSync(testDir, { recursive: true, force: true })
  })

  it('saves and retrieves a review', () => {
    saveReview({
      repo: 'org/repo',
      prNumber: 42,
      baseBranch: 'main',
      headBranch: 'feature/x',
      report: sampleReport,
      diff: sampleDiff,
      blocked: true,
    })

    const entries = getHistory({ repo: 'org/repo' })
    expect(entries).toHaveLength(1)
    expect(entries[0].repo).toBe('org/repo')
    expect(entries[0].prNumber).toBe(42)
    expect(entries[0].score).toBe(35)
    expect(entries[0].criticalCount).toBe(1)
    expect(entries[0].warningCount).toBe(1)
    expect(entries[0].infoCount).toBe(1)
    expect(entries[0].blocked).toBe(true)
    expect(entries[0].filesChanged).toBe(2)
    expect(entries[0].additions).toBe(50)
  })

  it('filters by repo and PR number', () => {
    saveReview({ repo: 'org/repo', prNumber: 1, report: sampleReport, diff: sampleDiff, blocked: false })
    saveReview({ repo: 'org/repo', prNumber: 2, report: sampleReport, diff: sampleDiff, blocked: false })
    saveReview({ repo: 'other/repo', prNumber: 1, report: sampleReport, diff: sampleDiff, blocked: false })

    expect(getHistory({ repo: 'org/repo' })).toHaveLength(2)
    expect(getHistory({ repo: 'org/repo', prNumber: 1 })).toHaveLength(1)
    expect(getHistory({ repo: 'other/repo' })).toHaveLength(1)
    expect(getHistory({})).toHaveLength(3)
  })

  it('respects limit', () => {
    for (let i = 0; i < 5; i++) {
      saveReview({ repo: 'org/repo', prNumber: i, report: sampleReport, diff: sampleDiff, blocked: false })
    }
    expect(getHistory({ repo: 'org/repo', limit: 3 })).toHaveLength(3)
  })

  it('returns repo stats', () => {
    saveReview({ repo: 'org/repo', prNumber: 1, report: { ...sampleReport, score: 40 }, diff: sampleDiff, blocked: true })
    saveReview({ repo: 'org/repo', prNumber: 2, report: { ...sampleReport, score: 80 }, diff: sampleDiff, blocked: false })

    const stats = getRepoStats('org/repo')
    expect(stats.totalReviews).toBe(2)
    expect(stats.avgScore).toBe(60)
    expect(stats.totalCritical).toBe(2)
    expect(stats.blockedCount).toBe(1)
    expect(stats.passedCount).toBe(1)
    expect(stats.scoreTrend).toEqual([40, 80])
  })

  it('lists all repos', () => {
    saveReview({ repo: 'org/repo-a', report: sampleReport, diff: sampleDiff, blocked: false })
    saveReview({ repo: 'org/repo-b', report: sampleReport, diff: sampleDiff, blocked: true })
    saveReview({ repo: 'org/repo-a', report: sampleReport, diff: sampleDiff, blocked: false })

    const repos = listRepos()
    expect(repos).toHaveLength(2)
    const repoA = repos.find(r => r.repo === 'org/repo-a')!
    expect(repoA.reviewCount).toBe(2)
  })
})
