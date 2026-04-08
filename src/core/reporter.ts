import type { ReviewReport, ReviewIssue } from '../types.js'
import chalk from 'chalk'

export function toJSON(report: ReviewReport): string {
  return JSON.stringify(report, null, 2)
}

export function toMarkdown(report: ReviewReport): string {
  const lines: string[] = []

  // Header with branding
  lines.push('## <img src="https://img.shields.io/badge/CodeSage-AI%20Review-blue?style=flat-square" alt="CodeSage" />')
  lines.push('')

  // Score bar
  const scoreEmoji = report.score >= 80 ? '✅' : report.score >= 60 ? '⚠️' : '❌'
  const scoreLabel = report.score >= 80 ? 'Excellent' : report.score >= 60 ? 'Acceptable' : 'Needs Work'
  const barFilled = Math.round(report.score / 5)
  const barEmpty = 20 - barFilled
  const scoreBar = '█'.repeat(barFilled) + '░'.repeat(barEmpty)
  lines.push(`### ${scoreEmoji} Score: ${report.score}/100 — ${scoreLabel}`)
  lines.push(`\`${scoreBar}\``)
  lines.push('')

  // Summary
  lines.push(`> ${report.summary}`)
  lines.push('')

  // Issue stats table
  const criticalCount = report.issues.filter(i => i.severity === 'critical').length
  const warningCount = report.issues.filter(i => i.severity === 'warning').length
  const infoCount = report.issues.filter(i => i.severity === 'info').length

  if (report.issues.length > 0) {
    lines.push('| 🔴 Critical | 🟡 Warning | 🔵 Info | Total |')
    lines.push('|:-----------:|:----------:|:-------:|:-----:|')
    lines.push(`| ${criticalCount} | ${warningCount} | ${infoCount} | ${report.issues.length} |`)
    lines.push('')
  }

  // Issues grouped by severity
  const severityOrder: ReviewIssue['severity'][] = ['critical', 'warning', 'info']
  const severityConfig: Record<string, { icon: string; label: string; color: string }> = {
    critical: { icon: '🔴', label: 'Critical', color: '#e74c3c' },
    warning: { icon: '🟡', label: 'Warning', color: '#f39c12' },
    info: { icon: '🔵', label: 'Info', color: '#3498db' },
  }

  const categoryIcon: Record<string, string> = {
    bug: '🐛',
    security: '🔒',
    performance: '⚡',
    style: '🎨',
    design: '📐',
  }

  for (const severity of severityOrder) {
    const issues = report.issues.filter((i) => i.severity === severity)
    if (issues.length === 0) continue

    const cfg = severityConfig[severity]
    lines.push(`### ${cfg.icon} ${cfg.label} (${issues.length})`)
    lines.push('')

    for (const issue of issues) {
      const location = issue.line ? `${issue.file}:${issue.line}` : issue.file
      const catIcon = categoryIcon[issue.category] ?? '📋'

      lines.push(`<details>`)
      lines.push(`<summary><strong>${catIcon} ${issue.title}</strong> &nbsp; <code>${location}</code></summary>`)
      lines.push('')
      lines.push(`**Category:** ${issue.category}`)
      lines.push('')
      lines.push(issue.description)
      if (issue.suggestion) {
        lines.push('')
        lines.push(`**💡 Suggestion:** ${issue.suggestion}`)
      }
      lines.push('')
      lines.push(`</details>`)
      lines.push('')
    }
  }

  // Suggestions
  if (report.suggestions.length > 0) {
    lines.push('### 💡 Recommendations')
    lines.push('')
    for (const s of report.suggestions) {
      lines.push(`- **${s.title}** — ${s.description}`)
    }
    lines.push('')
  }

  // Footer
  lines.push('---')
  lines.push(`<sub>🤖 Powered by <strong>CodeSage</strong> | ${report.metadata.model || 'AI'} | ${report.metadata.filesReviewed} files reviewed</sub>`)

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
