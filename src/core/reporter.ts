import type { ReviewReport, ReviewIssue } from '../types.js'
import chalk from 'chalk'

export function toJSON(report: ReviewReport): string {
  return JSON.stringify(report, null, 2)
}

export function toMarkdown(report: ReviewReport): string {
  const lines: string[] = []

  const criticalCount = report.issues.filter(i => i.severity === 'critical').length
  const warningCount = report.issues.filter(i => i.severity === 'warning').length
  const infoCount = report.issues.filter(i => i.severity === 'info').length

  // ── Header ──
  const scoreGrade = report.score >= 90 ? 'A' : report.score >= 80 ? 'B' : report.score >= 70 ? 'C' : report.score >= 60 ? 'D' : 'F'
  const gradeColor = report.score >= 80 ? '2ecc71' : report.score >= 60 ? 'f39c12' : 'e74c3c'

  lines.push(`<div align="center">`)
  lines.push('')
  lines.push(`# 🔮 CodeSage`)
  lines.push(`**AI-Powered Code Review Report**`)
  lines.push('')
  lines.push(`<br>`)
  lines.push('')
  lines.push(`<img src="https://img.shields.io/badge/Score-${report.score}%2F100-${gradeColor}?style=for-the-badge&logo=target&logoColor=white" />`)
  lines.push(`<img src="https://img.shields.io/badge/Grade-${scoreGrade}-${gradeColor}?style=for-the-badge&logo=checkmarx&logoColor=white" />`)
  lines.push(`<img src="https://img.shields.io/badge/Issues-${report.issues.length}-blue?style=for-the-badge&logo=bugsnag&logoColor=white" />`)
  lines.push('')
  lines.push(`</div>`)
  lines.push('')

  // ── Summary ──
  lines.push(`<table><tr><td>`)
  lines.push('')
  lines.push(`**📋 Summary**`)
  lines.push('')
  lines.push(report.summary)
  lines.push('')
  lines.push(`</td></tr></table>`)
  lines.push('')

  // ── Dashboard ──
  if (report.issues.length > 0) {
    lines.push(`## 📊 Issue Dashboard`)
    lines.push('')
    lines.push(`| | Category | Count | Status |`)
    lines.push(`|:---:|:---|:---:|:---|`)
    if (criticalCount > 0) lines.push(`| 🔴 | **Critical** — Must fix before merge | **${criticalCount}** | 🚫 Blocking |`)
    if (warningCount > 0) lines.push(`| 🟡 | **Warning** — Should fix | **${warningCount}** | ⚠️ Review |`)
    if (infoCount > 0) lines.push(`| 🔵 | **Info** — Nice to have | **${infoCount}** | 💬 Optional |`)
    lines.push('')
  }

  // ── Issues ──
  const severityOrder: ReviewIssue['severity'][] = ['critical', 'warning', 'info']
  const severityConfig: Record<string, { icon: string; label: string; tag: string }> = {
    critical: { icon: '🔴', label: 'Critical Issues', tag: 'e74c3c' },
    warning: { icon: '🟡', label: 'Warnings', tag: 'f39c12' },
    info: { icon: '🔵', label: 'Suggestions', tag: '3498db' },
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
    lines.push(`## ${cfg.icon} ${cfg.label}`)
    lines.push('')

    for (let i = 0; i < issues.length; i++) {
      const issue = issues[i]
      const location = issue.line ? `${issue.file}:${issue.line}` : issue.file
      const catIcon = categoryIcon[issue.category] ?? '📋'
      const num = i + 1

      lines.push(`### ${num}. ${catIcon} ${issue.title}`)
      lines.push('')
      lines.push(`> \`${location}\` · ${issue.category}`)
      lines.push('')
      lines.push(issue.description)

      if (issue.suggestion) {
        lines.push('')
        lines.push(`<blockquote>`)
        lines.push(`<b>💡 Fix:</b> ${issue.suggestion}`)
        lines.push(`</blockquote>`)
      }
      lines.push('')
    }
  }

  // ── Recommendations ──
  if (report.suggestions.length > 0) {
    lines.push(`## 📝 Recommendations`)
    lines.push('')
    for (let i = 0; i < report.suggestions.length; i++) {
      const s = report.suggestions[i]
      lines.push(`**${i + 1}. ${s.title}**`)
      lines.push('')
      lines.push(`${s.description}`)
      lines.push('')
    }
  }

  // ── Footer ──
  lines.push(`---`)
  lines.push('')
  lines.push(`<div align="center">`)
  lines.push('')
  lines.push(`<sub>`)
  lines.push(`🔮 Reviewed by <b>CodeSage</b> · ${report.metadata.model || 'AI Engine'} · ${report.metadata.filesReviewed} files analyzed`)
  lines.push(`<br>`)
  lines.push(`<a href="https://github.com/Louis-XWB/CodeSage">GitHub</a> · Open Source AI Code Review`)
  lines.push(`</sub>`)
  lines.push('')
  lines.push(`</div>`)

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
