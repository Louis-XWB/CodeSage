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
