import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { loadProjectConfig, type ProjectConfig } from '../project-config.js'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

describe('loadProjectConfig', () => {
  const testDir = path.join(os.tmpdir(), 'codesage-projcfg-' + Date.now())

  beforeEach(() => {
    fs.mkdirSync(testDir, { recursive: true })
  })

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true })
  })

  it('returns empty config when no .codesage.yml exists', () => {
    const config = loadProjectConfig(testDir)
    expect(config).toEqual({})
  })

  it('parses a full .codesage.yml', () => {
    fs.writeFileSync(path.join(testDir, '.codesage.yml'), `
language: typescript
focus:
  security: high
  performance: medium
  style: ignore
include:
  - src/
exclude:
  - "**/*.test.ts"
scoreThreshold: 60
maxFiles: 20
reportLanguage: en
extraPrompt: |
  Check for XSS vulnerabilities.
`)
    const config = loadProjectConfig(testDir)
    expect(config.language).toBe('typescript')
    expect(config.focus?.security).toBe('high')
    expect(config.focus?.style).toBe('ignore')
    expect(config.include).toEqual(['src/'])
    expect(config.exclude).toEqual(['**/*.test.ts'])
    expect(config.scoreThreshold).toBe(60)
    expect(config.maxFiles).toBe(20)
    expect(config.reportLanguage).toBe('en')
    expect(config.extraPrompt).toContain('XSS')
  })

  it('handles partial config', () => {
    fs.writeFileSync(path.join(testDir, '.codesage.yml'), `
language: dart
extraPrompt: Focus on dispose calls.
`)
    const config = loadProjectConfig(testDir)
    expect(config.language).toBe('dart')
    expect(config.extraPrompt).toContain('dispose')
    expect(config.focus).toBeUndefined()
    expect(config.include).toBeUndefined()
  })

  it('ignores unknown fields', () => {
    fs.writeFileSync(path.join(testDir, '.codesage.yml'), `
language: go
unknownField: value
anotherOne: 123
`)
    const config = loadProjectConfig(testDir)
    expect(config.language).toBe('go')
    expect((config as Record<string, unknown>).unknownField).toBeUndefined()
  })
})
