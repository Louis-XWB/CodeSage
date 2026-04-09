import { describe, it, expect } from 'vitest'
import { buildPrompt } from '../prompt-builder.js'
import type { DiffResult } from '../../types.js'

const SKILL = '你是一个高级代码审查专家。'
const DIFF: DiffResult = {
  files: [{ path: 'src/app.ts', status: 'modified', hunks: [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 2, content: '+new line' }] }],
  stats: { additions: 1, deletions: 0, filesChanged: 1 },
}

describe('buildPrompt', () => {
  it('builds basic prompt without config', () => {
    const prompt = buildPrompt(SKILL, DIFF, {})
    expect(prompt).toContain('你是一个高级代码审查专家。')
    expect(prompt).toContain('src/app.ts')
    expect(prompt).toContain('+new line')
  })

  it('includes language hint', () => {
    const prompt = buildPrompt(SKILL, DIFF, { language: 'dart' })
    expect(prompt).toContain('dart')
  })

  it('includes focus instructions', () => {
    const prompt = buildPrompt(SKILL, DIFF, {
      focus: { security: 'high', style: 'ignore', performance: 'low' },
    })
    expect(prompt).toContain('security')
    expect(prompt).toContain('重点关注')
    expect(prompt).toContain('style')
    expect(prompt).toContain('跳过')
    expect(prompt).toContain('performance')
  })

  it('includes extraPrompt', () => {
    const prompt = buildPrompt(SKILL, DIFF, { extraPrompt: 'Check dispose calls.' })
    expect(prompt).toContain('Check dispose calls.')
  })

  it('combines all sections', () => {
    const prompt = buildPrompt(SKILL, DIFF, {
      language: 'typescript',
      focus: { bug: 'high' },
      extraPrompt: 'Watch for null checks.',
    })
    expect(prompt).toContain('typescript')
    expect(prompt).toContain('bug')
    expect(prompt).toContain('Watch for null checks.')
    expect(prompt).toContain('src/app.ts')
  })
})
