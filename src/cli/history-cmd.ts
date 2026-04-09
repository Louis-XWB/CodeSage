// src/cli/history-cmd.ts
import chalk from 'chalk'
import { getHistory, getRepoStats, listRepos } from '../store/history.js'
import type { HistoryEntry, RepoStats, RepoSummary } from '../store/history.js'
import { getDb } from '../store/db.js'

export function formatHistoryTable(entries: HistoryEntry[]): string {
  if (entries.length === 0) return 'No review history found.'

  const lines: string[] = []
  lines.push(chalk.bold('  Repository               Date                PR#     Score   Issues  Verdict   Branch'))
  lines.push('  ' + '─'.repeat(95))

  for (const e of entries) {
    const date = e.createdAt.slice(0, 16).replace('T', ' ')
    const pr = e.prNumber ? `#${e.prNumber}` : 'local'
    const scoreColor = e.score >= 80 ? chalk.green : e.score >= 60 ? chalk.yellow : chalk.red
    const verdict = e.blocked ? chalk.red('BLOCKED') : chalk.green('PASSED ')
    const issues = `🔴${e.criticalCount} 🟡${e.warningCount} 🔵${e.infoCount}`
    const branch = e.headBranch || '-'
    const repo = e.repo.padEnd(24)

    lines.push(`  ${repo} ${date}  ${pr.padEnd(7)} ${scoreColor(String(e.score).padStart(3))}/100  ${issues}  ${verdict}   ${branch}`)
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
  getDb()
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
