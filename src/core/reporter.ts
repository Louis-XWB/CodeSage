import type { ReviewReport, ReviewIssue } from '../types.js'
import chalk from 'chalk'

export function toJSON(report: ReviewReport): string {
  return JSON.stringify(report, null, 2)
}

const i18n = {
  'zh-CN': {
    subtitle: 'AI 代码审查报告',
    summary: '📋 概要',
    dashboard: '📊 问题总览',
    critical: '严重问题',
    criticalDesc: '合并前必须修复',
    criticalStatus: '🚫 阻断',
    warning: '警告',
    warningDesc: '建议修复',
    warningStatus: '⚠️ 需审查',
    info: '建议',
    infoDesc: '可选改进',
    infoStatus: '💬 可选',
    recommendations: '📝 改进建议',
    footer: '开源 AI 代码审查',
    fix: '💡 修复建议：',
    filesAnalyzed: '个文件已分析',
  },
  en: {
    subtitle: 'AI-Powered Code Review Report',
    summary: '📋 Summary',
    dashboard: '📊 Issue Dashboard',
    critical: 'Critical Issues',
    criticalDesc: 'Must fix before merge',
    criticalStatus: '🚫 Blocking',
    warning: 'Warnings',
    warningDesc: 'Should fix',
    warningStatus: '⚠️ Review',
    info: 'Suggestions',
    infoDesc: 'Nice to have',
    infoStatus: '💬 Optional',
    recommendations: '📝 Recommendations',
    footer: 'Open Source AI Code Review',
    fix: '💡 Fix:',
    filesAnalyzed: 'files analyzed',
  },
} as const

export function toMarkdown(report: ReviewReport, reportLanguage?: 'zh-CN' | 'en'): string {
  const t = i18n[reportLanguage ?? 'zh-CN']
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
  lines.push(`**${t.subtitle}**`)
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
  lines.push(`**${t.summary}**`)
  lines.push('')
  lines.push(report.summary)
  lines.push('')
  lines.push(`</td></tr></table>`)
  lines.push('')

  // ── Dashboard ──
  if (report.issues.length > 0) {
    lines.push(`## ${t.dashboard}`)
    lines.push('')
    lines.push(`| | Category | Count | Status |`)
    lines.push(`|:---:|:---|:---:|:---|`)
    if (criticalCount > 0) lines.push(`| 🔴 | **${t.critical}** — ${t.criticalDesc} | **${criticalCount}** | ${t.criticalStatus} |`)
    if (warningCount > 0) lines.push(`| 🟡 | **${t.warning}** — ${t.warningDesc} | **${warningCount}** | ${t.warningStatus} |`)
    if (infoCount > 0) lines.push(`| 🔵 | **${t.info}** — ${t.infoDesc} | **${infoCount}** | ${t.infoStatus} |`)
    lines.push('')
  }

  // ── Issues ──
  const severityOrder: ReviewIssue['severity'][] = ['critical', 'warning', 'info']
  const severityConfig: Record<string, { icon: string; label: string; tag: string }> = {
    critical: { icon: '🔴', label: t.critical, tag: 'e74c3c' },
    warning: { icon: '🟡', label: t.warning, tag: 'f39c12' },
    info: { icon: '🔵', label: t.info, tag: '3498db' },
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
      const commitTag = issue.commit ? ` · \`${issue.commit}\`` : ''
      lines.push(`> \`${location}\` · ${issue.category}${commitTag}`)
      lines.push('')
      lines.push(issue.description)

      if (issue.suggestion) {
        lines.push('')
        lines.push(`<blockquote>`)
        lines.push(`<b>${t.fix}</b> ${issue.suggestion}`)
        lines.push(`</blockquote>`)
      }
      lines.push('')
    }
  }

  // ── Recommendations ──
  if (report.suggestions.length > 0) {
    lines.push(`## ${t.recommendations}`)
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
  lines.push(`🔮 Reviewed by <b>CodeSage</b> · ${report.metadata.model || 'AI Engine'} · ${report.metadata.filesReviewed} ${t.filesAnalyzed}`)
  lines.push(`<br>`)
  lines.push(`<a href="https://github.com/Louis-XWB/CodeSage">GitHub</a> · ${t.footer}`)
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
