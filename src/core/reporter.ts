import type { ReviewReport, ReviewIssue } from '../types.js'
import chalk from 'chalk'

export function toJSON(report: ReviewReport): string {
  return JSON.stringify(report, null, 2)
}

export function toMarkdown(report: ReviewReport): string {
  const lines: string[] = []

  lines.push('# CodeSage Review Report')
  lines.push('')
  lines.push(`**Score:** ${report.score}/100`)
  lines.push('')
  lines.push(`**Summary:** ${report.summary}`)
  lines.push('')

  // Group issues by severity
  const severityOrder: ReviewIssue['severity'][] = ['critical', 'warning', 'info']
  const severityEmoji: Record<string, string> = {
    critical: '🔴',
    warning: '🟡',
    info: '🔵',
  }

  for (const severity of severityOrder) {
    const issues = report.issues.filter((i) => i.severity === severity)
    if (issues.length === 0) continue

    lines.push(`## ${severityEmoji[severity]} ${severity.charAt(0).toUpperCase() + severity.slice(1)} (${issues.length})`)
    lines.push('')

    for (const issue of issues) {
      const location = issue.line ? `${issue.file}:${issue.line}` : issue.file
      lines.push(`### ${issue.title}`)
      lines.push(`**File:** \`${location}\` | **Category:** ${issue.category}`)
      lines.push('')
      lines.push(issue.description)
      if (issue.suggestion) {
        lines.push('')
        lines.push(`**Suggestion:** ${issue.suggestion}`)
      }
      lines.push('')
    }
  }

  if (report.suggestions.length > 0) {
    lines.push('## Suggestions')
    lines.push('')
    for (const s of report.suggestions) {
      lines.push(`- **${s.title}:** ${s.description}`)
    }
    lines.push('')
  }

  lines.push('---')
  lines.push(`*Reviewed by ${report.metadata.model} in ${(report.metadata.duration / 1000).toFixed(1)}s | ${report.metadata.filesReviewed} files reviewed*`)

  return lines.join('\n')
}

export function toTerminal(report: ReviewReport): string {
  const lines: string[] = []

  const scoreColor = report.score >= 80 ? chalk.green : report.score >= 60 ? chalk.yellow : chalk.red
  lines.push(`${chalk.bold('CodeSage Review')}  ${scoreColor(report.score + '/100')}`)
  lines.push('')
  lines.push(report.summary)
  lines.push('')

  const severityStyle: Record<string, (s: string) => string> = {
    critical: chalk.red.bold,
    warning: chalk.yellow,
    info: chalk.blue,
  }

  for (const issue of report.issues) {
    const style = severityStyle[issue.severity]
    const location = issue.line ? `${issue.file}:${issue.line}` : issue.file
    lines.push(`  ${style(`[${issue.severity.toUpperCase()}]`)} ${issue.title}`)
    lines.push(`    ${chalk.dim(location)} (${issue.category})`)
    lines.push(`    ${issue.description}`)
    if (issue.suggestion) {
      lines.push(`    ${chalk.green('→')} ${issue.suggestion}`)
    }
    lines.push('')
  }

  if (report.suggestions.length > 0) {
    lines.push(chalk.bold('Suggestions:'))
    for (const s of report.suggestions) {
      lines.push(`  • ${s.title}: ${s.description}`)
    }
    lines.push('')
  }

  lines.push(chalk.dim(`${report.metadata.model} | ${(report.metadata.duration / 1000).toFixed(1)}s | ${report.metadata.filesReviewed} files`))

  return lines.join('\n')
}
