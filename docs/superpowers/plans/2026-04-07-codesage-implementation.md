# CodeSage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an AI code review CLI + Webhook server that uses Claude Code CLI to review PRs with full project context, outputting structured reports and writing comments back to Gitee.

**Architecture:** Single TypeScript package with directory-based module separation. Core engine handles git ops, diff parsing, Claude Code CLI orchestration, and report generation. CLI and Webhook server are thin entry points that call the core. Platform adapters abstract Gitee/GitHub API differences.

**Tech Stack:** TypeScript (ESM), Node.js 18+, commander, Fastify, simple-git, vitest, tsup, pnpm

---

## File Structure

| File | Responsibility |
|------|---------------|
| `package.json` | Project metadata, dependencies, scripts |
| `tsconfig.json` | TypeScript config (ESM, strict) |
| `tsup.config.ts` | Build config — bundle to `dist/` |
| `vitest.config.ts` | Test config |
| `src/types.ts` | Shared types (ReviewReport, ReviewIssue, etc.) |
| `src/config.ts` | Config loading: env vars > config file > defaults |
| `src/core/differ.ts` | Parse unified diff into structured DiffResult |
| `src/core/git.ts` | Clone/fetch/checkout/diff via simple-git |
| `src/core/reviewer.ts` | Spawn Claude Code CLI, parse JSON output |
| `src/core/reporter.ts` | Format ReviewReport to JSON/Markdown/Terminal |
| `src/platforms/types.ts` | PlatformAdapter interface, PRInfo type |
| `src/platforms/gitee.ts` | Gitee API v5 adapter |
| `src/platforms/url-parser.ts` | Parse PR URLs into {platform, owner, repo, number} |
| `src/server/index.ts` | Fastify Webhook server + task queue |
| `src/cli/index.ts` | CLI entry point (commander) |
| `src/cli/review.ts` | `review` command implementation |
| `src/cli/config-cmd.ts` | `config` command implementation |
| `src/cli/server-cmd.ts` | `server` command implementation |
| `src/skills/review.md` | Claude Code review skill prompt |
| `Dockerfile` | Multi-stage build for Webhook server deployment |

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsup.config.ts`
- Create: `vitest.config.ts`
- Create: `src/index.ts`
- Create: `.gitignore`

- [ ] **Step 1: Initialize package.json**

```json
{
  "name": "codesage",
  "version": "0.1.0",
  "description": "AI code review engine powered by Claude Code",
  "type": "module",
  "main": "dist/index.js",
  "bin": {
    "codesage": "dist/cli/index.js"
  },
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "tsc --noEmit"
  },
  "keywords": ["code-review", "ai", "claude", "gitee", "github"],
  "author": "Novar <xuwab77@gmail.com>",
  "license": "MIT",
  "engines": {
    "node": ">=18.0.0"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run:
```bash
pnpm add commander fastify simple-git chalk
pnpm add -D typescript tsup vitest @types/node
```

- [ ] **Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 4: Create tsup.config.ts**

```typescript
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/cli/index.ts', 'src/server/index.ts'],
  format: ['esm'],
  target: 'node18',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  dts: true,
  splitting: true,
  banner: {
    js: '#!/usr/bin/env node',
  },
})
```

- [ ] **Step 5: Create vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
  },
})
```

- [ ] **Step 6: Create .gitignore**

```
node_modules/
dist/
*.tgz
.env
.DS_Store
```

- [ ] **Step 7: Create placeholder src/index.ts**

```typescript
export { type ReviewReport, type ReviewIssue, type ReviewSuggestion } from './types.js'
```

- [ ] **Step 8: Verify build setup**

Run: `pnpm build`
Expected: Build completes (may warn about missing types.ts — that's fine, created in Task 2)

- [ ] **Step 9: Commit**

```bash
git add package.json pnpm-lock.yaml tsconfig.json tsup.config.ts vitest.config.ts .gitignore src/index.ts
git commit -m "chore: scaffold project with TypeScript, tsup, vitest"
```

---

### Task 2: Shared Types

**Files:**
- Create: `src/types.ts`
- Test: `src/__tests__/types.test.ts`

- [ ] **Step 1: Write the type validation test**

```typescript
// src/__tests__/types.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/__tests__/types.test.ts`
Expected: FAIL — cannot find module '../types.js'

- [ ] **Step 3: Create src/types.ts**

```typescript
// src/types.ts

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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- src/__tests__/types.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/types.ts src/__tests__/types.test.ts src/index.ts
git commit -m "feat: add shared types for ReviewReport, DiffResult"
```

---

### Task 3: Config Module

**Files:**
- Create: `src/config.ts`
- Test: `src/__tests__/config.test.ts`

- [ ] **Step 1: Write config tests**

```typescript
// src/__tests__/config.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/__tests__/config.test.ts`
Expected: FAIL — cannot find module '../config.js'

- [ ] **Step 3: Implement src/config.ts**

```typescript
// src/config.ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- src/__tests__/config.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/config.ts src/__tests__/config.test.ts
git commit -m "feat: add config module with env var override"
```

---

### Task 4: Diff Parser

**Files:**
- Create: `src/core/differ.ts`
- Test: `src/core/__tests__/differ.test.ts`

- [ ] **Step 1: Write diff parser tests**

```typescript
// src/core/__tests__/differ.test.ts
import { describe, it, expect } from 'vitest'
import { parseDiff } from '../differ.js'

const SAMPLE_DIFF = `diff --git a/src/foo.ts b/src/foo.ts
index abc1234..def5678 100644
--- a/src/foo.ts
+++ b/src/foo.ts
@@ -10,5 +10,7 @@ function existing() {
   context line
-  old line 1
-  old line 2
+  new line 1
+  new line 2
+  new line 3
   more context
diff --git a/src/bar.ts b/src/bar.ts
new file mode 100644
index 0000000..abc1234
--- /dev/null
+++ b/src/bar.ts
@@ -0,0 +1,3 @@
+export function bar() {
+  return 'bar'
+}
diff --git a/src/old.ts b/src/old.ts
deleted file mode 100644
index abc1234..0000000
--- a/src/old.ts
+++ /dev/null
@@ -1,2 +0,0 @@
-export function old() {
-  return 'old'
-}`

describe('parseDiff', () => {
  it('parses modified, added, and deleted files', () => {
    const result = parseDiff(SAMPLE_DIFF)
    expect(result.files).toHaveLength(3)
    expect(result.files[0].path).toBe('src/foo.ts')
    expect(result.files[0].status).toBe('modified')
    expect(result.files[1].path).toBe('src/bar.ts')
    expect(result.files[1].status).toBe('added')
    expect(result.files[2].path).toBe('src/old.ts')
    expect(result.files[2].status).toBe('deleted')
  })

  it('parses hunk headers correctly', () => {
    const result = parseDiff(SAMPLE_DIFF)
    const hunk = result.files[0].hunks[0]
    expect(hunk.oldStart).toBe(10)
    expect(hunk.oldLines).toBe(5)
    expect(hunk.newStart).toBe(10)
    expect(hunk.newLines).toBe(7)
  })

  it('computes stats correctly', () => {
    const result = parseDiff(SAMPLE_DIFF)
    expect(result.stats.filesChanged).toBe(3)
    expect(result.stats.additions).toBe(6)   // 3 in foo + 3 in bar
    expect(result.stats.deletions).toBe(4)   // 2 in foo + 2 in old
  })

  it('handles empty diff', () => {
    const result = parseDiff('')
    expect(result.files).toHaveLength(0)
    expect(result.stats.filesChanged).toBe(0)
  })

  it('detects renamed files', () => {
    const renameDiff = `diff --git a/src/old-name.ts b/src/new-name.ts
similarity index 95%
rename from src/old-name.ts
rename to src/new-name.ts
index abc1234..def5678 100644
--- a/src/old-name.ts
+++ b/src/new-name.ts
@@ -1,3 +1,3 @@
-export const name = 'old'
+export const name = 'new'`
    const result = parseDiff(renameDiff)
    expect(result.files[0].status).toBe('renamed')
    expect(result.files[0].path).toBe('src/new-name.ts')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/core/__tests__/differ.test.ts`
Expected: FAIL — cannot find module '../differ.js'

- [ ] **Step 3: Implement src/core/differ.ts**

```typescript
// src/core/differ.ts
import type { DiffResult, ChangedFile, DiffHunk } from '../types.js'

export function parseDiff(raw: string): DiffResult {
  if (!raw.trim()) {
    return { files: [], stats: { additions: 0, deletions: 0, filesChanged: 0 } }
  }

  const files: ChangedFile[] = []
  // Split into per-file diffs
  const fileDiffs = raw.split(/^diff --git /m).filter(Boolean)

  for (const fileDiff of fileDiffs) {
    const lines = fileDiff.split('\n')

    // Extract file path from "a/path b/path"
    const headerMatch = lines[0].match(/a\/(.+?) b\/(.+)/)
    if (!headerMatch) continue
    const filePath = headerMatch[2]

    // Detect status
    let status: ChangedFile['status'] = 'modified'
    if (fileDiff.includes('new file mode')) {
      status = 'added'
    } else if (fileDiff.includes('deleted file mode')) {
      status = 'deleted'
    } else if (fileDiff.includes('rename from')) {
      status = 'renamed'
    }

    // Parse hunks
    const hunks: DiffHunk[] = []
    const hunkRegex = /^@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@/
    let currentHunkLines: string[] = []
    let currentHunk: Omit<DiffHunk, 'content'> | null = null

    for (const line of lines) {
      const hunkMatch = line.match(hunkRegex)
      if (hunkMatch) {
        if (currentHunk) {
          hunks.push({ ...currentHunk, content: currentHunkLines.join('\n') })
        }
        currentHunk = {
          oldStart: parseInt(hunkMatch[1], 10),
          oldLines: parseInt(hunkMatch[2] || '0', 10),
          newStart: parseInt(hunkMatch[3], 10),
          newLines: parseInt(hunkMatch[4] || '0', 10),
        }
        currentHunkLines = [line]
      } else if (currentHunk && (line.startsWith('+') || line.startsWith('-') || line.startsWith(' '))) {
        currentHunkLines.push(line)
      }
    }
    if (currentHunk) {
      hunks.push({ ...currentHunk, content: currentHunkLines.join('\n') })
    }

    files.push({ path: filePath, status, hunks })
  }

  // Compute stats
  let additions = 0
  let deletions = 0
  for (const file of files) {
    for (const hunk of file.hunks) {
      for (const line of hunk.content.split('\n')) {
        if (line.startsWith('+') && !line.startsWith('+++') && !line.startsWith('@')) additions++
        if (line.startsWith('-') && !line.startsWith('---') && !line.startsWith('@')) deletions++
      }
    }
  }

  return {
    files,
    stats: { additions, deletions, filesChanged: files.length },
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- src/core/__tests__/differ.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/core/differ.ts src/core/__tests__/differ.test.ts
git commit -m "feat: add diff parser with hunk extraction"
```

---

### Task 5: Git Service

**Files:**
- Create: `src/core/git.ts`
- Test: `src/core/__tests__/git.test.ts`

- [ ] **Step 1: Write git service tests**

```typescript
// src/core/__tests__/git.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { GitService } from '../git.js'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { execSync } from 'node:child_process'

describe('GitService', () => {
  const testDir = path.join(os.tmpdir(), 'codesage-git-test-' + Date.now())
  const repoDir = path.join(testDir, 'repo')
  const workDir = path.join(testDir, 'work')

  beforeEach(() => {
    // Create a bare-like test repo with commits
    fs.mkdirSync(repoDir, { recursive: true })
    execSync('git init', { cwd: repoDir })
    execSync('git config user.email "test@test.com"', { cwd: repoDir })
    execSync('git config user.name "Test"', { cwd: repoDir })
    fs.writeFileSync(path.join(repoDir, 'file.txt'), 'initial content\n')
    execSync('git add . && git commit -m "initial"', { cwd: repoDir })
    // Create a feature branch with changes
    execSync('git checkout -b feature', { cwd: repoDir })
    fs.writeFileSync(path.join(repoDir, 'file.txt'), 'modified content\n')
    fs.writeFileSync(path.join(repoDir, 'new-file.txt'), 'new content\n')
    execSync('git add . && git commit -m "feature changes"', { cwd: repoDir })
    execSync('git checkout main || git checkout master', { cwd: repoDir })
  })

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true })
  })

  it('clones a repo', async () => {
    const git = new GitService()
    await git.cloneOrFetch(repoDir, workDir)
    expect(fs.existsSync(path.join(workDir, '.git'))).toBe(true)
    expect(fs.existsSync(path.join(workDir, 'file.txt'))).toBe(true)
  })

  it('fetches when repo already cloned', async () => {
    const git = new GitService()
    await git.cloneOrFetch(repoDir, workDir)
    // Second call should fetch, not fail
    await git.cloneOrFetch(repoDir, workDir)
    expect(fs.existsSync(path.join(workDir, 'file.txt'))).toBe(true)
  })

  it('checks out a branch', async () => {
    const git = new GitService()
    await git.cloneOrFetch(repoDir, workDir)
    await git.checkout(workDir, 'feature')
    const content = fs.readFileSync(path.join(workDir, 'file.txt'), 'utf-8')
    expect(content).toBe('modified content\n')
  })

  it('gets diff between branches', async () => {
    const git = new GitService()
    await git.cloneOrFetch(repoDir, workDir)
    const diff = await git.getDiff(workDir, 'main', 'feature')
    expect(diff).toContain('modified content')
    expect(diff).toContain('new-file.txt')
  })

  it('gets changed file list', async () => {
    const git = new GitService()
    await git.cloneOrFetch(repoDir, workDir)
    const files = await git.getChangedFiles(workDir, 'main', 'feature')
    expect(files).toContain('file.txt')
    expect(files).toContain('new-file.txt')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/core/__tests__/git.test.ts`
Expected: FAIL — cannot find module '../git.js'

- [ ] **Step 3: Implement src/core/git.ts**

```typescript
// src/core/git.ts
import simpleGit, { type SimpleGit } from 'simple-git'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import os from 'node:os'

export class GitService {
  private getGit(cwd: string): SimpleGit {
    return simpleGit(cwd)
  }

  getWorkDir(repoUrl: string): string {
    const hash = crypto.createHash('sha256').update(repoUrl).digest('hex').slice(0, 12)
    return path.join(os.homedir(), '.codesage', 'repos', hash)
  }

  async cloneOrFetch(repoUrl: string, workDir: string): Promise<void> {
    if (fs.existsSync(path.join(workDir, '.git'))) {
      const git = this.getGit(workDir)
      await git.fetch(['--all', '--prune'])
    } else {
      fs.mkdirSync(workDir, { recursive: true })
      await simpleGit().clone(repoUrl, workDir)
    }
  }

  async checkout(workDir: string, branch: string): Promise<void> {
    const git = this.getGit(workDir)
    await git.checkout(branch)
  }

  async getDiff(workDir: string, base: string, head: string): Promise<string> {
    const git = this.getGit(workDir)
    return git.diff([`${base}...${head}`])
  }

  async getFileContent(workDir: string, filePath: string, ref: string): Promise<string> {
    const git = this.getGit(workDir)
    return git.show([`${ref}:${filePath}`])
  }

  async getChangedFiles(workDir: string, base: string, head: string): Promise<string[]> {
    const git = this.getGit(workDir)
    const result = await git.diff(['--name-only', `${base}...${head}`])
    return result.split('\n').filter(Boolean)
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- src/core/__tests__/git.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/core/git.ts src/core/__tests__/git.test.ts
git commit -m "feat: add git service with clone, fetch, diff"
```

---

### Task 6: Reporter (JSON / Markdown / Terminal)

**Files:**
- Create: `src/core/reporter.ts`
- Test: `src/core/__tests__/reporter.test.ts`

- [ ] **Step 1: Write reporter tests**

```typescript
// src/core/__tests__/reporter.test.ts
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
      expect(md).toContain('72/100')
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/core/__tests__/reporter.test.ts`
Expected: FAIL — cannot find module '../reporter.js'

- [ ] **Step 3: Implement src/core/reporter.ts**

```typescript
// src/core/reporter.ts
import type { ReviewReport, ReviewIssue } from '../types.js'
import chalk from 'chalk'

export function toJSON(report: ReviewReport): string {
  return JSON.stringify(report, null, 2)
}

export function toMarkdown(report: ReviewReport): string {
  const lines: string[] = []

  lines.push('# CodeSage Review Report')
  lines.push('')
  lines.push(`**Score:** ${report.score}/100`)
  lines.push('')
  lines.push(`**Summary:** ${report.summary}`)
  lines.push('')

  // Group issues by severity
  const severityOrder: ReviewIssue['severity'][] = ['critical', 'warning', 'info']
  const severityEmoji: Record<string, string> = {
    critical: '🔴',
    warning: '🟡',
    info: '🔵',
  }

  for (const severity of severityOrder) {
    const issues = report.issues.filter((i) => i.severity === severity)
    if (issues.length === 0) continue

    lines.push(`## ${severityEmoji[severity]} ${severity.charAt(0).toUpperCase() + severity.slice(1)} (${issues.length})`)
    lines.push('')

    for (const issue of issues) {
      const location = issue.line ? `${issue.file}:${issue.line}` : issue.file
      lines.push(`### ${issue.title}`)
      lines.push(`**File:** \`${location}\` | **Category:** ${issue.category}`)
      lines.push('')
      lines.push(issue.description)
      if (issue.suggestion) {
        lines.push('')
        lines.push(`**Suggestion:** ${issue.suggestion}`)
      }
      lines.push('')
    }
  }

  if (report.suggestions.length > 0) {
    lines.push('## Suggestions')
    lines.push('')
    for (const s of report.suggestions) {
      lines.push(`- **${s.title}:** ${s.description}`)
    }
    lines.push('')
  }

  lines.push('---')
  lines.push(`*Reviewed by ${report.metadata.model} in ${(report.metadata.duration / 1000).toFixed(1)}s | ${report.metadata.filesReviewed} files reviewed*`)

  return lines.join('\n')
}

export function toTerminal(report: ReviewReport): string {
  const lines: string[] = []

  const scoreColor = report.score >= 80 ? chalk.green : report.score >= 60 ? chalk.yellow : chalk.red
  lines.push(`${chalk.bold('CodeSage Review')}  ${scoreColor(report.score + '/100')}`)
  lines.push('')
  lines.push(report.summary)
  lines.push('')

  const severityStyle: Record<string, (s: string) => string> = {
    critical: chalk.red.bold,
    warning: chalk.yellow,
    info: chalk.blue,
  }

  for (const issue of report.issues) {
    const style = severityStyle[issue.severity]
    const location = issue.line ? `${issue.file}:${issue.line}` : issue.file
    lines.push(`  ${style(`[${issue.severity.toUpperCase()}]`)} ${issue.title}`)
    lines.push(`    ${chalk.dim(location)} (${issue.category})`)
    lines.push(`    ${issue.description}`)
    if (issue.suggestion) {
      lines.push(`    ${chalk.green('→')} ${issue.suggestion}`)
    }
    lines.push('')
  }

  if (report.suggestions.length > 0) {
    lines.push(chalk.bold('Suggestions:'))
    for (const s of report.suggestions) {
      lines.push(`  • ${s.title}: ${s.description}`)
    }
    lines.push('')
  }

  lines.push(chalk.dim(`${report.metadata.model} | ${(report.metadata.duration / 1000).toFixed(1)}s | ${report.metadata.filesReviewed} files`))

  return lines.join('\n')
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- src/core/__tests__/reporter.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/core/reporter.ts src/core/__tests__/reporter.test.ts
git commit -m "feat: add reporter with JSON, Markdown, terminal output"
```

---

### Task 7: Review Skill

**Files:**
- Create: `src/skills/review.md`

- [ ] **Step 1: Create the review skill**

```markdown
你是一个高级代码审查专家。请对以下 PR 变更进行全面审查。

## 你的工作方式

1. 首先阅读下面提供的 diff 信息，了解变更范围
2. 使用 Read、Glob、Grep 工具主动探索工程上下文：
   - 查看被修改函数的调用方和被调用方
   - 检查相关的类型定义和接口
   - 理解变更在整个系统中的影响范围
3. 基于完整上下文给出审查意见

## 审查维度

1. **Bug 风险** — 逻辑错误、边界条件、空指针、竞态条件
2. **安全风险** — 注入、XSS、敏感信息泄露、权限问题
3. **性能问题** — N+1 查询、内存泄漏、不必要的计算
4. **设计质量** — 职责划分、耦合度、可维护性
5. **代码风格** — 命名、一致性（仅影响可读性的问题）

## 审查原则

- 只关注本次变更引入的问题，不审查已有代码
- 区分严重程度：critical（必须修复）、warning（建议修复）、info（可选改进）
- 给出具体的修复建议，不要只说"这里有问题"
- 如果代码质量很好，也要在 summary 中肯定

## 输出格式

必须严格输出以下 JSON 格式，不要输出其他任何内容（不要 markdown code fence，直接输出纯 JSON）：

{
  "summary": "对本次变更的整体评价，2-3句话",
  "score": 85,
  "issues": [
    {
      "severity": "critical | warning | info",
      "category": "bug | security | performance | style | design",
      "file": "src/example.ts",
      "line": 42,
      "title": "简短描述问题",
      "description": "详细描述问题原因和影响",
      "suggestion": "具体的修复建议"
    }
  ],
  "suggestions": [
    {
      "title": "改进建议标题",
      "description": "具体描述"
    }
  ]
}
```

- [ ] **Step 2: Commit**

```bash
git add src/skills/review.md
git commit -m "feat: add Claude Code review skill prompt"
```

---

### Task 8: Reviewer (Claude Code CLI Orchestration)

**Files:**
- Create: `src/core/reviewer.ts`
- Test: `src/core/__tests__/reviewer.test.ts`

- [ ] **Step 1: Write reviewer tests**

```typescript
// src/core/__tests__/reviewer.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Reviewer } from '../reviewer.js'
import type { DiffResult, ReviewReport } from '../../types.js'

// Mock child_process.spawn
vi.mock('node:child_process', () => {
  const { EventEmitter } = require('node:events')
  const { Readable } = require('node:stream')

  return {
    spawn: vi.fn(() => {
      const proc = new EventEmitter()

      const validReport: ReviewReport = {
        summary: 'Good PR',
        score: 90,
        issues: [],
        suggestions: [],
        metadata: { model: 'claude-sonnet-4-6', duration: 5000, filesReviewed: 2 },
      }
      const stdout = Readable.from([JSON.stringify(validReport)])
      const stderr = Readable.from([''])
      proc.stdout = stdout
      proc.stderr = stderr

      // Emit close in next tick
      setTimeout(() => proc.emit('close', 0), 10)
      return proc
    }),
  }
})

describe('Reviewer', () => {
  const sampleDiff: DiffResult = {
    files: [
      { path: 'src/foo.ts', status: 'modified', hunks: [] },
    ],
    stats: { additions: 5, deletions: 2, filesChanged: 1 },
  }

  it('calls claude CLI and parses JSON output', async () => {
    const reviewer = new Reviewer()
    const report = await reviewer.review({
      repoPath: '/tmp/test-repo',
      diff: sampleDiff,
      skillPath: '/path/to/review.md',
    })
    expect(report.score).toBe(90)
    expect(report.summary).toBe('Good PR')
  })

  it('passes correct arguments to claude CLI', async () => {
    const { spawn } = await import('node:child_process')
    const reviewer = new Reviewer()
    await reviewer.review({
      repoPath: '/tmp/test-repo',
      diff: sampleDiff,
      skillPath: '/path/to/review.md',
    })

    expect(spawn).toHaveBeenCalledWith(
      'claude',
      expect.arrayContaining(['--print']),
      expect.objectContaining({
        cwd: '/tmp/test-repo',
      }),
    )
  })

  it('includes env overrides when provided', async () => {
    const { spawn } = await import('node:child_process')
    const reviewer = new Reviewer()
    await reviewer.review({
      repoPath: '/tmp/test-repo',
      diff: sampleDiff,
      skillPath: '/path/to/review.md',
      env: { ANTHROPIC_BASE_URL: 'https://custom.api.com' },
    })

    expect(spawn).toHaveBeenCalledWith(
      'claude',
      expect.any(Array),
      expect.objectContaining({
        env: expect.objectContaining({
          ANTHROPIC_BASE_URL: 'https://custom.api.com',
        }),
      }),
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/core/__tests__/reviewer.test.ts`
Expected: FAIL — cannot find module '../reviewer.js'

- [ ] **Step 3: Implement src/core/reviewer.ts**

```typescript
// src/core/reviewer.ts
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { DiffResult, ReviewReport } from '../types.js'

export interface ReviewOptions {
  repoPath: string
  diff: DiffResult
  skillPath?: string
  env?: Record<string, string>
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_SKILL = path.resolve(__dirname, '..', 'skills', 'review.md')

export class Reviewer {
  async review(options: ReviewOptions): Promise<ReviewReport> {
    const { repoPath, diff, env } = options
    const skillPath = options.skillPath ?? DEFAULT_SKILL

    const diffSummary = this.buildDiffSummary(diff)

    const prompt = `Review this PR.\n\nChanged files:\n${diffSummary}`

    const args = [
      '--print',
      '--allowedTools', 'Read,Glob,Grep',
      '-p', prompt,
    ]

    const output = await this.spawnClaude(args, repoPath, env)
    return this.parseOutput(output)
  }

  private buildDiffSummary(diff: DiffResult): string {
    const lines: string[] = []
    lines.push(`Files changed: ${diff.stats.filesChanged} (+${diff.stats.additions} -${diff.stats.deletions})`)
    lines.push('')
    for (const file of diff.files) {
      lines.push(`[${file.status}] ${file.path}`)
      for (const hunk of file.hunks) {
        lines.push(hunk.content)
      }
      lines.push('')
    }
    return lines.join('\n')
  }

  private spawnClaude(args: string[], cwd: string, extraEnv?: Record<string, string>): Promise<string> {
    return new Promise((resolve, reject) => {
      const proc = spawn('claude', args, {
        cwd,
        env: { ...process.env, ...extraEnv },
      })

      let stdout = ''
      let stderr = ''

      proc.stdout.on('data', (data: Buffer) => {
        stdout += data.toString()
      })

      proc.stderr.on('data', (data: Buffer) => {
        stderr += data.toString()
      })

      proc.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`claude exited with code ${code}: ${stderr}`))
        } else {
          resolve(stdout)
        }
      })

      proc.on('error', (err) => {
        reject(new Error(`Failed to spawn claude: ${err.message}`))
      })
    })
  }

  private parseOutput(raw: string): ReviewReport {
    // Try to extract JSON from the output — Claude may wrap it in markdown fences
    let jsonStr = raw.trim()

    // Strip markdown code fences if present
    const jsonMatch = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/)
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim()
    }

    // Try to find JSON object boundaries
    const startIdx = jsonStr.indexOf('{')
    const endIdx = jsonStr.lastIndexOf('}')
    if (startIdx !== -1 && endIdx !== -1) {
      jsonStr = jsonStr.slice(startIdx, endIdx + 1)
    }

    const parsed = JSON.parse(jsonStr)

    // Validate required fields
    if (typeof parsed.summary !== 'string' || typeof parsed.score !== 'number') {
      throw new Error('Invalid review output: missing summary or score')
    }

    return {
      summary: parsed.summary,
      score: parsed.score,
      issues: parsed.issues ?? [],
      suggestions: parsed.suggestions ?? [],
      metadata: parsed.metadata ?? {
        model: 'unknown',
        duration: 0,
        filesReviewed: 0,
      },
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- src/core/__tests__/reviewer.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/core/reviewer.ts src/core/__tests__/reviewer.test.ts
git commit -m "feat: add reviewer with Claude Code CLI orchestration"
```

---

### Task 9: PR URL Parser

**Files:**
- Create: `src/platforms/url-parser.ts`
- Test: `src/platforms/__tests__/url-parser.test.ts`

- [ ] **Step 1: Write URL parser tests**

```typescript
// src/platforms/__tests__/url-parser.test.ts
import { describe, it, expect } from 'vitest'
import { parsePRUrl } from '../url-parser.js'

describe('parsePRUrl', () => {
  it('parses Gitee PR URL', () => {
    const result = parsePRUrl('https://gitee.com/myorg/myrepo/pulls/42')
    expect(result).toEqual({
      platform: 'gitee',
      baseUrl: 'https://gitee.com',
      owner: 'myorg',
      repo: 'myrepo',
      number: 42,
    })
  })

  it('parses Gitee private deployment URL', () => {
    const result = parsePRUrl('https://gitee.mycompany.com/team/project/pulls/7')
    expect(result).toEqual({
      platform: 'gitee',
      baseUrl: 'https://gitee.mycompany.com',
      owner: 'team',
      repo: 'project',
      number: 7,
    })
  })

  it('parses GitHub PR URL', () => {
    const result = parsePRUrl('https://github.com/owner/repo/pull/123')
    expect(result).toEqual({
      platform: 'github',
      baseUrl: 'https://github.com',
      owner: 'owner',
      repo: 'repo',
      number: 123,
    })
  })

  it('throws on invalid URL', () => {
    expect(() => parsePRUrl('https://example.com/not-a-pr')).toThrow()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/platforms/__tests__/url-parser.test.ts`
Expected: FAIL — cannot find module '../url-parser.js'

- [ ] **Step 3: Implement src/platforms/url-parser.ts**

```typescript
// src/platforms/url-parser.ts

export interface ParsedPRUrl {
  platform: 'gitee' | 'github'
  baseUrl: string
  owner: string
  repo: string
  number: number
}

export function parsePRUrl(url: string): ParsedPRUrl {
  const parsed = new URL(url)
  const parts = parsed.pathname.split('/').filter(Boolean)

  // GitHub: /owner/repo/pull/123
  if (parsed.hostname === 'github.com' || parts[2] === 'pull') {
    if (parts.length >= 4 && parts[2] === 'pull') {
      return {
        platform: 'github',
        baseUrl: `${parsed.protocol}//${parsed.host}`,
        owner: parts[0],
        repo: parts[1],
        number: parseInt(parts[3], 10),
      }
    }
  }

  // Gitee: /owner/repo/pulls/123
  if (parts.length >= 4 && parts[2] === 'pulls') {
    return {
      platform: 'gitee',
      baseUrl: `${parsed.protocol}//${parsed.host}`,
      owner: parts[0],
      repo: parts[1],
      number: parseInt(parts[3], 10),
    }
  }

  throw new Error(`Cannot parse PR URL: ${url}. Expected format: https://<host>/<owner>/<repo>/pulls/<number>`)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- src/platforms/__tests__/url-parser.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/platforms/url-parser.ts src/platforms/__tests__/url-parser.test.ts
git commit -m "feat: add PR URL parser for Gitee and GitHub"
```

---

### Task 10: Platform Adapter — Types & Gitee

**Files:**
- Create: `src/platforms/types.ts`
- Create: `src/platforms/gitee.ts`
- Test: `src/platforms/__tests__/gitee.test.ts`

- [ ] **Step 1: Create platform types**

```typescript
// src/platforms/types.ts

export interface PRInfo {
  title: string
  description: string
  baseBranch: string
  headBranch: string
  repoCloneUrl: string
  author: string
  files: string[]
}

export interface PlatformAdapter {
  getPRInfo(owner: string, repo: string, number: number): Promise<PRInfo>
  postComment(owner: string, repo: string, number: number, body: string): Promise<void>
  postLineComment(
    owner: string,
    repo: string,
    number: number,
    file: string,
    line: number,
    body: string,
  ): Promise<void>
}
```

- [ ] **Step 2: Write Gitee adapter tests**

```typescript
// src/platforms/__tests__/gitee.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GiteeAdapter } from '../gitee.js'

// Mock global fetch
const mockFetch = vi.fn()
global.fetch = mockFetch

describe('GiteeAdapter', () => {
  const adapter = new GiteeAdapter({
    baseUrl: 'https://gitee.com',
    token: 'test-token',
  })

  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('getPRInfo calls correct API endpoint', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        title: 'Fix bug',
        body: 'Fixes #123',
        base: { ref: 'main', repo: { clone_url: 'https://gitee.com/org/repo.git' } },
        head: { ref: 'fix/bug' },
        user: { login: 'developer' },
      }),
    }).mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { filename: 'src/foo.ts' },
        { filename: 'src/bar.ts' },
      ],
    })

    const info = await adapter.getPRInfo('org', 'repo', 123)
    expect(info.title).toBe('Fix bug')
    expect(info.baseBranch).toBe('main')
    expect(info.headBranch).toBe('fix/bug')
    expect(info.files).toEqual(['src/foo.ts', 'src/bar.ts'])
    expect(mockFetch).toHaveBeenCalledWith(
      'https://gitee.com/api/v5/repos/org/repo/pulls/123',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'token test-token',
        }),
      }),
    )
  })

  it('postComment calls correct API endpoint', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) })

    await adapter.postComment('org', 'repo', 123, 'Great PR!')
    expect(mockFetch).toHaveBeenCalledWith(
      'https://gitee.com/api/v5/repos/org/repo/pulls/123/comments',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ body: 'Great PR!' }),
      }),
    )
  })

  it('throws on API error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      text: async () => 'Not found',
    })

    await expect(adapter.getPRInfo('org', 'repo', 999)).rejects.toThrow('Gitee API error: 404')
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm test -- src/platforms/__tests__/gitee.test.ts`
Expected: FAIL — cannot find module '../gitee.js'

- [ ] **Step 4: Implement src/platforms/gitee.ts**

```typescript
// src/platforms/gitee.ts
import type { PlatformAdapter, PRInfo } from './types.js'

export interface GiteeConfig {
  baseUrl: string
  token: string
}

export class GiteeAdapter implements PlatformAdapter {
  private baseUrl: string
  private token: string

  constructor(config: GiteeConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '')
    this.token = config.token
  }

  private get headers(): Record<string, string> {
    return {
      Authorization: `token ${this.token}`,
      'Content-Type': 'application/json',
    }
  }

  private apiUrl(path: string): string {
    return `${this.baseUrl}/api/v5${path}`
  }

  private async request(url: string, options?: RequestInit): Promise<Response> {
    const res = await fetch(url, {
      ...options,
      headers: { ...this.headers, ...options?.headers },
    })
    if (!res.ok) {
      throw new Error(`Gitee API error: ${res.status} ${res.statusText}`)
    }
    return res
  }

  async getPRInfo(owner: string, repo: string, number: number): Promise<PRInfo> {
    const prRes = await this.request(this.apiUrl(`/repos/${owner}/${repo}/pulls/${number}`))
    const pr = await prRes.json()

    const filesRes = await this.request(this.apiUrl(`/repos/${owner}/${repo}/pulls/${number}/files`))
    const files = await filesRes.json()

    return {
      title: pr.title,
      description: pr.body ?? '',
      baseBranch: pr.base.ref,
      headBranch: pr.head.ref,
      repoCloneUrl: pr.base.repo.clone_url,
      author: pr.user.login,
      files: files.map((f: { filename: string }) => f.filename),
    }
  }

  async postComment(owner: string, repo: string, number: number, body: string): Promise<void> {
    await this.request(this.apiUrl(`/repos/${owner}/${repo}/pulls/${number}/comments`), {
      method: 'POST',
      body: JSON.stringify({ body }),
    })
  }

  async postLineComment(
    owner: string,
    repo: string,
    number: number,
    file: string,
    line: number,
    body: string,
  ): Promise<void> {
    await this.request(this.apiUrl(`/repos/${owner}/${repo}/pulls/${number}/comments`), {
      method: 'POST',
      body: JSON.stringify({
        body,
        path: file,
        position: line,
      }),
    })
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm test -- src/platforms/__tests__/gitee.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add src/platforms/types.ts src/platforms/gitee.ts src/platforms/__tests__/gitee.test.ts
git commit -m "feat: add platform adapter interface and Gitee implementation"
```

---

### Task 11: CLI — Review Command

**Files:**
- Create: `src/cli/index.ts`
- Create: `src/cli/review.ts`
- Create: `src/cli/config-cmd.ts`
- Test: `src/cli/__tests__/review.test.ts`

- [ ] **Step 1: Write review command test**

```typescript
// src/cli/__tests__/review.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/cli/__tests__/review.test.ts`
Expected: FAIL — cannot find module '../review.js'

- [ ] **Step 3: Implement src/cli/review.ts**

```typescript
// src/cli/review.ts
import type { GitService } from '../core/git.js'
import type { Reviewer } from '../core/reviewer.js'
import type { DiffResult, ReviewReport } from '../types.js'
import type { PlatformAdapter } from '../platforms/types.js'
import { parsePRUrl } from '../platforms/url-parser.js'
import { parseDiff } from '../core/differ.js'
import { toJSON, toMarkdown, toTerminal } from '../core/reporter.js'
import { loadConfig } from '../config.js'
import { GiteeAdapter } from '../platforms/gitee.js'
import fs from 'node:fs'

interface ReviewDeps {
  gitService: GitService
  reviewer: Reviewer
  parseDiff?: (raw: string) => DiffResult
}

export interface ReviewCommandOptions {
  pr?: string
  repo?: string
  base?: string
  head?: string
  format?: 'json' | 'markdown' | 'terminal'
  output?: string
  comment?: boolean
}

export function buildReviewAction(deps: ReviewDeps) {
  return async (options: ReviewCommandOptions) => {
    const config = loadConfig()
    const { gitService, reviewer } = deps
    const diffParser = deps.parseDiff ?? parseDiff

    let owner: string
    let repo: string
    let prNumber: number
    let repoPath: string
    let baseBranch: string
    let headBranch: string
    let adapter: PlatformAdapter | null = null

    if (options.pr) {
      // PR URL mode
      const parsed = parsePRUrl(options.pr)
      owner = parsed.owner
      repo = parsed.repo
      prNumber = parsed.number

      if (parsed.platform === 'gitee') {
        adapter = new GiteeAdapter({
          baseUrl: parsed.baseUrl,
          token: config.giteeToken,
        })
      }

      const prInfo = await adapter!.getPRInfo(owner, repo, prNumber)
      repoPath = gitService.getWorkDir(prInfo.repoCloneUrl)
      baseBranch = prInfo.baseBranch
      headBranch = prInfo.headBranch

      await gitService.cloneOrFetch(prInfo.repoCloneUrl, repoPath)
    } else if (options.repo && options.base && options.head) {
      // Local mode
      repoPath = options.repo
      baseBranch = options.base
      headBranch = options.head
      owner = ''
      repo = ''
      prNumber = 0
    } else {
      throw new Error('Provide --pr <url> or --repo with --base and --head')
    }

    // Checkout head branch and get diff
    await gitService.checkout(repoPath, headBranch)
    const rawDiff = await gitService.getDiff(repoPath, baseBranch, headBranch)
    const diff = diffParser(rawDiff)

    // Run review
    const report = await reviewer.review({
      repoPath,
      diff,
      env: config.apiBaseUrl !== 'https://api.anthropic.com'
        ? { ANTHROPIC_BASE_URL: config.apiBaseUrl, ANTHROPIC_AUTH_TOKEN: config.apiToken }
        : undefined,
    })

    // Format output
    const format = options.format ?? config.defaultFormat
    let formatted: string
    switch (format) {
      case 'json':
        formatted = toJSON(report)
        break
      case 'markdown':
        formatted = toMarkdown(report)
        break
      default:
        formatted = toTerminal(report)
    }

    // Write to file or stdout
    if (options.output) {
      fs.writeFileSync(options.output, formatted + '\n')
      console.log(`Report written to ${options.output}`)
    } else {
      console.log(formatted)
    }

    // Writeback to PR
    if (options.comment && adapter) {
      const markdown = toMarkdown(report)
      await adapter.postComment(owner, repo, prNumber, markdown)

      // Post line-level comments for critical/warning issues
      for (const issue of report.issues) {
        if ((issue.severity === 'critical' || issue.severity === 'warning') && issue.line) {
          const body = `**[${issue.severity.toUpperCase()}]** ${issue.title}\n\n${issue.description}${issue.suggestion ? `\n\n**Suggestion:** ${issue.suggestion}` : ''}`
          await adapter.postLineComment(owner, repo, prNumber, issue.file, issue.line, body)
        }
      }

      console.log('Review comments posted to PR.')
    }

    return report
  }
}
```

- [ ] **Step 4: Implement src/cli/config-cmd.ts**

```typescript
// src/cli/config-cmd.ts
import { getConfigPath, loadConfig, saveConfig } from '../config.js'

export function configGet(key: string): void {
  const config = loadConfig()
  const value = (config as Record<string, unknown>)[key]
  if (value === undefined) {
    console.error(`Unknown config key: ${key}`)
    process.exit(1)
  }
  console.log(value)
}

export function configSet(key: string, value: string): void {
  const configPath = getConfigPath()
  saveConfig(configPath, { [key]: value })
  console.log(`Set ${key} = ${value}`)
}
```

- [ ] **Step 5: Implement src/cli/index.ts**

```typescript
#!/usr/bin/env node
// src/cli/index.ts
import { Command } from 'commander'
import { GitService } from '../core/git.js'
import { Reviewer } from '../core/reviewer.js'
import { buildReviewAction } from './review.js'
import { configGet, configSet } from './config-cmd.js'

const program = new Command()

program
  .name('codesage')
  .description('AI code review engine powered by Claude Code')
  .version('0.1.0')

program
  .command('review')
  .description('Review a PR or local branch diff')
  .option('--pr <url>', 'PR URL to review (Gitee/GitHub)')
  .option('--repo <path>', 'Local repository path')
  .option('--base <branch>', 'Base branch for comparison')
  .option('--head <branch>', 'Head branch to review')
  .option('--format <type>', 'Output format: json, markdown, terminal', 'terminal')
  .option('--output <file>', 'Write report to file')
  .option('--comment', 'Post review as PR comment')
  .action(async (options) => {
    try {
      const action = buildReviewAction({
        gitService: new GitService(),
        reviewer: new Reviewer(),
      })
      await action(options)
    } catch (err) {
      console.error(`Error: ${(err as Error).message}`)
      process.exit(1)
    }
  })

const configCmd = program
  .command('config')
  .description('Manage configuration')

configCmd
  .command('get <key>')
  .description('Get a config value')
  .action(configGet)

configCmd
  .command('set <key> <value>')
  .description('Set a config value')
  .action(configSet)

program.parse()
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm test -- src/cli/__tests__/review.test.ts`
Expected: PASS (1 test)

- [ ] **Step 7: Verify build**

Run: `pnpm build`
Expected: Build succeeds, `dist/cli/index.js` exists

- [ ] **Step 8: Commit**

```bash
git add src/cli/index.ts src/cli/review.ts src/cli/config-cmd.ts src/cli/__tests__/review.test.ts
git commit -m "feat: add CLI with review and config commands"
```

---

### Task 12: Webhook Server

**Files:**
- Create: `src/server/index.ts`
- Create: `src/server/queue.ts`
- Test: `src/server/__tests__/server.test.ts`

- [ ] **Step 1: Write server and queue tests**

```typescript
// src/server/__tests__/server.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { TaskQueue } from '../queue.js'

describe('TaskQueue', () => {
  it('processes tasks in order', async () => {
    const results: number[] = []
    const queue = new TaskQueue(1)

    queue.enqueue(async () => { results.push(1) })
    queue.enqueue(async () => { results.push(2) })
    queue.enqueue(async () => { results.push(3) })

    // Wait for all tasks to complete
    await queue.drain()
    expect(results).toEqual([1, 2, 3])
  })

  it('respects concurrency limit', async () => {
    let concurrent = 0
    let maxConcurrent = 0
    const queue = new TaskQueue(2)

    for (let i = 0; i < 5; i++) {
      queue.enqueue(async () => {
        concurrent++
        maxConcurrent = Math.max(maxConcurrent, concurrent)
        await new Promise((r) => setTimeout(r, 50))
        concurrent--
      })
    }

    await queue.drain()
    expect(maxConcurrent).toBeLessThanOrEqual(2)
  })

  it('handles task errors without stopping the queue', async () => {
    const results: string[] = []
    const queue = new TaskQueue(1)

    queue.enqueue(async () => { results.push('ok1') })
    queue.enqueue(async () => { throw new Error('fail') })
    queue.enqueue(async () => { results.push('ok2') })

    await queue.drain()
    expect(results).toEqual(['ok1', 'ok2'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/server/__tests__/server.test.ts`
Expected: FAIL — cannot find module '../queue.js'

- [ ] **Step 3: Implement src/server/queue.ts**

```typescript
// src/server/queue.ts

type Task = () => Promise<void>

export class TaskQueue {
  private queue: Task[] = []
  private running = 0
  private concurrency: number
  private drainResolvers: (() => void)[] = []

  constructor(concurrency: number) {
    this.concurrency = concurrency
  }

  enqueue(task: Task): void {
    this.queue.push(task)
    this.process()
  }

  async drain(): Promise<void> {
    if (this.running === 0 && this.queue.length === 0) return
    return new Promise((resolve) => {
      this.drainResolvers.push(resolve)
    })
  }

  private async process(): Promise<void> {
    while (this.running < this.concurrency && this.queue.length > 0) {
      const task = this.queue.shift()!
      this.running++
      task()
        .catch((err) => {
          console.error('Task failed:', err.message)
        })
        .finally(() => {
          this.running--
          if (this.queue.length > 0) {
            this.process()
          } else if (this.running === 0) {
            for (const resolve of this.drainResolvers) {
              resolve()
            }
            this.drainResolvers = []
          }
        })
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- src/server/__tests__/server.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Implement src/server/index.ts**

```typescript
// src/server/index.ts
import Fastify from 'fastify'
import crypto from 'node:crypto'
import { GitService } from '../core/git.js'
import { Reviewer } from '../core/reviewer.js'
import { parseDiff } from '../core/differ.js'
import { toMarkdown } from '../core/reporter.js'
import { GiteeAdapter } from '../platforms/gitee.js'
import { loadConfig } from '../config.js'
import { TaskQueue } from './queue.js'

export async function createServer(port = 3000) {
  const app = Fastify({ logger: true })
  const config = loadConfig()
  const queue = new TaskQueue(2)
  const gitService = new GitService()
  const reviewer = new Reviewer()

  app.get('/health', async () => ({ status: 'ok' }))

  app.post('/webhook/gitee', async (request, reply) => {
    const body = request.body as Record<string, unknown>
    const hookName = request.headers['x-gitee-event'] as string

    // Only handle PR events
    if (hookName !== 'Merge Request Hook') {
      return reply.code(200).send({ message: 'ignored' })
    }

    const action = (body as Record<string, unknown>).action as string
    if (!['open', 'update'].includes(action)) {
      return reply.code(200).send({ message: 'ignored' })
    }

    const pr = (body as Record<string, unknown>).pull_request as Record<string, unknown>
    const repository = (body as Record<string, unknown>).repository as Record<string, unknown>
    const fullName = repository.full_name as string
    const [owner, repo] = fullName.split('/')
    const prNumber = pr.number as number
    const baseBranch = ((pr.base as Record<string, unknown>).ref) as string
    const headBranch = ((pr.head as Record<string, unknown>).ref) as string
    const cloneUrl = repository.clone_url as string

    // Enqueue review task
    queue.enqueue(async () => {
      try {
        const adapter = new GiteeAdapter({
          baseUrl: config.giteeBaseUrl,
          token: config.giteeToken,
        })

        const workDir = gitService.getWorkDir(cloneUrl)
        await gitService.cloneOrFetch(cloneUrl, workDir)
        await gitService.checkout(workDir, headBranch)
        const rawDiff = await gitService.getDiff(workDir, baseBranch, headBranch)
        const diff = parseDiff(rawDiff)

        const report = await reviewer.review({
          repoPath: workDir,
          diff,
          env: config.apiBaseUrl !== 'https://api.anthropic.com'
            ? { ANTHROPIC_BASE_URL: config.apiBaseUrl, ANTHROPIC_AUTH_TOKEN: config.apiToken }
            : undefined,
        })

        // Post summary comment
        const markdown = toMarkdown(report)
        await adapter.postComment(owner, repo, prNumber, markdown)

        // Post line comments for critical/warning issues
        for (const issue of report.issues) {
          if ((issue.severity === 'critical' || issue.severity === 'warning') && issue.line) {
            const commentBody = `**[${issue.severity.toUpperCase()}]** ${issue.title}\n\n${issue.description}${issue.suggestion ? `\n\n**Suggestion:** ${issue.suggestion}` : ''}`
            await adapter.postLineComment(owner, repo, prNumber, issue.file, issue.line, commentBody)
          }
        }

        app.log.info(`Review completed for ${owner}/${repo}#${prNumber}: score ${report.score}`)
      } catch (err) {
        app.log.error(`Review failed for ${owner}/${repo}#${prNumber}: ${(err as Error).message}`)
      }
    })

    return reply.code(202).send({ message: 'review queued' })
  })

  await app.listen({ port, host: '0.0.0.0' })
  return app
}

// Allow running directly
if (process.argv[1]?.endsWith('server/index.js')) {
  const port = parseInt(process.env.PORT ?? '3000', 10)
  createServer(port)
}
```

- [ ] **Step 6: Add `server` command to CLI**

Create `src/cli/server-cmd.ts`:

```typescript
// src/cli/server-cmd.ts
import { createServer } from '../server/index.js'

export async function startServer(options: { port?: string }): Promise<void> {
  const port = parseInt(options.port ?? '3000', 10)
  console.log(`Starting CodeSage webhook server on port ${port}...`)
  await createServer(port)
}
```

Add to `src/cli/index.ts` — append before `program.parse()`:

```typescript
import { startServer } from './server-cmd.js'

program
  .command('server')
  .description('Start webhook server')
  .option('--port <port>', 'Server port', '3000')
  .action(startServer)
```

- [ ] **Step 7: Run all tests**

Run: `pnpm test`
Expected: All tests pass

- [ ] **Step 8: Commit**

```bash
git add src/server/index.ts src/server/queue.ts src/server/__tests__/server.test.ts src/cli/server-cmd.ts src/cli/index.ts
git commit -m "feat: add webhook server with task queue and Gitee integration"
```

---

### Task 13: Dockerfile

**Files:**
- Create: `Dockerfile`
- Create: `.dockerignore`

- [ ] **Step 1: Create .dockerignore**

```
node_modules
dist
.git
*.md
```

- [ ] **Step 2: Create Dockerfile**

```dockerfile
FROM node:18-slim AS builder

RUN npm install -g pnpm

WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY tsconfig.json tsup.config.ts ./
COPY src/ src/
RUN pnpm build

FROM node:18-slim

# Install Claude Code CLI
RUN npm install -g @anthropic-ai/claude-code

WORKDIR /app
COPY --from=builder /app/dist dist/
COPY --from=builder /app/node_modules node_modules/
COPY --from=builder /app/package.json .
COPY src/skills/ dist/skills/

ENV PORT=3000
EXPOSE 3000

CMD ["node", "dist/server/index.js"]
```

- [ ] **Step 3: Commit**

```bash
git add Dockerfile .dockerignore
git commit -m "feat: add Dockerfile for webhook server deployment"
```

---

### Task 14: Integration Smoke Test & Final Wiring

**Files:**
- Create: `src/__tests__/integration.test.ts`
- Modify: `src/index.ts`
- Modify: `tsup.config.ts`

- [ ] **Step 1: Write integration smoke test**

```typescript
// src/__tests__/integration.test.ts
import { describe, it, expect } from 'vitest'
import { parseDiff } from '../core/differ.js'
import { toJSON, toMarkdown, toTerminal } from '../core/reporter.js'
import { parsePRUrl } from '../platforms/url-parser.js'
import { loadConfig } from '../config.js'
import type { ReviewReport } from '../types.js'

describe('integration smoke test', () => {
  it('full pipeline: diff → report → format', () => {
    // 1. Parse a diff
    const rawDiff = `diff --git a/src/app.ts b/src/app.ts
index abc..def 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -1,3 +1,5 @@
 import express from 'express'
+import { db } from './db'
 const app = express()
+app.get('/users', (req, res) => res.json(db.query(\`SELECT * FROM users WHERE id = \${req.query.id}\`)))
 app.listen(3000)`

    const diff = parseDiff(rawDiff)
    expect(diff.files).toHaveLength(1)
    expect(diff.stats.additions).toBe(2)

    // 2. Construct a report (simulating Claude Code output)
    const report: ReviewReport = {
      summary: 'SQL injection vulnerability detected in user endpoint.',
      score: 35,
      issues: [
        {
          severity: 'critical',
          category: 'security',
          file: 'src/app.ts',
          line: 4,
          title: 'SQL injection',
          description: 'User input directly interpolated into SQL query.',
          suggestion: 'Use parameterized queries: db.query("SELECT * FROM users WHERE id = ?", [req.query.id])',
        },
      ],
      suggestions: [],
      metadata: { model: 'claude-sonnet-4-6', duration: 8000, filesReviewed: 1 },
    }

    // 3. Format in all three formats
    const json = toJSON(report)
    expect(JSON.parse(json).score).toBe(35)

    const md = toMarkdown(report)
    expect(md).toContain('SQL injection')
    expect(md).toContain('35/100')

    const term = toTerminal(report)
    expect(term).toContain('35')
    expect(term).toContain('CRITICAL')
  })

  it('PR URL parsing works end-to-end', () => {
    const parsed = parsePRUrl('https://gitee.com/myorg/myrepo/pulls/42')
    expect(parsed.platform).toBe('gitee')
    expect(parsed.number).toBe(42)
  })

  it('config loads defaults', () => {
    const config = loadConfig('/nonexistent/path.json')
    expect(config.platform).toBe('gitee')
    expect(config.defaultFormat).toBe('terminal')
  })
})
```

- [ ] **Step 2: Update src/index.ts with public exports**

```typescript
// src/index.ts
export type { ReviewReport, ReviewIssue, ReviewSuggestion, DiffResult, ChangedFile, DiffHunk } from './types.js'
export { parseDiff } from './core/differ.js'
export { GitService } from './core/git.js'
export { Reviewer } from './core/reviewer.js'
export { toJSON, toMarkdown, toTerminal } from './core/reporter.js'
export { loadConfig, saveConfig, getConfigPath } from './config.js'
export { parsePRUrl } from './platforms/url-parser.js'
export { GiteeAdapter } from './platforms/gitee.js'
export type { PlatformAdapter, PRInfo } from './platforms/types.js'
```

- [ ] **Step 3: Fix tsup.config.ts banner to only apply to CLI entry**

```typescript
import { defineConfig } from 'tsup'

export default defineConfig([
  {
    entry: ['src/cli/index.ts'],
    format: ['esm'],
    target: 'node18',
    outDir: 'dist',
    clean: true,
    sourcemap: true,
    splitting: true,
    banner: { js: '#!/usr/bin/env node' },
  },
  {
    entry: ['src/server/index.ts', 'src/index.ts'],
    format: ['esm'],
    target: 'node18',
    outDir: 'dist',
    sourcemap: true,
    dts: true,
    splitting: true,
  },
])
```

- [ ] **Step 4: Run all tests**

Run: `pnpm test`
Expected: All tests pass

- [ ] **Step 5: Verify build**

Run: `pnpm build`
Expected: Build succeeds

- [ ] **Step 6: Commit**

```bash
git add src/__tests__/integration.test.ts src/index.ts tsup.config.ts
git commit -m "feat: add integration tests and finalize public exports"
```

---

## Execution Order Summary

| Task | Component | Depends On |
|------|-----------|------------|
| 1 | Project Scaffolding | — |
| 2 | Shared Types | 1 |
| 3 | Config Module | 1 |
| 4 | Diff Parser | 2 |
| 5 | Git Service | 1 |
| 6 | Reporter | 2 |
| 7 | Review Skill | — |
| 8 | Reviewer | 2, 4 |
| 9 | PR URL Parser | — |
| 10 | Gitee Platform Adapter | 9 |
| 11 | CLI | 3, 4, 5, 6, 8, 10 |
| 12 | Webhook Server | 3, 4, 5, 6, 8, 10 |
| 13 | Dockerfile | 12 |
| 14 | Integration Test | all |

**Parallelizable:** Tasks 2-7 can run in parallel after Task 1. Tasks 9-10 can run in parallel with 2-8.
