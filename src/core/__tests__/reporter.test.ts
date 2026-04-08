import { describe, it, expect } from 'vitest'
import { toJSON, toMarkdown, toTerminal } from '../reporter.js'
import type { ReviewReport } from '../../types.js'

const SAMPLE_REPORT: ReviewReport = {
  summary: 'Overall the PR looks good with a few issues to address.',
  score: 72,
  issues: [
    {
      severity: 'critical',
      category: 'security',
      file: 'src/auth.ts',
      line: 15,
      title: 'SQL injection risk',
      description: 'User input is directly interpolated into query string.',
      suggestion: 'Use parameterized queries.',
    },
    {
      severity: 'warning',
      category: 'performance',
      file: 'src/api.ts',
      line: 88,
      title: 'N+1 query in loop',
      description: 'Database query inside a for loop.',
    },
    {
      severity: 'info',
      category: 'style',
      file: 'src/utils.ts',
      title: 'Inconsistent naming',
      description: 'Mixed camelCase and snake_case.',
    },
  ],
  suggestions: [
    { title: 'Add input validation', description: 'Validate request body before processing.' },
  ],
  metadata: {
    model: 'claude-sonnet-4-6',
    duration: 15000,
    filesReviewed: 8,
  },
}

describe('reporter', () => {
  describe('toJSON', () => {
    it('returns valid JSON string', () => {
      const json = toJSON(SAMPLE_REPORT)
      const parsed = JSON.parse(json)
      expect(parsed.score).toBe(72)
      expect(parsed.issues).toHaveLength(3)
    })
  })

  describe('toMarkdown', () => {
    it('includes summary and score', () => {
      const md = toMarkdown(SAMPLE_REPORT)
      expect(md).toContain('Score-72')
      expect(md).toContain('Overall the PR looks good')
    })

    it('groups issues by severity', () => {
      const md = toMarkdown(SAMPLE_REPORT)
      expect(md).toContain('Critical')
      expect(md).toContain('SQL injection risk')
      expect(md).toContain('src/auth.ts:15')
    })

    it('includes suggestions section', () => {
      const md = toMarkdown(SAMPLE_REPORT)
      expect(md).toContain('Add input validation')
    })
  })

  describe('toTerminal', () => {
    it('returns a non-empty string', () => {
      const output = toTerminal(SAMPLE_REPORT)
      expect(output.length).toBeGreaterThan(0)
      expect(output).toContain('72')
    })
  })
})
