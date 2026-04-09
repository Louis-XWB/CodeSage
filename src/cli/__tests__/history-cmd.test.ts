// src/cli/__tests__/history-cmd.test.ts
import { describe, it, expect } from 'vitest'
import { formatHistoryTable, formatRepoStats, formatRepoList } from '../history-cmd.js'
import type { HistoryEntry, RepoStats, RepoSummary } from '../../store/history.js'

describe('history-cmd formatting', () => {
  it('formats history table', () => {
    const entries: HistoryEntry[] = [
      {
        id: 1, repo: 'org/repo', prNumber: 42, baseBranch: 'main', headBranch: 'feat/x',
        score: 85, summary: 'Looks good', issuesCount: 2, criticalCount: 0, warningCount: 1,
        infoCount: 1, blocked: false, filesChanged: 3, additions: 20, deletions: 5,
        createdAt: '2026-04-09T12:00:00.000Z',
      },
    ]
    const output = formatHistoryTable(entries)
    expect(output).toContain('org/repo')
    expect(output).toContain('42')
    expect(output).toContain('85')
    expect(output).toContain('PASSED')
  })

  it('formats repo stats', () => {
    const stats: RepoStats = {
      repo: 'org/repo', totalReviews: 10, avgScore: 72,
      totalIssues: 25, totalCritical: 3, blockedCount: 2, passedCount: 8,
      lastReview: '2026-04-09T12:00:00.000Z', scoreTrend: [60, 65, 70, 75, 80],
    }
    const output = formatRepoStats(stats)
    expect(output).toContain('org/repo')
    expect(output).toContain('72')
    expect(output).toContain('10')
  })

  it('formats repo list', () => {
    const repos: RepoSummary[] = [
      { repo: 'org/repo-a', reviewCount: 5, avgScore: 80, lastReview: '2026-04-09T12:00:00.000Z' },
      { repo: 'org/repo-b', reviewCount: 3, avgScore: 45, lastReview: '2026-04-08T12:00:00.000Z' },
    ]
    const output = formatRepoList(repos)
    expect(output).toContain('org/repo-a')
    expect(output).toContain('org/repo-b')
    expect(output).toContain('80')
    expect(output).toContain('45')
  })
})
