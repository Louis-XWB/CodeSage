import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { loadConfig, getConfigPath } from '../config.js'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

describe('config', () => {
  const testDir = path.join(os.tmpdir(), 'codesage-test-config-' + Date.now())
  const configPath = path.join(testDir, 'config.json')

  beforeEach(() => {
    fs.mkdirSync(testDir, { recursive: true })
    // Clear env vars
    delete process.env.CODESAGE_API_BASE_URL
    delete process.env.CODESAGE_API_TOKEN
    delete process.env.CODESAGE_PLATFORM
    delete process.env.CODESAGE_GITEE_BASE_URL
    delete process.env.CODESAGE_GITEE_TOKEN
  })

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true })
  })

  it('returns defaults when no config file exists', () => {
    const config = loadConfig(path.join(testDir, 'nonexistent.json'))
    expect(config.apiBaseUrl).toBe('https://api.anthropic.com')
    expect(config.platform).toBe('gitee')
    expect(config.defaultFormat).toBe('terminal')
  })

  it('loads config from file', () => {
    fs.writeFileSync(configPath, JSON.stringify({
      apiBaseUrl: 'https://custom-api.com',
      giteeToken: 'test-token',
    }))
    const config = loadConfig(configPath)
    expect(config.apiBaseUrl).toBe('https://custom-api.com')
    expect(config.giteeToken).toBe('test-token')
    // Defaults still apply for unset fields
    expect(config.platform).toBe('gitee')
  })

  it('env vars override config file', () => {
    fs.writeFileSync(configPath, JSON.stringify({
      apiBaseUrl: 'https://from-file.com',
    }))
    process.env.CODESAGE_API_BASE_URL = 'https://from-env.com'
    const config = loadConfig(configPath)
    expect(config.apiBaseUrl).toBe('https://from-env.com')
  })
})
