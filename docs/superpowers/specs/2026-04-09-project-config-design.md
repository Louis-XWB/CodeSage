# `.codesage.yml` Project-Level Configuration — Design Spec

## Overview

Add support for per-repository `.codesage.yml` configuration files that customize CodeSage review behavior per project. When a review runs, CodeSage checks the repo root for `.codesage.yml` and adjusts its review scope, focus areas, prompt, and report language accordingly. Repos without the file get the default full-scope review.

## Config File Format

```yaml
# .codesage.yml — placed in project root

language: typescript              # Project language hint for AI

focus:                            # Review priority weights
  security: high                  # high | medium | low | ignore
  performance: medium
  bug: high
  design: low
  style: ignore                   # ignore = skip entirely

include:                          # Only review files matching these globs
  - src/
  - lib/

exclude:                          # Exclude files matching these globs
  - "**/*.test.ts"
  - "**/*.spec.ts"
  - dist/
  - "*.md"

scoreThreshold: 60                # Below this score, report shows "Needs Work"
maxFiles: 30                      # Truncate to top N files by additions
reportLanguage: zh-CN             # zh-CN | en

extraPrompt: |                    # Appended to review skill prompt
  This is a Flutter project. Pay special attention to:
  - dispose() releasing resources
  - setState only after mounted check
```

## ProjectConfig Interface

```typescript
interface ProjectConfig {
  language?: string
  focus?: Record<string, 'high' | 'medium' | 'low' | 'ignore'>
  include?: string[]
  exclude?: string[]
  scoreThreshold?: number       // default: 0 (no threshold)
  maxFiles?: number             // default: unlimited
  reportLanguage?: 'zh-CN' | 'en'  // default: 'zh-CN'
  extraPrompt?: string
}
```

All fields are optional. Missing fields use defaults (full review, no filtering, Chinese report).

## Data Flow

```
Clone/fetch repo, checkout head branch
  ↓
Check <repoPath>/.codesage.yml
  ├── exists → parse YAML → ProjectConfig
  └── missing → empty ProjectConfig (all defaults)
  ↓
Filter diff files:
  1. Apply include (if set): keep only matching files
  2. Apply exclude: remove matching files
  3. Apply maxFiles: sort by additions desc, truncate
  ↓
Build dynamic prompt:
  1. Base skill (review.md content)
  2. + language hint (if set)
  3. + focus weight instructions (if set)
  4. + extraPrompt (if set)
  5. + filtered diff content
  ↓
Invoke Claude Code CLI with dynamic prompt
  ↓
Format report (reportLanguage controls label language)
  ↓
Post to PR
```

## File Changes

### New: `src/config/project-config.ts`

- `ProjectConfig` interface (as above)
- `loadProjectConfig(repoPath: string): ProjectConfig` — reads `<repoPath>/.codesage.yml`, parses with `yaml` package, returns typed config. Returns empty object if file doesn't exist.
- Validates known fields, ignores unknown fields for forward compatibility.

### New: `src/core/prompt-builder.ts`

- `buildPrompt(skillContent: string, diff: DiffResult, config: ProjectConfig): string`
- Constructs the full prompt by combining skill content, config-derived instructions, and diff summary.
- Focus weight mapping:
  - `high` → "重点关注，发现问题务必报告"
  - `medium` → "适度关注"
  - `low` → "简略关注，仅报告严重问题"
  - `ignore` → "跳过，不要报告此类问题"
- Extracted from reviewer.ts to keep reviewer focused on CLI orchestration.

### Modify: `src/core/differ.ts`

- New export: `filterDiff(diff: DiffResult, config: ProjectConfig): DiffResult`
- Uses `picomatch` for glob matching against `include` and `exclude`.
- If `maxFiles` is set and filtered files exceed it, sort by `additions` descending and take top N.
- Returns a new DiffResult with filtered files and recalculated stats.

### Modify: `src/core/reviewer.ts`

- `ReviewOptions` adds optional `projectConfig?: ProjectConfig`
- `review()` calls `filterDiff()` if config has include/exclude/maxFiles
- `review()` calls `buildPrompt()` instead of inline prompt construction
- Removes prompt building logic (moved to prompt-builder.ts)

### Modify: `src/cli/review.ts`

- After checkout, call `loadProjectConfig(repoPath)`
- Pass `projectConfig` to `reviewer.review()`

### Modify: `src/server/index.ts`

- After checkout, call `loadProjectConfig(workDir)`
- Pass `projectConfig` to `reviewer.review()`

### Modify: `src/core/reporter.ts`

- `toMarkdown()` accepts optional `reportLanguage` parameter
- When `en`: English labels ("Critical Issues", "Warnings", "Recommendations", etc.)
- When `zh-CN` (default): Chinese labels ("严重问题", "警告", "改进建议", etc.)
- Score grade labels: "Excellent"/"优秀", "Needs Work"/"待改进", etc.

### New dependency

- `yaml` — YAML parser (lightweight, zero-dep)
- `picomatch` — Glob matching

## Testing

- `project-config.test.ts` — load/parse YAML, missing file returns defaults, validates fields
- `prompt-builder.test.ts` — prompt construction with various config combinations
- `differ.test.ts` — add tests for `filterDiff` with include/exclude/maxFiles
- `reporter.test.ts` — add tests for English language labels
- Integration test — full flow with `.codesage.yml` in a test repo
