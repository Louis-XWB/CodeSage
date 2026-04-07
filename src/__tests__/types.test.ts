import { describe, it, expect } from 'vitest'
import type { ReviewReport, ReviewIssue, ReviewSuggestion, DiffResult, ChangedFile, DiffHunk } from '../types.js'

describe('types', () => {
  it('ReviewReport satisfies the expected shape', () => {
    const report: ReviewReport = {
      summary: 'Looks good overall',
      score: 85,
      issues: [
        {
          severity: 'warning',
          category: 'bug',
          file: 'src/foo.ts',
          line: 42,
          title: 'Possible null reference',
          description: 'Variable may be null here',
          suggestion: 'Add a null check',
        },
      ],
      suggestions: [
        { title: 'Extract helper', description: 'Consider extracting to a utility' },
      ],
      metadata: {
        model: 'claude-sonnet-4-6',
        duration: 12000,
        filesReviewed: 5,
      },
    }
    expect(report.score).toBe(85)
    expect(report.issues).toHaveLength(1)
    expect(report.issues[0].severity).toBe('warning')
  })

  it('DiffResult satisfies the expected shape', () => {
    const diff: DiffResult = {
      files: [
        {
          path: 'src/foo.ts',
          status: 'modified',
          hunks: [
            {
              oldStart: 10,
              oldLines: 5,
              newStart: 10,
              newLines: 7,
              content: '@@ -10,5 +10,7 @@\n context\n-old line\n+new line\n+added line',
            },
          ],
        },
      ],
      stats: { additions: 2, deletions: 1, filesChanged: 1 },
    }
    expect(diff.files).toHaveLength(1)
    expect(diff.files[0].status).toBe('modified')
  })
})
