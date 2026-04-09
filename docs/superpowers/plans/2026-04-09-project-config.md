# `.codesage.yml` Project Config Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-repository `.codesage.yml` support so each project can customize review focus, file scope, prompt, and report language.

**Architecture:** New `project-config.ts` module loads YAML config from repo root. New `prompt-builder.ts` generates dynamic prompts from config + skill + diff. Existing `differ.ts` gets a `filterDiff` function. Reviewer, CLI, and server wire it all together.

**Tech Stack:** yaml (YAML parsing), picomatch (glob matching)

---

## File Structure

| File | Responsibility |
|------|---------------|
| `src/config/project-config.ts` | `ProjectConfig` type + `loadProjectConfig()` — read and parse `.codesage.yml` |
| `src/core/prompt-builder.ts` | `buildPrompt()` — assemble skill + config instructions + diff into prompt |
| `src/core/differ.ts` | Add `filterDiff()` — filter files by include/exclude/maxFiles |
| `src/core/reviewer.ts` | Accept `projectConfig`, use prompt-builder and filterDiff |
| `src/core/reporter.ts` | Add `reportLanguage` param to `toMarkdown()` for i18n labels |
| `src/cli/review.ts` | Load project config after checkout, pass to reviewer |
| `src/server/index.ts` | Load project config after checkout, pass to reviewer |

---

### Task 1: Install Dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install yaml and picomatch**

Run:
```bash
pnpm add yaml picomatch
pnpm add -D @types/picomatch
```

- [ ] **Step 2: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add yaml and picomatch dependencies"
```

---

### Task 2: Project Config Loader

**Files:**
- Create: `src/config/project-config.ts`
- Test: `src/config/__tests__/project-config.test.ts`

- [ ] **Step 1: Write tests**

```typescript
// src/config/__tests__/project-config.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { loadProjectConfig, type ProjectConfig } from '../project-config.js'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

describe('loadProjectConfig', () => {
  const testDir = path.join(os.tmpdir(), 'codesage-projcfg-' + Date.now())

  beforeEach(() => {
    fs.mkdirSync(testDir, { recursive: true })
  })

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true })
  })

  it('returns empty config when no .codesage.yml exists', () => {
    const config = loadProjectConfig(testDir)
    expect(config).toEqual({})
  })

  it('parses a full .codesage.yml', () => {
    fs.writeFileSync(path.join(testDir, '.codesage.yml'), `
language: typescript
focus:
  security: high
  performance: medium
  style: ignore
include:
  - src/
exclude:
  - "**/*.test.ts"
scoreThreshold: 60
maxFiles: 20
reportLanguage: en
extraPrompt: |
  Check for XSS vulnerabilities.
`)
    const config = loadProjectConfig(testDir)
    expect(config.language).toBe('typescript')
    expect(config.focus?.security).toBe('high')
    expect(config.focus?.style).toBe('ignore')
    expect(config.include).toEqual(['src/'])
    expect(config.exclude).toEqual(['**/*.test.ts'])
    expect(config.scoreThreshold).toBe(60)
    expect(config.maxFiles).toBe(20)
    expect(config.reportLanguage).toBe('en')
    expect(config.extraPrompt).toContain('XSS')
  })

  it('handles partial config', () => {
    fs.writeFileSync(path.join(testDir, '.codesage.yml'), `
language: dart
extraPrompt: Focus on dispose calls.
`)
    const config = loadProjectConfig(testDir)
    expect(config.language).toBe('dart')
    expect(config.extraPrompt).toContain('dispose')
    expect(config.focus).toBeUndefined()
    expect(config.include).toBeUndefined()
  })

  it('ignores unknown fields', () => {
    fs.writeFileSync(path.join(testDir, '.codesage.yml'), `
language: go
unknownField: value
anotherOne: 123
`)
    const config = loadProjectConfig(testDir)
    expect(config.language).toBe('go')
    expect((config as Record<string, unknown>).unknownField).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/config/__tests__/project-config.test.ts`
Expected: FAIL — cannot find module

- [ ] **Step 3: Implement**

```typescript
// src/config/project-config.ts
import fs from 'node:fs'
import path from 'node:path'
import { parse as parseYaml } from 'yaml'

export type FocusLevel = 'high' | 'medium' | 'low' | 'ignore'

export interface ProjectConfig {
  language?: string
  focus?: Record<string, FocusLevel>
  include?: string[]
  exclude?: string[]
  scoreThreshold?: number
  maxFiles?: number
  reportLanguage?: 'zh-CN' | 'en'
  extraPrompt?: string
}

const KNOWN_KEYS = new Set([
  'language', 'focus', 'include', 'exclude',
  'scoreThreshold', 'maxFiles', 'reportLanguage', 'extraPrompt',
])

export function loadProjectConfig(repoPath: string): ProjectConfig {
  const configPath = path.join(repoPath, '.codesage.yml')

  if (!fs.existsSync(configPath)) {
    return {}
  }

  const raw = fs.readFileSync(configPath, 'utf-8')
  const parsed = parseYaml(raw) ?? {}

  const config: ProjectConfig = {}

  if (typeof parsed.language === 'string') config.language = parsed.language
  if (parsed.focus && typeof parsed.focus === 'object') config.focus = parsed.focus
  if (Array.isArray(parsed.include)) config.include = parsed.include
  if (Array.isArray(parsed.exclude)) config.exclude = parsed.exclude
  if (typeof parsed.scoreThreshold === 'number') config.scoreThreshold = parsed.scoreThreshold
  if (typeof parsed.maxFiles === 'number') config.maxFiles = parsed.maxFiles
  if (parsed.reportLanguage === 'zh-CN' || parsed.reportLanguage === 'en') config.reportLanguage = parsed.reportLanguage
  if (typeof parsed.extraPrompt === 'string') config.extraPrompt = parsed.extraPrompt

  return config
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- src/config/__tests__/project-config.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/config/project-config.ts src/config/__tests__/project-config.test.ts
git commit -m "feat: add .codesage.yml project config loader"
```

---

### Task 3: Diff Filter

**Files:**
- Modify: `src/core/differ.ts`
- Test: `src/core/__tests__/differ.test.ts` (add new tests)

- [ ] **Step 1: Write filterDiff tests**

Append to `src/core/__tests__/differ.test.ts`:

```typescript
import { filterDiff } from '../differ.js'
import type { DiffResult } from '../../types.js'

// ... existing tests above ...

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
    // app.test.ts has 10 additions (highest), app.ts has 5
    expect(result.files).toHaveLength(2)
    expect(result.files[0].path).toBe('src/app.test.ts')
    expect(result.files[1].path).toBe('src/app.ts')
  })
})
```

- [ ] **Step 2: Run test to verify new tests fail**

Run: `pnpm test -- src/core/__tests__/differ.test.ts`
Expected: FAIL — filterDiff is not exported

- [ ] **Step 3: Implement filterDiff**

Add to `src/core/differ.ts`:

```typescript
import picomatch from 'picomatch'
import type { ProjectConfig } from '../config/project-config.js'

// ... existing parseDiff function ...

export function filterDiff(diff: DiffResult, config: Pick<ProjectConfig, 'include' | 'exclude' | 'maxFiles'>): DiffResult {
  let files = [...diff.files]

  // Apply include filter
  if (config.include && config.include.length > 0) {
    const matchers = config.include.map(p => {
      // "src/" should match "src/anything"
      const pattern = p.endsWith('/') ? `${p}**` : p
      return picomatch(pattern)
    })
    files = files.filter(f => matchers.some(m => m(f.path)))
  }

  // Apply exclude filter
  if (config.exclude && config.exclude.length > 0) {
    const matchers = config.exclude.map(p => {
      const pattern = p.endsWith('/') ? `${p}**` : p
      return picomatch(pattern)
    })
    files = files.filter(f => !matchers.some(m => m(f.path)))
  }

  // Apply maxFiles — sort by additions descending
  if (config.maxFiles && files.length > config.maxFiles) {
    files.sort((a, b) => {
      const aAdds = a.hunks.reduce((sum, h) => sum + h.newLines, 0)
      const bAdds = b.hunks.reduce((sum, h) => sum + h.newLines, 0)
      return bAdds - aAdds
    })
    files = files.slice(0, config.maxFiles)
  }

  // Recalculate stats
  let additions = 0
  let deletions = 0
  for (const file of files) {
    for (const hunk of file.hunks) {
      let hunkAdds = 0
      let hunkDels = 0
      for (const line of hunk.content.split('\n')) {
        if (line.startsWith('+') && !line.startsWith('+++')) hunkAdds++
        if (line.startsWith('-') && !line.startsWith('---')) hunkDels++
      }
      additions += Math.min(hunkAdds, hunk.newLines)
      deletions += Math.min(hunkDels, hunk.oldLines)
    }
  }

  return { files, stats: { additions, deletions, filesChanged: files.length } }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- src/core/__tests__/differ.test.ts`
Expected: All tests PASS (10 tests: 5 existing + 5 new)

- [ ] **Step 5: Commit**

```bash
git add src/core/differ.ts src/core/__tests__/differ.test.ts
git commit -m "feat: add filterDiff with include/exclude/maxFiles support"
```

---

### Task 4: Prompt Builder

**Files:**
- Create: `src/core/prompt-builder.ts`
- Test: `src/core/__tests__/prompt-builder.test.ts`

- [ ] **Step 1: Write tests**

```typescript
// src/core/__tests__/prompt-builder.test.ts
import { describe, it, expect } from 'vitest'
import { buildPrompt } from '../prompt-builder.js'
import type { DiffResult } from '../../types.js'

const SKILL = '你是一个高级代码审查专家。'
const DIFF: DiffResult = {
  files: [{ path: 'src/app.ts', status: 'modified', hunks: [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 2, content: '+new line' }] }],
  stats: { additions: 1, deletions: 0, filesChanged: 1 },
}

describe('buildPrompt', () => {
  it('builds basic prompt without config', () => {
    const prompt = buildPrompt(SKILL, DIFF, {})
    expect(prompt).toContain('你是一个高级代码审查专家。')
    expect(prompt).toContain('src/app.ts')
    expect(prompt).toContain('+new line')
  })

  it('includes language hint', () => {
    const prompt = buildPrompt(SKILL, DIFF, { language: 'dart' })
    expect(prompt).toContain('dart')
  })

  it('includes focus instructions', () => {
    const prompt = buildPrompt(SKILL, DIFF, {
      focus: { security: 'high', style: 'ignore', performance: 'low' },
    })
    expect(prompt).toContain('security')
    expect(prompt).toContain('重点关注')
    expect(prompt).toContain('style')
    expect(prompt).toContain('跳过')
    expect(prompt).toContain('performance')
  })

  it('includes extraPrompt', () => {
    const prompt = buildPrompt(SKILL, DIFF, { extraPrompt: 'Check dispose calls.' })
    expect(prompt).toContain('Check dispose calls.')
  })

  it('combines all sections', () => {
    const prompt = buildPrompt(SKILL, DIFF, {
      language: 'typescript',
      focus: { bug: 'high' },
      extraPrompt: 'Watch for null checks.',
    })
    expect(prompt).toContain('typescript')
    expect(prompt).toContain('bug')
    expect(prompt).toContain('Watch for null checks.')
    expect(prompt).toContain('src/app.ts')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/core/__tests__/prompt-builder.test.ts`
Expected: FAIL — cannot find module

- [ ] **Step 3: Implement**

```typescript
// src/core/prompt-builder.ts
import type { DiffResult } from '../types.js'
import type { ProjectConfig, FocusLevel } from '../config/project-config.js'

const FOCUS_LABELS: Record<FocusLevel, string> = {
  high: '重点关注，发现问题务必报告',
  medium: '适度关注',
  low: '简略关注，仅报告严重问题',
  ignore: '跳过，不要报告此类问题',
}

export function buildPrompt(skillContent: string, diff: DiffResult, config: ProjectConfig): string {
  const sections: string[] = []

  // Base skill
  sections.push(skillContent)

  // Config-derived instructions
  const configInstructions: string[] = []

  if (config.language) {
    configInstructions.push(`这是一个 ${config.language} 项目。`)
  }

  if (config.focus) {
    const focusLines = Object.entries(config.focus)
      .map(([category, level]) => `  - ${category}: ${FOCUS_LABELS[level]}`)
      .join('\n')
    configInstructions.push(`审查重点调整：\n${focusLines}`)
  }

  if (config.extraPrompt) {
    configInstructions.push(`项目特定要求：\n${config.extraPrompt.trim()}`)
  }

  if (configInstructions.length > 0) {
    sections.push('---\n\n## 项目配置\n\n' + configInstructions.join('\n\n'))
  }

  // Diff summary
  const diffLines: string[] = []
  diffLines.push(`Files changed: ${diff.stats.filesChanged} (+${diff.stats.additions} -${diff.stats.deletions})`)
  diffLines.push('')
  for (const file of diff.files) {
    diffLines.push(`[${file.status}] ${file.path}`)
    for (const hunk of file.hunks) {
      diffLines.push(hunk.content)
    }
    diffLines.push('')
  }

  sections.push('---\n\n以下是本次 PR 的变更内容：\n\n' + diffLines.join('\n'))

  return sections.join('\n\n')
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- src/core/__tests__/prompt-builder.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/core/prompt-builder.ts src/core/__tests__/prompt-builder.test.ts
git commit -m "feat: add prompt builder with language, focus, extraPrompt support"
```

---

### Task 5: Reporter i18n

**Files:**
- Modify: `src/core/reporter.ts`
- Test: `src/core/__tests__/reporter.test.ts` (add new tests)

- [ ] **Step 1: Write i18n test**

Append to `src/core/__tests__/reporter.test.ts`:

```typescript
// ... existing tests ...

describe('toMarkdown i18n', () => {
  it('uses Chinese labels by default', () => {
    const md = toMarkdown(SAMPLE_REPORT)
    expect(md).toContain('Critical Issues')  // default is zh-CN but section headers use English currently
  })

  it('uses English labels when reportLanguage is en', () => {
    const md = toMarkdown(SAMPLE_REPORT, 'en')
    expect(md).toContain('Critical Issues')
    expect(md).toContain('Recommendations')
  })

  it('uses Chinese labels when reportLanguage is zh-CN', () => {
    const md = toMarkdown(SAMPLE_REPORT, 'zh-CN')
    expect(md).toContain('严重问题')
    expect(md).toContain('改进建议')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/core/__tests__/reporter.test.ts`
Expected: FAIL — toMarkdown doesn't accept second argument

- [ ] **Step 3: Implement i18n in reporter**

Modify `src/core/reporter.ts` — change `toMarkdown` signature and add i18n labels:

```typescript
type ReportLanguage = 'zh-CN' | 'en'

const i18n: Record<ReportLanguage, Record<string, string>> = {
  'zh-CN': {
    subtitle: 'AI 代码审查报告',
    summary: '📋 概要',
    dashboard: '📊 问题总览',
    critical: '严重问题',
    criticalDesc: '合并前必须修复',
    criticalStatus: '🚫 阻断',
    warning: '警告',
    warningDesc: '建议修复',
    warningStatus: '⚠️ 需审查',
    info: '建议',
    infoDesc: '可选改进',
    infoStatus: '💬 可选',
    recommendations: '📝 改进建议',
    footer: '开源 AI 代码审查',
    category: '类别',
    count: '数量',
    status: '状态',
    fix: '💡 修复建议：',
    filesAnalyzed: '个文件已分析',
  },
  en: {
    subtitle: 'AI-Powered Code Review Report',
    summary: '📋 Summary',
    dashboard: '📊 Issue Dashboard',
    critical: 'Critical Issues',
    criticalDesc: 'Must fix before merge',
    criticalStatus: '🚫 Blocking',
    warning: 'Warnings',
    warningDesc: 'Should fix',
    warningStatus: '⚠️ Review',
    info: 'Suggestions',
    infoDesc: 'Nice to have',
    infoStatus: '💬 Optional',
    recommendations: '📝 Recommendations',
    footer: 'Open Source AI Code Review',
    category: 'Category',
    count: 'Count',
    status: 'Status',
    fix: '💡 Fix:',
    filesAnalyzed: 'files analyzed',
  },
}

export function toMarkdown(report: ReviewReport, reportLanguage?: ReportLanguage): string {
  const lang = reportLanguage ?? 'zh-CN'
  const t = i18n[lang]
  // ... rest of function uses t.xxx instead of hardcoded strings ...
```

Replace all hardcoded English strings in `toMarkdown` with `t.xxx` references. Key replacements:
- `'AI-Powered Code Review Report'` → `t.subtitle`
- `'📋 Summary'` → `t.summary`
- `'📊 Issue Dashboard'` → `t.dashboard`
- `'Critical Issues'` → `t.critical`
- `'Must fix before merge'` → `t.criticalDesc`
- `'Warnings'` → `t.warning`
- `'Suggestions'` (info section) → `t.info`
- `'📝 Recommendations'` → `t.recommendations`
- `'💡 Fix:'` → `t.fix`
- `'files analyzed'` → `t.filesAnalyzed`
- Dashboard table headers: `Category` → `t.category`, `Count` → `t.count`, `Status` → `t.status`

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- src/core/__tests__/reporter.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/reporter.ts src/core/__tests__/reporter.test.ts
git commit -m "feat: add i18n support to markdown reporter (zh-CN/en)"
```

---

### Task 6: Wire Into Reviewer

**Files:**
- Modify: `src/core/reviewer.ts`
- Modify: `src/core/__tests__/reviewer.test.ts`

- [ ] **Step 1: Update reviewer test**

Add a new test to `src/core/__tests__/reviewer.test.ts`:

```typescript
import type { ProjectConfig } from '../../config/project-config.js'

// ... existing tests ...

it('passes projectConfig to prompt builder', async () => {
  const { spawn } = await import('node:child_process')
  const reviewer = new Reviewer()
  const projectConfig: ProjectConfig = {
    language: 'dart',
    focus: { security: 'high' },
    extraPrompt: 'Check dispose calls.',
  }
  await reviewer.review({
    repoPath: '/tmp/test-repo',
    diff: sampleDiff,
    skillPath: REAL_SKILL,
    projectConfig,
  })

  // Verify the prompt passed to claude contains config-derived content
  const spawnCall = (spawn as ReturnType<typeof vi.fn>).mock.calls.at(-1)
  const args = spawnCall?.[0] === 'claude' ? spawnCall[1] : []
  const promptArg = args[args.indexOf('-p') + 1] as string
  expect(promptArg).toContain('dart')
  expect(promptArg).toContain('security')
  expect(promptArg).toContain('Check dispose calls.')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/core/__tests__/reviewer.test.ts`
Expected: FAIL — projectConfig not in ReviewOptions

- [ ] **Step 3: Update reviewer.ts**

```typescript
// Updated imports at top of reviewer.ts
import { buildPrompt } from './prompt-builder.js'
import { filterDiff } from './differ.js'
import type { ProjectConfig } from '../config/project-config.js'

// Updated ReviewOptions
export interface ReviewOptions {
  repoPath: string
  diff: DiffResult
  skillPath?: string
  env?: Record<string, string>
  projectConfig?: ProjectConfig
}

// Updated review() method
async review(options: ReviewOptions): Promise<ReviewReport> {
  const { repoPath, env, projectConfig } = options
  const skillPath = options.skillPath ?? DEFAULT_SKILL

  const skillContent = fs.readFileSync(skillPath, 'utf-8')

  // Filter diff if config has include/exclude/maxFiles
  const diff = projectConfig ? filterDiff(options.diff, projectConfig) : options.diff

  // Build prompt using prompt-builder
  const prompt = buildPrompt(skillContent, diff, projectConfig ?? {})

  const args = [
    '--print',
    '--allowedTools', 'Read,Glob,Grep',
    '-p', prompt,
  ]

  const output = await this.spawnClaude(args, repoPath, env)
  return this.parseOutput(output)
}
```

Remove the `buildDiffSummary` private method (now handled by prompt-builder).

- [ ] **Step 4: Run all tests**

Run: `pnpm test`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/reviewer.ts src/core/__tests__/reviewer.test.ts
git commit -m "feat: wire projectConfig into reviewer via prompt-builder and filterDiff"
```

---

### Task 7: Wire Into CLI and Server

**Files:**
- Modify: `src/cli/review.ts`
- Modify: `src/server/index.ts`

- [ ] **Step 1: Update CLI review.ts**

Add import at top:
```typescript
import { loadProjectConfig } from '../config/project-config.js'
```

After the checkout line (`await gitService.checkout(repoPath, headBranch)`), add:
```typescript
// Load project-level config
const projectConfig = loadProjectConfig(repoPath)
```

Update the `reviewer.review()` call to include `projectConfig`:
```typescript
const report = await reviewer.review({
  repoPath,
  diff,
  projectConfig,
  env: config.apiBaseUrl !== 'https://api.anthropic.com'
    ? { ANTHROPIC_BASE_URL: config.apiBaseUrl, ANTHROPIC_AUTH_TOKEN: config.apiToken }
    : undefined,
})
```

Update `toMarkdown` calls to pass `reportLanguage`:
```typescript
// In format switch:
case 'markdown':
  formatted = toMarkdown(report, projectConfig.reportLanguage)
  break

// In comment writeback:
const markdown = toMarkdown(report, projectConfig.reportLanguage)
```

- [ ] **Step 2: Update server/index.ts**

Add import at top:
```typescript
import { loadProjectConfig } from '../config/project-config.js'
```

After the checkout line (`await gitService.checkout(workDir, headBranch)`), add:
```typescript
const projectConfig = loadProjectConfig(workDir)
```

Update the `reviewer.review()` call to include `projectConfig`:
```typescript
const report = await reviewer.review({
  repoPath: workDir,
  diff,
  projectConfig,
  env: config.apiBaseUrl !== 'https://api.anthropic.com'
    ? { ANTHROPIC_BASE_URL: config.apiBaseUrl, ANTHROPIC_AUTH_TOKEN: config.apiToken }
    : undefined,
})
```

Update `toMarkdown` call to pass `reportLanguage`:
```typescript
const markdown = toMarkdown(report, projectConfig.reportLanguage)
```

- [ ] **Step 3: Run all tests**

Run: `pnpm test`
Expected: All tests PASS

- [ ] **Step 4: Build and verify**

Run: `pnpm build`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add src/cli/review.ts src/server/index.ts
git commit -m "feat: load .codesage.yml in CLI and webhook server"
```

---

### Task 8: Integration Test

**Files:**
- Modify: `src/__tests__/integration.test.ts`

- [ ] **Step 1: Add integration test**

Append to `src/__tests__/integration.test.ts`:

```typescript
import { loadProjectConfig } from '../config/project-config.js'
import { filterDiff } from '../core/differ.js'
import { buildPrompt } from '../core/prompt-builder.js'

// ... existing tests ...

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
```

Add the required imports at the top of integration.test.ts:
```typescript
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { loadProjectConfig } from '../config/project-config.js'
import { filterDiff } from '../core/differ.js'
import { buildPrompt } from '../core/prompt-builder.js'
```

- [ ] **Step 2: Run all tests**

Run: `pnpm test`
Expected: All tests PASS

- [ ] **Step 3: Build**

Run: `pnpm build`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add src/__tests__/integration.test.ts
git commit -m "feat: add integration test for .codesage.yml full flow"
```

---

## Execution Order

| Task | Component | Depends On |
|------|-----------|------------|
| 1 | Install deps | — |
| 2 | Project config loader | 1 |
| 3 | Diff filter | 1, 2 (imports ProjectConfig type) |
| 4 | Prompt builder | 2 (imports ProjectConfig type) |
| 5 | Reporter i18n | — |
| 6 | Wire into reviewer | 2, 3, 4 |
| 7 | Wire into CLI + server | 2, 5, 6 |
| 8 | Integration test | all |

**Parallelizable:** Tasks 3, 4, 5 can run in parallel after Task 2.
