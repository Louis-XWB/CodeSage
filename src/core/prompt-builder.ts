import type { DiffResult } from '../types.js'
import type { ProjectConfig, FocusLevel } from '../config/project-config.js'

const FOCUS_LABELS: Record<FocusLevel, string> = {
  high: '重点关注，发现问题务必报告',
  medium: '适度关注',
  low: '简略关注，仅报告严重问题',
  ignore: '跳过，不要报告此类问题',
}

export function buildPrompt(skillContent: string, diff: DiffResult, config: ProjectConfig): string {
  const sections: string[] = []

  sections.push(skillContent)

  const configInstructions: string[] = []

  if (config.language) {
    configInstructions.push(`这是一个 ${config.language} 项目。`)
  }

  if (config.focus) {
    const focusLines = Object.entries(config.focus)
      .map(([category, level]) => `  - ${category}: ${FOCUS_LABELS[level]}`)
      .join('\n')
    configInstructions.push(`审查重点调整：\n${focusLines}`)
  }

  if (config.extraPrompt) {
    configInstructions.push(`项目特定要求：\n${config.extraPrompt.trim()}`)
  }

  if (configInstructions.length > 0) {
    sections.push('---\n\n## 项目配置\n\n' + configInstructions.join('\n\n'))
  }

  const diffLines: string[] = []
  diffLines.push(`Files changed: ${diff.stats.filesChanged} (+${diff.stats.additions} -${diff.stats.deletions})`)
  diffLines.push('')
  for (const file of diff.files) {
    diffLines.push(`[${file.status}] ${file.path}`)
    for (const hunk of file.hunks) {
      diffLines.push(hunk.content)
    }
    diffLines.push('')
  }

  sections.push('---\n\n以下是本次 PR 的变更内容：\n\n' + diffLines.join('\n'))

  return sections.join('\n\n')
}
