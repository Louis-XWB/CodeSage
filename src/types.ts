export interface DiffHunk {
  oldStart: number
  oldLines: number
  newStart: number
  newLines: number
  content: string
}

export interface ChangedFile {
  path: string
  status: 'added' | 'modified' | 'deleted' | 'renamed'
  hunks: DiffHunk[]
}

export interface DiffResult {
  files: ChangedFile[]
  stats: {
    additions: number
    deletions: number
    filesChanged: number
  }
}

export interface ReviewIssue {
  severity: 'critical' | 'warning' | 'info'
  category: 'bug' | 'security' | 'performance' | 'style' | 'design'
  file: string
  line?: number
  title: string
  description: string
  suggestion?: string
}

export interface ReviewSuggestion {
  title: string
  description: string
}

export interface ReviewReport {
  summary: string
  score: number
  issues: ReviewIssue[]
  suggestions: ReviewSuggestion[]
  metadata: {
    model: string
    duration: number
    filesReviewed: number
  }
}
