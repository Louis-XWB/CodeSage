// src/core/__tests__/differ.test.ts
import { describe, it, expect } from 'vitest'
import { parseDiff } from '../differ.js'
import { filterDiff } from '../differ.js'
import type { DiffResult } from '../../types.js'

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

describe('filterDiff', () => {
  const baseDiff: DiffResult = {
    files: [
      { path: 'src/app.ts', status: 'modified', hunks: [{ oldStart: 1, oldLines: 3, newStart: 1, newLines: 5, content: '+line1\n+line2' }] },
      { path: 'src/utils.ts', status: 'modified', hunks: [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 3, content: '+a\n+b' }] },
      { path: 'src/app.test.ts', status: 'added', hunks: [{ oldStart: 0, oldLines: 0, newStart: 1, newLines: 10, content: '+test' }] },
      { path: 'docs/readme.md', status: 'modified', hunks: [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, content: '+doc' }] },
      { path: 'dist/bundle.js', status: 'modified', hunks: [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, content: '+bundle' }] },
    ],
    stats: { additions: 16, deletions: 0, filesChanged: 5 },
  }

  it('returns all files when no include/exclude', () => {
    const result = filterDiff(baseDiff, {})
    expect(result.files).toHaveLength(5)
  })

  it('filters by include', () => {
    const result = filterDiff(baseDiff, { include: ['src/'] })
    expect(result.files.map(f => f.path)).toEqual(['src/app.ts', 'src/utils.ts', 'src/app.test.ts'])
    expect(result.stats.filesChanged).toBe(3)
  })

  it('filters by exclude', () => {
    const result = filterDiff(baseDiff, { exclude: ['**/*.test.ts', 'dist/'] })
    expect(result.files.map(f => f.path)).toEqual(['src/app.ts', 'src/utils.ts', 'docs/readme.md'])
  })

  it('applies include then exclude', () => {
    const result = filterDiff(baseDiff, { include: ['src/'], exclude: ['**/*.test.ts'] })
    expect(result.files.map(f => f.path)).toEqual(['src/app.ts', 'src/utils.ts'])
  })

  it('truncates by maxFiles sorted by additions desc', () => {
    const result = filterDiff(baseDiff, { maxFiles: 2 })
    expect(result.files).toHaveLength(2)
    expect(result.files[0].path).toBe('src/app.test.ts')
    expect(result.files[1].path).toBe('src/app.ts')
  })
})
