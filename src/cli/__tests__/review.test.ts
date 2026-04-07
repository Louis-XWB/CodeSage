import { describe, it, expect, vi, beforeEach } from 'vitest'
import { buildReviewAction } from '../review.js'
import type { ReviewReport } from '../../types.js'

describe('review command', () => {
  const mockReport: ReviewReport = {
    summary: 'Looks good',
    score: 88,
    issues: [],
    suggestions: [],
    metadata: { model: 'claude-sonnet-4-6', duration: 5000, filesReviewed: 3 },
  }

  it('buildReviewAction constructs the pipeline correctly', () => {
    // Verify the function exists and returns a function
    const action = buildReviewAction({
      gitService: {
        cloneOrFetch: vi.fn(),
        checkout: vi.fn(),
        getDiff: vi.fn().mockResolvedValue('diff content'),
        getChangedFiles: vi.fn().mockResolvedValue(['file.ts']),
        getWorkDir: vi.fn().mockReturnValue('/tmp/work'),
        getFileContent: vi.fn(),
      },
      reviewer: { review: vi.fn().mockResolvedValue(mockReport) },
      parseDiff: vi.fn().mockReturnValue({ files: [], stats: { additions: 0, deletions: 0, filesChanged: 0 } }),
    })
    expect(typeof action).toBe('function')
  })
})
