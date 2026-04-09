# Review History Storage — Design Spec

## Overview

Persist every review result to a local SQLite database so users can query history, track trends, and prepare for a future Web Dashboard. Reviews are saved automatically after each CLI or Webhook review completes.

## Database

Storage: `~/.codesage/history.db` (same directory as config.json)

Library: `better-sqlite3` — synchronous API, zero config, mature.

### Schema

```sql
CREATE TABLE reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  repo TEXT NOT NULL,
  pr_number INTEGER,
  base_branch TEXT,
  head_branch TEXT,
  score INTEGER NOT NULL,
  summary TEXT NOT NULL,
  issues_count INTEGER NOT NULL,
  critical_count INTEGER NOT NULL,
  warning_count INTEGER NOT NULL,
  info_count INTEGER NOT NULL,
  blocked INTEGER NOT NULL DEFAULT 0,
  files_changed INTEGER NOT NULL,
  additions INTEGER NOT NULL,
  deletions INTEGER NOT NULL,
  changed_files TEXT,
  report_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_repo ON reviews(repo);
CREATE INDEX idx_repo_pr ON reviews(repo, pr_number);
CREATE INDEX idx_created_at ON reviews(created_at);
```

All fields are derived from `ReviewReport` + context (repo, PR number, branches, diff stats). `report_json` stores the full `ReviewReport` for future detailed queries. `changed_files` is a JSON array of file paths.

## New Files

| File | Responsibility |
|------|---------------|
| `src/store/db.ts` | SQLite connection, table creation, auto-migration |
| `src/store/history.ts` | `saveReview()`, `getHistory()`, `getRepoStats()`, `listRepos()` |
| `src/cli/history-cmd.ts` | CLI commands for querying history |

## API

### saveReview

```typescript
interface SaveReviewInput {
  repo: string
  prNumber?: number
  baseBranch?: string
  headBranch?: string
  report: ReviewReport
  diff: DiffResult
  blocked: boolean
}

function saveReview(input: SaveReviewInput): void
```

Called after review completes in both CLI and Webhook server.

### getHistory

```typescript
interface HistoryQuery {
  repo?: string
  prNumber?: number
  limit?: number          // default 20
}

interface HistoryEntry {
  id: number
  repo: string
  prNumber: number | null
  baseBranch: string | null
  headBranch: string | null
  score: number
  summary: string
  issuesCount: number
  criticalCount: number
  warningCount: number
  infoCount: number
  blocked: boolean
  filesChanged: number
  additions: number
  deletions: number
  createdAt: string
}

function getHistory(query: HistoryQuery): HistoryEntry[]
```

### getRepoStats

```typescript
interface RepoStats {
  repo: string
  totalReviews: number
  avgScore: number
  totalIssues: number
  totalCritical: number
  blockedCount: number
  passedCount: number
  lastReview: string       // ISO timestamp
  scoreTrend: number[]     // last 10 scores
}

function getRepoStats(repo: string): RepoStats
```

### listRepos

```typescript
interface RepoSummary {
  repo: string
  reviewCount: number
  avgScore: number
  lastReview: string
}

function listRepos(): RepoSummary[]
```

## CLI Commands

```bash
# List all reviewed repos
codesage history list

# View recent reviews for a repo
codesage history --repo xuweibin/AICodeSage

# View reviews for a specific PR
codesage history --repo xuweibin/AICodeSage --pr 21

# View repo statistics (avg score, trend, issue counts)
codesage history stats --repo xuweibin/AICodeSage
```

### Output Format

`history list` — table of repos with review count and avg score

`history --repo` — table of recent reviews with date, PR#, score, issues, verdict

`history stats` — summary card with avg score, total reviews, trend arrow, top issue categories

## Integration Points

### cli/review.ts

After the review completes and comments are posted (if applicable), call `saveReview()` with the report, diff stats, and context.

### server/index.ts

Same as CLI — after posting comments and setting labels, call `saveReview()`.

### Repo name derivation

- PR mode: from the parsed PR URL (`owner/repo`)
- Local mode: derive from git remote URL or use directory name as fallback
- Webhook mode: from webhook payload `repository.full_name`

## Dependency

- `better-sqlite3` — SQLite driver
- `@types/better-sqlite3` — TypeScript types

## Testing

- `store/db.test.ts` — database creation, table exists, schema correct
- `store/history.test.ts` — saveReview, getHistory, getRepoStats, listRepos
- `cli/history-cmd.test.ts` — CLI output format
- Integration test — full flow: review → save → query
