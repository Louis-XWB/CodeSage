import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

export interface CodesageConfig {
  apiBaseUrl: string
  apiToken: string
  platform: string
  giteeBaseUrl: string
  giteeToken: string
  defaultFormat: 'terminal' | 'json' | 'markdown'
  skillPath: string
}

const DEFAULTS: CodesageConfig = {
  apiBaseUrl: 'https://api.anthropic.com',
  apiToken: '',
  platform: 'gitee',
  giteeBaseUrl: 'https://gitee.com',
  giteeToken: '',
  defaultFormat: 'terminal',
  skillPath: '',
}

const ENV_MAP: Record<string, keyof CodesageConfig> = {
  CODESAGE_API_BASE_URL: 'apiBaseUrl',
  CODESAGE_API_TOKEN: 'apiToken',
  CODESAGE_PLATFORM: 'platform',
  CODESAGE_GITEE_BASE_URL: 'giteeBaseUrl',
  CODESAGE_GITEE_TOKEN: 'giteeToken',
}

export function getConfigPath(): string {
  return path.join(os.homedir(), '.codesage', 'config.json')
}

export function loadConfig(configPath?: string): CodesageConfig {
  const filePath = configPath ?? getConfigPath()
  let fileConfig: Partial<CodesageConfig> = {}

  if (fs.existsSync(filePath)) {
    const raw = fs.readFileSync(filePath, 'utf-8')
    fileConfig = JSON.parse(raw)
  }

  const config = { ...DEFAULTS, ...fileConfig }

  // Env vars override file config
  for (const [envKey, configKey] of Object.entries(ENV_MAP)) {
    const val = process.env[envKey]
    if (val !== undefined) {
      ;(config as Record<string, string>)[configKey] = val
    }
  }

  return config
}

export function saveConfig(configPath: string, updates: Partial<CodesageConfig>): void {
  const dir = path.dirname(configPath)
  fs.mkdirSync(dir, { recursive: true })

  let existing: Partial<CodesageConfig> = {}
  if (fs.existsSync(configPath)) {
    existing = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
  }

  const merged = { ...existing, ...updates }
  fs.writeFileSync(configPath, JSON.stringify(merged, null, 2) + '\n')
}
