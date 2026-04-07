# CodeSage — AI Code Review Engine

## Overview

CodeSage is an open-source AI code review tool that leverages Claude Code CLI as its review engine. It provides full-project-aware code review (not just diff review) for Pull Requests, with first-class support for Gitee (including private deployments) and a platform-agnostic architecture.

## Architecture

```
User/CI ──→ CLI ──→ Core Engine ──→ Claude Code CLI ──→ Structured Report
                        ↑                                    ↓
Gitee Webhook ──→ Server ──→ Core Engine            Platform Adapter
                                                         ↓
                                                   PR Comment Writeback
```

### Core Flow

1. **Trigger**: CLI manual execution or Webhook receives PR event
2. **Prepare**: clone/fetch repo → checkout PR branch → compute diff
3. **Analyze**: invoke Claude Code CLI with review skill + project context
4. **Output**: parse Claude Code output → structured JSON
5. **Distribute**: JSON → Markdown PR comment / HTML report / terminal output

## Project Structure

```
codesage/
├── src/
│   ├── cli/            # CLI entry (commander)
│   ├── server/         # Webhook HTTP service (Fastify)
│   ├── core/
│   │   ├── git.ts          # Git operations (simple-git)
│   │   ├── differ.ts       # Diff parsing & context extraction
│   │   ├── reviewer.ts     # Claude Code CLI orchestration
│   │   └── reporter.ts     # Report generation & formatting
│   ├── platforms/
│   │   ├── types.ts        # Platform adapter interface
│   │   ├── gitee.ts        # Gitee API adapter
│   │   └── github.ts       # GitHub API adapter (future)
│   └── skills/
│       └── review.md       # Claude Code review skill
├── Dockerfile
├── package.json
└── tsconfig.json
```

## Core Engine

### git.ts — Git Operations

```typescript
interface GitService {
  cloneOrFetch(repoUrl: string, workDir: string): Promise<void>
  checkout(branch: string): Promise<void>
  getDiff(base: string, head: string): Promise<string>
  getFileContent(path: string, ref: string): Promise<string>
  getChangedFiles(base: string, head: string): Promise<string[]>
}
```

- Uses `simple-git` library
- Working directories managed under `~/.codesage/repos/<repo-hash>/`
- Supports incremental fetch to avoid full clone each time

### differ.ts — Diff Parsing

```typescript
interface DiffResult {
  files: ChangedFile[]
  stats: { additions: number; deletions: number; filesChanged: number }
}

interface ChangedFile {
  path: string
  status: 'added' | 'modified' | 'deleted' | 'renamed'
  hunks: DiffHunk[]
}

interface DiffHunk {
  oldStart: number
  oldLines: number
  newStart: number
  newLines: number
  content: string               // raw hunk content
}
```

- Parses unified diff format
- Provides sufficient context per changed file for the review skill

### reviewer.ts — Claude Code Orchestration

```typescript
interface ReviewOptions {
  repoPath: string
  diff: DiffResult
  skill: string
  env?: Record<string, string>  // ANTHROPIC_BASE_URL, etc.
}

interface Reviewer {
  review(options: ReviewOptions): Promise<ReviewReport>
}
```

**Invocation:**

```bash
claude --print \
  --skill /path/to/review.md \
  --allowedTools "Read,Glob,Grep" \
  "Review this PR: <diff summary>"
```

- Calls Claude Code CLI via `child_process.spawn`
- `--print` mode for plain text output
- Read-only tools only (Read/Glob/Grep) — no write operations allowed
- Multi-model support via environment variables (`ANTHROPIC_BASE_URL` / `ANTHROPIC_AUTH_TOKEN`)
- Claude Code outputs JSON-formatted review results

### reporter.ts — Report Generation

```typescript
interface ReviewReport {
  summary: string
  score: number                  // 0-100
  issues: ReviewIssue[]
  suggestions: ReviewSuggestion[]
  metadata: {
    model: string
    duration: number
    filesReviewed: number
  }
}

interface ReviewIssue {
  severity: 'critical' | 'warning' | 'info'
  category: 'bug' | 'security' | 'performance' | 'style' | 'design'
  file: string
  line?: number
  title: string
  description: string
  suggestion?: string
}

interface ReviewSuggestion {
  title: string
  description: string
}

interface Reporter {
  toJSON(report: ReviewReport): string
  toMarkdown(report: ReviewReport): string
  toTerminal(report: ReviewReport): string
}
```

## CLI Design

```bash
# Review a PR
codesage review --pr https://gitee.com/org/repo/pulls/123

# Local mode
codesage review --repo /path/to/local/repo --base main --head feature/xyz

# Output control
codesage review --pr <url> --format json
codesage review --pr <url> --format markdown
codesage review --pr <url> --output report.json
codesage review --pr <url> --comment          # writeback to PR

# Configuration
codesage config set apiBaseUrl "https://your-api.com/v1"
codesage config set apiToken "sk-xxx"
codesage config set platform "gitee"
codesage config set giteeBaseUrl "https://gitee.your-company.com"
```

**Config file** `~/.codesage/config.json`:

```json
{
  "apiBaseUrl": "https://api.anthropic.com",
  "apiToken": "",
  "platform": "gitee",
  "giteeBaseUrl": "https://gitee.com",
  "giteeToken": "",
  "defaultFormat": "terminal",
  "skillPath": ""
}
```

Priority: environment variables > config file > defaults.

## Webhook Server

**Routes:**

```
POST /webhook/gitee    — Receive Gitee PR events
POST /webhook/github   — Receive GitHub PR events (future)
GET  /health           — Health check
```

**Processing flow:**

```
Webhook request
  → Verify signature (Secret Token)
  → Parse event type (PR opened / updated / reopened)
  → Filter (ignore closed, merged, draft)
  → Enqueue task
  → Return 202 Accepted

Task queue (in-memory, upgradeable to Redis)
  → Dequeue task
  → Call Core Engine for review
  → Writeback PR comment via Platform Adapter
```

- Async processing: webhook returns 202 immediately, review runs in background
- In-memory queue with concurrency control (default: 2 concurrent reviews)
- Signature verification to prevent forged requests
- Configurable repo/branch filters

## Platform Adapter

```typescript
interface PlatformAdapter {
  getPRInfo(prUrl: string): Promise<PRInfo>
  postComment(prUrl: string, body: string): Promise<void>
  postLineComment(prUrl: string, file: string, line: number, body: string): Promise<void>
}

interface PRInfo {
  title: string
  description: string
  baseBranch: string
  headBranch: string
  repoCloneUrl: string
  author: string
  files: string[]
}
```

- Gitee adapter uses Gitee API v5 (`/repos/{owner}/{repo}/pulls/{number}`)
- Supports private deployment base URL configuration
- Token injection via config file or environment variables

## Review Skill

The review skill is the core differentiator. It instructs Claude Code to:

1. Not just look at the diff, but actively explore the project using Read/Glob/Grep
2. Understand reference relationships and call chains
3. Output structured JSON with severity levels and categories

### Review Dimensions

1. **Bug risk** — logic errors, boundary conditions, null pointers, race conditions
2. **Security risk** — injection, XSS, sensitive data leaks, permission issues
3. **Performance** — N+1 queries, memory leaks, unnecessary computation
4. **Design quality** — responsibility separation, coupling, maintainability
5. **Code style** — naming, consistency (only readability-impacting issues)

### Review Principles

- Only review issues introduced by the current change, not existing code
- Understand change context by exploring related files
- Distinguish severity: critical (must fix), warning (should fix), info (optional)
- Provide concrete fix suggestions

## Tech Stack

| Module | Choice |
|--------|--------|
| Language | TypeScript (ESM) |
| Runtime | Node.js >= 18 |
| CLI framework | commander |
| HTTP server | Fastify |
| Git operations | simple-git |
| AI engine | Claude Code CLI (`claude --print`) |
| Package manager | pnpm |
| Build | tsup |
| Test | vitest |
| Container | Docker |

## MVP Scope

### Included

- `codesage review --pr <url>` full pipeline
- `codesage review --repo <path> --base --head` local mode
- Gitee Platform Adapter (with private deployment support)
- Webhook Server for automatic PR review triggering
- PR comment writeback (summary + line-level comments)
- JSON / Markdown / Terminal report formats
- Docker deployment
- Review Skill

### Not Included (Future Iterations)

- GitHub / GitLab adapters
- Web Dashboard
- Historical report storage & trend analysis
- Custom review rules (`.codesage.yml`)
- tree-sitter AST analysis upgrade
