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
  const { repo, prNumber, baseBranch, headBranch, report, diff, blocked } = input

  const issues = report.issues ?? []
  const issuesCount = issues.length
  const criticalCount = issues.filter(i => i.severity === 'critical').length
  const warningCount = issues.filter(i => i.severity === 'warning').length
  const infoCount = issues.filter(i => i.severity === 'info').length

  const changedFiles = diff.files.map(f => f.path).join(',')
  const createdAt = new Date().toISOString()

  db.prepare(`
    INSERT INTO reviews (
      repo, pr_number, base_branch, head_branch,
      score, summary, issues_count, critical_count, warning_count, info_count,
      blocked, files_changed, additions, deletions, changed_files, report_json, created_at
    ) VALUES (
      @repo, @prNumber, @baseBranch, @headBranch,
      @score, @summary, @issuesCount, @criticalCount, @warningCount, @infoCount,
      @blocked, @filesChanged, @additions, @deletions, @changedFiles, @reportJson, @createdAt
    )
  `).run({
    repo,
    prNumber: prNumber ?? null,
    baseBranch: baseBranch ?? null,
    headBranch: headBranch ?? null,
    score: report.score,
    summary: report.summary,
    issuesCount,
    criticalCount,
    warningCount,
    infoCount,
    blocked: blocked ? 1 : 0,
    filesChanged: diff.stats.filesChanged,
    additions: diff.stats.additions,
    deletions: diff.stats.deletions,
    changedFiles,
    reportJson: JSON.stringify(report),
    createdAt,
  })
}

export function getHistory(query: HistoryQuery): HistoryEntry[] {
  const db = getDb()
  const conditions: string[] = []
  const params: Record<string, unknown> = {}

  if (query.repo !== undefined) {
    conditions.push('repo = @repo')
    params.repo = query.repo
  }

  if (query.prNumber !== undefined) {
    conditions.push('pr_number = @prNumber')
    params.prNumber = query.prNumber
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  const limit = query.limit ?? 20
  params.limit = limit

  const sql = `
    SELECT
      id, repo, pr_number AS prNumber, base_branch AS baseBranch, head_branch AS headBranch,
      score, summary, issues_count AS issuesCount, critical_count AS criticalCount,
      warning_count AS warningCount, info_count AS infoCount, blocked,
      files_changed AS filesChanged, additions, deletions, created_at AS createdAt
    FROM reviews
    ${where}
    ORDER BY created_at DESC
    LIMIT @limit
  `

  const rows = db.prepare(sql).all(params) as Array<Record<string, unknown>>

  return rows.map(row => ({
    ...row,
    blocked: row.blocked === 1,
  })) as HistoryEntry[]
}

export function getRepoStats(repo: string): RepoStats {
  const db = getDb()

  const agg = db.prepare(`
    SELECT
      COUNT(*) AS totalReviews,
      AVG(score) AS avgScore,
      SUM(issues_count) AS totalIssues,
      SUM(critical_count) AS totalCritical,
      SUM(CASE WHEN blocked = 1 THEN 1 ELSE 0 END) AS blockedCount,
      SUM(CASE WHEN blocked = 0 THEN 1 ELSE 0 END) AS passedCount,
      MAX(created_at) AS lastReview
    FROM reviews
    WHERE repo = @repo
  `).get({ repo }) as Record<string, unknown>

  const trendRows = db.prepare(`
    SELECT score FROM reviews
    WHERE repo = @repo
    ORDER BY created_at DESC, id DESC
    LIMIT 10
  `).all({ repo }) as Array<{ score: number }>

  const scoreTrend = trendRows.map(r => r.score).reverse()

  return {
    repo,
    totalReviews: agg.totalReviews as number,
    avgScore: Math.round((agg.avgScore as number) * 100) / 100,
    totalIssues: agg.totalIssues as number,
    totalCritical: agg.totalCritical as number,
    blockedCount: agg.blockedCount as number,
    passedCount: agg.passedCount as number,
    lastReview: agg.lastReview as string,
    scoreTrend,
  }
}

export function listRepos(): RepoSummary[] {
  const db = getDb()

  const rows = db.prepare(`
    SELECT
      repo,
      COUNT(*) AS reviewCount,
      AVG(score) AS avgScore,
      MAX(created_at) AS lastReview
    FROM reviews
    GROUP BY repo
    ORDER BY lastReview DESC
  `).all() as Array<Record<string, unknown>>

  return rows.map(row => ({
    repo: row.repo as string,
    reviewCount: row.reviewCount as number,
    avgScore: Math.round((row.avgScore as number) * 100) / 100,
    lastReview: row.lastReview as string,
  }))
}
