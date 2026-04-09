import type { DiffResult, ChangedFile } from '../types.js'
import type { ProjectConfig, FocusLevel } from '../config/project-config.js'

const FOCUS_LABELS: Record<FocusLevel, string> = {
  high: '重点关注，发现问题务必报告',
  medium: '适度关注',
  low: '简略关注，仅报告严重问题',
  ignore: '跳过，不要报告此类问题',
}

// Max changed lines to show per file in the compact diff
const MAX_LINES_PER_FILE = 50
// Max total chars for the entire change summary
const MAX_SUMMARY_CHARS = 15000

export function buildPrompt(skillContent: string, diff: DiffResult, config: ProjectConfig): string {
  const sections: string[] = []

  // 1. Skill instructions
  sections.push(skillContent)

  // 2. Project config instructions
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

  // 3. File list overview
  const fileList = diff.files.map(f => {
    const adds = countAdds(f)
    const dels = countDels(f)
    const stats = `+${adds} -${dels}`
    return `  - [${f.status}] ${f.path} (${stats})`
  }).join('\n')

  sections.push(`---\n\n## 变更文件列表\n\n共 ${diff.stats.filesChanged} 个文件，+${diff.stats.additions} -${diff.stats.deletions}\n\n${fileList}`)

  // 4. Compact change summary — only changed lines, truncated per file
  const summaryLines: string[] = []
  let totalChars = 0

  for (const file of diff.files) {
    const compact = buildCompactDiff(file)
    const block = `### ${file.path}\n\`\`\`\n${compact}\n\`\`\`\n`

    if (totalChars + block.length > MAX_SUMMARY_CHARS) {
      summaryLines.push(`\n... 剩余文件省略，请使用 Read 工具查看`)
      break
    }
    summaryLines.push(block)
    totalChars += block.length
  }

  sections.push('## 变更摘要\n\n以下仅展示关键改动行，请务必使用 Read 工具查看每个文件的完整内容：\n\n' + summaryLines.join('\n'))

  return sections.join('\n\n')
}

function buildCompactDiff(file: ChangedFile): string {
  const lines: string[] = []
  let lineCount = 0

  for (const hunk of file.hunks) {
    for (const line of hunk.content.split('\n')) {
      // Only show added/removed lines, skip context
      if (line.startsWith('+') || line.startsWith('-')) {
        if (line.startsWith('+++') || line.startsWith('---')) continue
        lines.push(line)
        lineCount++
        if (lineCount >= MAX_LINES_PER_FILE) {
          lines.push(`... (${file.path} 还有更多改动，请用 Read 查看完整文件)`)
          return lines.join('\n')
        }
      }
    }
  }

  return lines.join('\n')
}

function countAdds(file: ChangedFile): number {
  let count = 0
  for (const hunk of file.hunks) {
    for (const line of hunk.content.split('\n')) {
      if (line.startsWith('+') && !line.startsWith('+++')) count++
    }
  }
  return count
}

function countDels(file: ChangedFile): number {
  let count = 0
  for (const hunk of file.hunks) {
    for (const line of hunk.content.split('\n')) {
      if (line.startsWith('-') && !line.startsWith('---')) count++
    }
  }
  return count
}
