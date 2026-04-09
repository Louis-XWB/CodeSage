import fs from 'node:fs'
import path from 'node:path'
import { parse as parseYaml } from 'yaml'

export type FocusLevel = 'high' | 'medium' | 'low' | 'ignore'

export interface ProjectConfig {
  language?: string
  focus?: Record<string, FocusLevel>
  include?: string[]
  exclude?: string[]
  scoreThreshold?: number
  maxFiles?: number
  reportLanguage?: 'zh-CN' | 'en'
  extraPrompt?: string
  skill?: string              // path to custom skill file relative to repo root
  blockOnCritical?: boolean   // block PR merge when critical issues found (default: true)
  saveHistory?: boolean       // save review results to local SQLite (default: true)
}

export function loadProjectConfig(repoPath: string): ProjectConfig {
  const configPath = path.join(repoPath, '.codesage.yml')

  if (!fs.existsSync(configPath)) {
    return {}
  }

  const raw = fs.readFileSync(configPath, 'utf-8')
  const parsed = parseYaml(raw) ?? {}

  const config: ProjectConfig = {}

  if (typeof parsed.language === 'string') config.language = parsed.language
  if (parsed.focus && typeof parsed.focus === 'object') config.focus = parsed.focus
  if (Array.isArray(parsed.include)) config.include = parsed.include
  if (Array.isArray(parsed.exclude)) config.exclude = parsed.exclude
  if (typeof parsed.scoreThreshold === 'number') config.scoreThreshold = parsed.scoreThreshold
  if (typeof parsed.maxFiles === 'number') config.maxFiles = parsed.maxFiles
  if (parsed.reportLanguage === 'zh-CN' || parsed.reportLanguage === 'en') config.reportLanguage = parsed.reportLanguage
  if (typeof parsed.extraPrompt === 'string') config.extraPrompt = parsed.extraPrompt
  if (typeof parsed.skill === 'string') config.skill = parsed.skill
  if (typeof parsed.blockOnCritical === 'boolean') config.blockOnCritical = parsed.blockOnCritical
  if (typeof parsed.saveHistory === 'boolean') config.saveHistory = parsed.saveHistory

  return config
}
