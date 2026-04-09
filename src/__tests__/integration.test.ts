import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { parseDiff } from '../core/differ.js'
import { toJSON, toMarkdown, toTerminal } from '../core/reporter.js'
import { parsePRUrl } from '../platforms/url-parser.js'
import { loadConfig } from '../config.js'
import type { ReviewReport, DiffResult } from '../types.js'
import { saveReview, getHistory, getRepoStats, listRepos } from '../store/history.js'
import { getDb, closeDb } from '../store/db.js'
import { loadProjectConfig } from '../config/project-config.js'
import { filterDiff } from '../core/differ.js'
import { buildPrompt } from '../core/prompt-builder.js'

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
    expect(md).toContain('Score-35')

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

describe('project config integration', () => {
  const testDir = path.join(os.tmpdir(), 'codesage-integration-cfg-' + Date.now())

  beforeEach(() => {
    fs.mkdirSync(testDir, { recursive: true })
  })

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true })
  })

  it('full flow: load config → filter diff → build prompt', () => {
    fs.writeFileSync(path.join(testDir, '.codesage.yml'), `
language: typescript
focus:
  security: high
  style: ignore
include:
  - src/
exclude:
  - "**/*.test.ts"
maxFiles: 5
extraPrompt: Check for SQL injection.
reportLanguage: en
`)

    // Load config
    const config = loadProjectConfig(testDir)
    expect(config.language).toBe('typescript')

    // Filter diff
    const diff = parseDiff(`diff --git a/src/app.ts b/src/app.ts
index abc..def 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -1,1 +1,2 @@
 existing
+new line
diff --git a/src/app.test.ts b/src/app.test.ts
new file mode 100644
index 000..abc
--- /dev/null
+++ b/src/app.test.ts
@@ -0,0 +1,1 @@
+test
diff --git a/docs/readme.md b/docs/readme.md
index abc..def 100644
--- a/docs/readme.md
+++ b/docs/readme.md
@@ -1,1 +1,2 @@
 old
+new`)

    const filtered = filterDiff(diff, config)
    // src/app.ts included, src/app.test.ts excluded, docs/readme.md not in include
    expect(filtered.files).toHaveLength(1)
    expect(filtered.files[0].path).toBe('src/app.ts')

    // Build prompt
    const prompt = buildPrompt('Base skill content.', filtered, config)
    expect(prompt).toContain('typescript')
    expect(prompt).toContain('security')
    expect(prompt).toContain('style')
    expect(prompt).toContain('跳过')
    expect(prompt).toContain('SQL injection')
    expect(prompt).toContain('src/app.ts')
    expect(prompt).not.toContain('app.test.ts')
    expect(prompt).not.toContain('readme.md')
  })
})

describe('review history integration', () => {
  const testDir = path.join(os.tmpdir(), 'codesage-hist-integ-' + Date.now())
  const dbPath = path.join(testDir, 'test.db')

  beforeEach(() => {
    fs.mkdirSync(testDir, { recursive: true })
    getDb(dbPath)
  })

  afterEach(() => {
    closeDb()
    fs.rmSync(testDir, { recursive: true, force: true })
  })

  it('full flow: save review → query history → get stats', () => {
    const report: ReviewReport = {
      summary: 'Test review',
      score: 70,
      issues: [
        { severity: 'critical', category: 'security', file: 'app.ts', title: 'Issue', description: 'Desc' },
      ],
      suggestions: [],
      metadata: { model: 'test', duration: 1000, filesReviewed: 1 },
    }
    const diff: DiffResult = {
      files: [{ path: 'app.ts', status: 'modified', hunks: [] }],
      stats: { additions: 10, deletions: 2, filesChanged: 1 },
    }

    // Save
    saveReview({ repo: 'test/repo', prNumber: 1, baseBranch: 'main', headBranch: 'feat', report, diff, blocked: true })
    saveReview({ repo: 'test/repo', prNumber: 2, report: { ...report, score: 90 }, diff, blocked: false })

    // Query
    const history = getHistory({ repo: 'test/repo' })
    expect(history).toHaveLength(2)

    // Stats
    const stats = getRepoStats('test/repo')
    expect(stats.totalReviews).toBe(2)
    expect(stats.avgScore).toBe(80)
    expect(stats.blockedCount).toBe(1)

    // List
    const repos = listRepos()
    expect(repos).toHaveLength(1)
    expect(repos[0].repo).toBe('test/repo')
  })
})
