# Review History Storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist every review result to SQLite and provide CLI commands to query history and statistics.

**Architecture:** New `src/store/` module manages SQLite via `better-sqlite3`. `saveReview()` is called after every review in both CLI and server. CLI gets `history` commands for querying. All data lives in `~/.codesage/history.db`.

**Tech Stack:** better-sqlite3, chalk (existing)

---

## File Structure

| File | Responsibility |
|------|---------------|
| `src/store/db.ts` | SQLite connection singleton, table creation |
| `src/store/history.ts` | `saveReview()`, `getHistory()`, `getRepoStats()`, `listRepos()` |
| `src/cli/history-cmd.ts` | CLI `history` command with subcommands |
| `src/cli/index.ts` | Register `history` command |
| `src/cli/review.ts` | Call `saveReview()` after review completes |
| `src/server/index.ts` | Call `saveReview()` after review completes |

---

### Task 1: Install Dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install better-sqlite3**

Run:
```bash
pnpm add better-sqlite3
pnpm add -D @types/better-sqlite3
```

- [ ] **Step 2: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add better-sqlite3 dependency"
```

---

### Task 2: Database Module

**Files:**
- Create: `src/store/db.ts`
- Test: `src/store/__tests__/db.test.ts`

- [ ] **Step 1: Write tests**

```typescript
// src/store/__tests__/db.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { getDb, closeDb } from '../db.js'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

describe('database', () => {
  const testDir = path.join(os.tmpdir(), 'codesage-db-test-' + Date.now())
  const dbPath = path.join(testDir, 'test.db')

  beforeEach(() => {
    fs.mkdirSync(testDir, { recursive: true })
  })

  afterEach(() => {
    closeDb()
    fs.rmSync(testDir, { recursive: true, force: true })
  })

  it('creates database and reviews table', () => {
    const db = getDb(dbPath)
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='reviews'").get()
    expect(tables).toBeDefined()
    expect((tables as { name: string }).name).toBe('reviews')
  })

  it('creates indexes', () => {
    const db = getDb(dbPath)
    const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'").all()
    const names = indexes.map((i: any) => i.name)
    expect(names).toContain('idx_repo')
    expect(names).toContain('idx_repo_pr')
    expect(names).toContain('idx_created_at')
  })

  it('returns same instance on multiple calls', () => {
    const db1 = getDb(dbPath)
    const db2 = getDb(dbPath)
    expect(db1).toBe(db2)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/store/__tests__/db.test.ts`
Expected: FAIL — cannot find module

- [ ] **Step 3: Implement**

```typescript
// src/store/db.ts
import Database from 'better-sqlite3'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'

let instance: Database.Database | null = null

const SCHEMA = `
CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  repo TEXT NOT NULL,
  pr_number INTEGER,
  base_branch TEXT,
  head_branch TEXT,
  score INTEGER NOT NULL,
  summary TEXT NOT NULL,
  issues_count INTEGER NOT NULL,
  critical_count INTEGER NOT NULL,
  warning_count INTEGER NOT NULL,
  info_count INTEGER NOT NULL,
  blocked INTEGER NOT NULL DEFAULT 0,
  files_changed INTEGER NOT NULL,
  additions INTEGER NOT NULL,
  deletions INTEGER NOT NULL,
  changed_files TEXT,
  report_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_repo ON reviews(repo);
CREATE INDEX IF NOT EXISTS idx_repo_pr ON reviews(repo, pr_number);
CREATE INDEX IF NOT EXISTS idx_created_at ON reviews(created_at);
`

function defaultDbPath(): string {
  return path.join(os.homedir(), '.codesage', 'history.db')
}

export function getDb(dbPath?: string): Database.Database {
  if (instance) return instance

  const filePath = dbPath ?? defaultDbPath()
  fs.mkdirSync(path.dirname(filePath), { recursive: true })

  instance = new Database(filePath)
  instance.pragma('journal_mode = WAL')
  instance.exec(SCHEMA)

  return instance
}

export function closeDb(): void {
  if (instance) {
    instance.close()
    instance = null
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- src/store/__tests__/db.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/store/db.ts src/store/__tests__/db.test.ts
git commit -m "feat: add SQLite database module for review history"
```

---

### Task 3: History Store

**Files:**
- Create: `src/store/history.ts`
- Test: `src/store/__tests__/history.test.ts`

- [ ] **Step 1: Write tests**

```typescript
// src/store/__tests__/history.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/store/__tests__/history.test.ts`
Expected: FAIL — cannot find module

- [ ] **Step 3: Implement**

```typescript
// src/store/history.ts
import { getDb } from './db.js'
import type { ReviewReport, DiffResult } from '../types.js'

export interface SaveReviewInput {
  repo: string
  prNumber?: number
  baseBranch?: string
  headBranch?: string
  report: ReviewReport
  diff: DiffResult
  blocked: boolean
}

export interface HistoryEntry {
  id: number
  repo: string
  prNumber: number | null
  baseBranch: string | null
  headBranch: string | null
  score: number
  summary: string
  issuesCount: number
  criticalCount: number
  warningCount: number
  infoCount: number
  blocked: boolean
  filesChanged: number
  additions: number
  deletions: number
  createdAt: string
}

export interface HistoryQuery {
  repo?: string
  prNumber?: number
  limit?: number
}

export interface RepoStats {
  repo: string
  totalReviews: number
  avgScore: number
  totalIssues: number
  totalCritical: number
  blockedCount: number
  passedCount: number
  lastReview: string
  scoreTrend: number[]
}

export interface RepoSummary {
  repo: string
  reviewCount: number
  avgScore: number
  lastReview: string
}

export function saveReview(input: SaveReviewInput): void {
  const db = getDb()
  const { report, diff } = input

  const criticalCount = report.issues.filter(i => i.severity === 'critical').length
  const warningCount = report.issues.filter(i => i.severity === 'warning').length
  const infoCount = report.issues.filter(i => i.severity === 'info').length

  db.prepare(`
    INSERT INTO reviews (
      repo, pr_number, base_branch, head_branch,
      score, summary, issues_count, critical_count, warning_count, info_count,
      blocked, files_changed, additions, deletions, changed_files, report_json, created_at
    ) VALUES (
      ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?
    )
  `).run(
    input.repo,
    input.prNumber ?? null,
    input.baseBranch ?? null,
    input.headBranch ?? null,
    report.score,
    report.summary,
    report.issues.length,
    criticalCount,
    warningCount,
    infoCount,
    input.blocked ? 1 : 0,
    diff.stats.filesChanged,
    diff.stats.additions,
    diff.stats.deletions,
    JSON.stringify(diff.files.map(f => f.path)),
    JSON.stringify(report),
    new Date().toISOString(),
  )
}

export function getHistory(query: HistoryQuery): HistoryEntry[] {
  const db = getDb()
  const conditions: string[] = []
  const params: unknown[] = []

  if (query.repo) {
    conditions.push('repo = ?')
    params.push(query.repo)
  }
  if (query.prNumber !== undefined) {
    conditions.push('pr_number = ?')
    params.push(query.prNumber)
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  const limit = query.limit ?? 20

  const rows = db.prepare(`
    SELECT id, repo, pr_number, base_branch, head_branch,
           score, summary, issues_count, critical_count, warning_count, info_count,
           blocked, files_changed, additions, deletions, created_at
    FROM reviews ${where}
    ORDER BY created_at DESC
    LIMIT ?
  `).all(...params, limit) as Record<string, unknown>[]

  return rows.map(row => ({
    id: row.id as number,
    repo: row.repo as string,
    prNumber: row.pr_number as number | null,
    baseBranch: row.base_branch as string | null,
    headBranch: row.head_branch as string | null,
    score: row.score as number,
    summary: row.summary as string,
    issuesCount: row.issues_count as number,
    criticalCount: row.critical_count as number,
    warningCount: row.warning_count as number,
    infoCount: row.info_count as number,
    blocked: (row.blocked as number) === 1,
    filesChanged: row.files_changed as number,
    additions: row.additions as number,
    deletions: row.deletions as number,
    createdAt: row.created_at as string,
  }))
}

export function getRepoStats(repo: string): RepoStats {
  const db = getDb()

  const agg = db.prepare(`
    SELECT COUNT(*) as total,
           ROUND(AVG(score)) as avg_score,
           SUM(issues_count) as total_issues,
           SUM(critical_count) as total_critical,
           SUM(CASE WHEN blocked = 1 THEN 1 ELSE 0 END) as blocked_count,
           SUM(CASE WHEN blocked = 0 THEN 1 ELSE 0 END) as passed_count,
           MAX(created_at) as last_review
    FROM reviews WHERE repo = ?
  `).get(repo) as Record<string, unknown>

  const scores = db.prepare(`
    SELECT score FROM reviews WHERE repo = ? ORDER BY created_at DESC LIMIT 10
  `).all(repo) as { score: number }[]

  return {
    repo,
    totalReviews: (agg.total as number) || 0,
    avgScore: (agg.avg_score as number) || 0,
    totalIssues: (agg.total_issues as number) || 0,
    totalCritical: (agg.total_critical as number) || 0,
    blockedCount: (agg.blocked_count as number) || 0,
    passedCount: (agg.passed_count as number) || 0,
    lastReview: (agg.last_review as string) || '',
    scoreTrend: scores.map(s => s.score).reverse(),
  }
}

export function listRepos(): RepoSummary[] {
  const db = getDb()

  const rows = db.prepare(`
    SELECT repo,
           COUNT(*) as review_count,
           ROUND(AVG(score)) as avg_score,
           MAX(created_at) as last_review
    FROM reviews
    GROUP BY repo
    ORDER BY last_review DESC
  `).all() as Record<string, unknown>[]

  return rows.map(row => ({
    repo: row.repo as string,
    reviewCount: row.review_count as number,
    avgScore: row.avg_score as number,
    lastReview: row.last_review as string,
  }))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- src/store/__tests__/history.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/store/history.ts src/store/__tests__/history.test.ts
git commit -m "feat: add review history store with save, query, stats"
```

---

### Task 4: CLI History Command

**Files:**
- Create: `src/cli/history-cmd.ts`
- Modify: `src/cli/index.ts`
- Test: `src/cli/__tests__/history-cmd.test.ts`

- [ ] **Step 1: Write tests**

```typescript
// src/cli/__tests__/history-cmd.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/cli/__tests__/history-cmd.test.ts`
Expected: FAIL — cannot find module

- [ ] **Step 3: Implement history-cmd.ts**

```typescript
// src/cli/history-cmd.ts
import chalk from 'chalk'
import { getHistory, getRepoStats, listRepos } from '../store/history.js'
import type { HistoryEntry, RepoStats, RepoSummary } from '../store/history.js'
import { getDb } from '../store/db.js'

export function formatHistoryTable(entries: HistoryEntry[]): string {
  if (entries.length === 0) return 'No review history found.'

  const lines: string[] = []
  lines.push(chalk.bold('  Date                PR#     Score   Issues  Verdict   Branch'))
  lines.push('  ' + '─'.repeat(75))

  for (const e of entries) {
    const date = e.createdAt.slice(0, 16).replace('T', ' ')
    const pr = e.prNumber ? `#${e.prNumber}` : 'local'
    const scoreColor = e.score >= 80 ? chalk.green : e.score >= 60 ? chalk.yellow : chalk.red
    const verdict = e.blocked ? chalk.red('BLOCKED') : chalk.green('PASSED ')
    const issues = `🔴${e.criticalCount} 🟡${e.warningCount} 🔵${e.infoCount}`
    const branch = e.headBranch || '-'

    lines.push(`  ${date}  ${pr.padEnd(7)} ${scoreColor(String(e.score).padStart(3))}/100  ${issues}  ${verdict}   ${branch}`)
  }

  return lines.join('\n')
}

export function formatRepoStats(stats: RepoStats): string {
  const lines: string[] = []
  const scoreColor = stats.avgScore >= 80 ? chalk.green : stats.avgScore >= 60 ? chalk.yellow : chalk.red

  lines.push(chalk.bold(`  📊 ${stats.repo}`))
  lines.push('')
  lines.push(`  Avg Score:   ${scoreColor(stats.avgScore + '/100')}`)
  lines.push(`  Reviews:     ${stats.totalReviews}`)
  lines.push(`  Blocked:     ${chalk.red(String(stats.blockedCount))}  Passed: ${chalk.green(String(stats.passedCount))}`)
  lines.push(`  Total Issues: ${stats.totalIssues}  (${chalk.red(stats.totalCritical + ' critical')})`)
  lines.push(`  Last Review: ${stats.lastReview.slice(0, 16).replace('T', ' ')}`)

  if (stats.scoreTrend.length >= 2) {
    const trend = stats.scoreTrend
    const arrow = trend[trend.length - 1] >= trend[0] ? chalk.green('↑ improving') : chalk.red('↓ declining')
    lines.push(`  Trend:       ${trend.join(' → ')}  ${arrow}`)
  }

  return lines.join('\n')
}

export function formatRepoList(repos: RepoSummary[]): string {
  if (repos.length === 0) return 'No review history found.'

  const lines: string[] = []
  lines.push(chalk.bold('  Repository                     Reviews  Avg Score  Last Review'))
  lines.push('  ' + '─'.repeat(70))

  for (const r of repos) {
    const scoreColor = r.avgScore >= 80 ? chalk.green : r.avgScore >= 60 ? chalk.yellow : chalk.red
    const date = r.lastReview.slice(0, 10)
    lines.push(`  ${r.repo.padEnd(32)} ${String(r.reviewCount).padStart(7)}  ${scoreColor(String(r.avgScore).padStart(5))}/100  ${date}`)
  }

  return lines.join('\n')
}

export function historyAction(options: { repo?: string; pr?: string }): void {
  getDb() // ensure db initialized
  const entries = getHistory({
    repo: options.repo,
    prNumber: options.pr ? parseInt(options.pr, 10) : undefined,
  })
  console.log(formatHistoryTable(entries))
}

export function historyStatsAction(options: { repo: string }): void {
  getDb()
  const stats = getRepoStats(options.repo)
  console.log(formatRepoStats(stats))
}

export function historyListAction(): void {
  getDb()
  const repos = listRepos()
  console.log(formatRepoList(repos))
}
```

- [ ] **Step 4: Register command in CLI index**

Add to `src/cli/index.ts`:

Import at top:
```typescript
import { historyAction, historyStatsAction, historyListAction } from './history-cmd.js'
```

Before `program.parse()`, add:
```typescript
const historyCmd = program
  .command('history')
  .description('View review history')
  .option('--repo <name>', 'Filter by repository (owner/repo)')
  .option('--pr <number>', 'Filter by PR number')
  .action(historyAction)

historyCmd
  .command('list')
  .description('List all reviewed repositories')
  .action(historyListAction)

historyCmd
  .command('stats')
  .description('Show repository statistics')
  .requiredOption('--repo <name>', 'Repository name (owner/repo)')
  .action(historyStatsAction)
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm test -- src/cli/__tests__/history-cmd.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add src/cli/history-cmd.ts src/cli/__tests__/history-cmd.test.ts src/cli/index.ts
git commit -m "feat: add CLI history commands (list, query, stats)"
```

---

### Task 5: Wire Into CLI Review

**Files:**
- Modify: `src/cli/review.ts`

- [ ] **Step 1: Add import**

At top of `src/cli/review.ts`:
```typescript
import { saveReview } from '../store/history.js'
import { getDb } from '../store/db.js'
```

- [ ] **Step 2: Add saveReview call**

After the line `return report` (at the very end of the `buildReviewAction` returned function), add the save logic BEFORE the return. Find the section after all the comment/label posting and before `return report`:

```typescript
    // Save to history
    try {
      getDb()
      const repoName = owner && repo ? `${owner}/${repo}` : path.basename(repoPath)
      const criticalCount = report.issues.filter(i => i.severity === 'critical').length
      const shouldBlock = (projectConfig.blockOnCritical ?? true) && criticalCount > 0
      saveReview({
        repo: repoName,
        prNumber: prNumber || undefined,
        baseBranch,
        headBranch,
        report,
        diff,
        blocked: shouldBlock,
      })
    } catch (err) {
      console.warn(`Warning: failed to save review history: ${(err as Error).message}`)
    }

    return report
```

Also add `import path from 'node:path'` if not already imported.

- [ ] **Step 3: Run all tests**

Run: `pnpm test`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add src/cli/review.ts
git commit -m "feat: save review results to history in CLI"
```

---

### Task 6: Wire Into Webhook Server

**Files:**
- Modify: `src/server/index.ts`

- [ ] **Step 1: Add imports**

At top of `src/server/index.ts`:
```typescript
import { saveReview } from '../store/history.js'
import { getDb } from '../store/db.js'
```

- [ ] **Step 2: Initialize DB on server start**

After `const reviewer = new Reviewer()`:
```typescript
  getDb() // Initialize history database
```

- [ ] **Step 3: Add saveReview call**

After the `adapter.setReviewLabel(...)` line and before the `app.log.info(...)` line:

```typescript
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
```

- [ ] **Step 4: Run all tests**

Run: `pnpm test`
Expected: All tests pass

- [ ] **Step 5: Build and verify**

Run: `pnpm build`
Expected: Build succeeds

- [ ] **Step 6: Commit**

```bash
git add src/server/index.ts
git commit -m "feat: save review results to history in webhook server"
```

---

### Task 7: Integration Test

**Files:**
- Modify: `src/__tests__/integration.test.ts`

- [ ] **Step 1: Add history integration test**

Append to `src/__tests__/integration.test.ts`:

```typescript
import { saveReview, getHistory, getRepoStats, listRepos } from '../store/history.js'
import { getDb, closeDb } from '../store/db.js'

describe('review history integration', () => {
  const testDir = path.join(os.tmpdir(), 'codesage-hist-integ-' + Date.now())
  const dbPath = path.join(testDir, 'test.db')

  beforeEach(() => {
    fs.mkdirSync(testDir, { recursive: true })
    getDb(dbPath)
  })

  afterEach(() => {
    closeDb()
    fs.rmSync(testDir, { recursive: true, force: true })
  })

  it('full flow: save review → query history → get stats', () => {
    const report: ReviewReport = {
      summary: 'Test review',
      score: 70,
      issues: [
        { severity: 'critical', category: 'security', file: 'app.ts', title: 'Issue', description: 'Desc' },
      ],
      suggestions: [],
      metadata: { model: 'test', duration: 1000, filesReviewed: 1 },
    }
    const diff: DiffResult = {
      files: [{ path: 'app.ts', status: 'modified', hunks: [] }],
      stats: { additions: 10, deletions: 2, filesChanged: 1 },
    }

    // Save
    saveReview({ repo: 'test/repo', prNumber: 1, baseBranch: 'main', headBranch: 'feat', report, diff, blocked: true })
    saveReview({ repo: 'test/repo', prNumber: 2, report: { ...report, score: 90 }, diff, blocked: false })

    // Query
    const history = getHistory({ repo: 'test/repo' })
    expect(history).toHaveLength(2)

    // Stats
    const stats = getRepoStats('test/repo')
    expect(stats.totalReviews).toBe(2)
    expect(stats.avgScore).toBe(80)
    expect(stats.blockedCount).toBe(1)

    // List
    const repos = listRepos()
    expect(repos).toHaveLength(1)
    expect(repos[0].repo).toBe('test/repo')
  })
})
```

Also add `import type { DiffResult } from '../types.js'` if not already imported at top.

- [ ] **Step 2: Run all tests**

Run: `pnpm test`
Expected: All tests pass

- [ ] **Step 3: Build**

Run: `pnpm build`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add src/__tests__/integration.test.ts
git commit -m "feat: add review history integration test"
```

---

## Execution Order

| Task | Component | Depends On |
|------|-----------|------------|
| 1 | Install deps | — |
| 2 | Database module | 1 |
| 3 | History store | 2 |
| 4 | CLI history command | 3 |
| 5 | Wire into CLI review | 3 |
| 6 | Wire into server | 3 |
| 7 | Integration test | all |

**Parallelizable:** Tasks 4, 5, 6 can run in parallel after Task 3.
