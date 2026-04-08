# CodeSage

[English](README.md) | [中文](README.zh-CN.md)

AI code review engine powered by Claude Code. Full-project-aware review for Pull Requests — not just diffs.

Unlike traditional diff-based review tools, CodeSage leverages Claude Code CLI to explore your entire codebase — reading files, searching for references, and understanding call chains — before providing structured review feedback.

## Features

- **Full-project review** — Goes beyond diff, explores references and call chains across the entire codebase
- **Gitee-first** — First-class support for Gitee (including private/enterprise deployments), with a platform-agnostic architecture
- **CLI + Webhook** — Review PRs manually from the terminal or automatically via webhook on PR creation/update
- **Structured reports** — JSON / Markdown / Terminal output with score, severity levels, categories, and fix suggestions
- **PR comment writeback** — Posts review summary and line-level comments directly to your PR
- **Multi-model** — Switch AI providers via config: Claude, DeepSeek, BigModel (zhipu), OpenRouter, or any Anthropic-compatible API

## Quick Start

### Install

```bash
git clone https://github.com/Louis-XWB/CodeSage.git
cd CodeSage
pnpm install
pnpm build
npm link
```

### Configure

```bash
# AI provider (default: Anthropic Claude)
codesage config set apiBaseUrl "https://api.anthropic.com"
codesage config set apiToken "your-api-key"

# Or use BigModel (zhipu), DeepSeek, etc.
codesage config set apiBaseUrl "https://open.bigmodel.cn/api/anthropic"
codesage config set apiToken "your-bigmodel-key"

# Gitee token (required for PR review and comment writeback)
codesage config set giteeToken "your-gitee-token"

# For private/enterprise Gitee deployments
codesage config set giteeBaseUrl "https://gitee.your-company.com"
```

Config is stored locally at `~/.codesage/config.json` — never committed to git.

You can also use environment variables (they take priority over config file):

```bash
export CODESAGE_API_BASE_URL="https://open.bigmodel.cn/api/anthropic"
export CODESAGE_API_TOKEN="your-key"
export CODESAGE_GITEE_TOKEN="your-token"
export CODESAGE_GITEE_BASE_URL="https://gitee.your-company.com"
```

### Review a PR

```bash
# Review a Gitee PR
codesage review --pr https://gitee.com/org/repo/pulls/123

# Review and post comments back to the PR
codesage review --pr https://gitee.com/org/repo/pulls/123 --comment

# Review a local branch diff (no Gitee token needed)
codesage review --repo /path/to/repo --base main --head feature/xyz

# Output as JSON
codesage review --pr https://gitee.com/org/repo/pulls/123 --format json

# Save report to file
codesage review --pr https://gitee.com/org/repo/pulls/123 --output report.md --format markdown
```

### Webhook Server (Auto-review on PR)

Start a server that automatically reviews PRs when they are created or updated:

```bash
codesage server --port 3000
```

Then configure your Gitee repository webhook:

1. Go to your repo **Settings > Webhooks**
2. Set URL to `http://your-server-ip:3000/webhook/gitee`
3. Select **Pull Request** events
4. Save

Every new or updated PR will be automatically reviewed, and comments will be posted back to the PR.

### Docker

```bash
docker build -t codesage .
docker run -p 3000:3000 \
  -e CODESAGE_API_BASE_URL=https://open.bigmodel.cn/api/anthropic \
  -e CODESAGE_API_TOKEN=your-api-key \
  -e CODESAGE_GITEE_TOKEN=your-gitee-token \
  -e CODESAGE_GITEE_BASE_URL=https://gitee.your-company.com \
  codesage
```

## How It Works

```
User/CI ──→ CLI ──→ Core Engine ──→ Claude Code CLI ──→ Structured Report
                        ↑                                    ↓
Gitee Webhook ──→ Server ──→ Core Engine            Platform Adapter
                                                         ↓
                                                   PR Comment Writeback
```

1. **Trigger** — CLI command or Gitee webhook event
2. **Prepare** — Clone/fetch repo, checkout PR branch, compute diff
3. **Analyze** — Claude Code CLI reviews with full project context (reads files, searches references, understands call chains)
4. **Report** — Structured JSON with score (0-100), issues by severity, and suggestions
5. **Distribute** — Terminal output, Markdown report, and/or PR comments

## Review Output

CodeSage generates structured reviews with:

- **Score** (0-100) — Overall code quality assessment
- **Issues** grouped by severity:
  - `critical` — Must fix (bugs, security vulnerabilities)
  - `warning` — Should fix (performance, design issues)
  - `info` — Optional improvements (style, naming)
- **Categories** — bug, security, performance, style, design
- **Suggestions** — General improvement recommendations

Example terminal output:

```
CodeSage Review  35/100

Critical security issues detected. Command injection vulnerability
in report endpoint, insecure authentication mechanism.

  [CRITICAL] Command injection vulnerability
    src/controllers/search.ts:56 (security)
    User input directly interpolated into shell command via exec().
    → Use a whitelist for report types, avoid exec() entirely.

  [WARNING] N+1 query pattern
    src/controllers/search.ts:23 (performance)
    findUserById called in loop for every task.
    → Pre-load users into a Map before the loop.
```

## Configuration

Config file: `~/.codesage/config.json`

| Key | Env Variable | Default | Description |
|-----|-------------|---------|-------------|
| `apiBaseUrl` | `CODESAGE_API_BASE_URL` | `https://api.anthropic.com` | AI API endpoint |
| `apiToken` | `CODESAGE_API_TOKEN` | — | AI API token |
| `platform` | `CODESAGE_PLATFORM` | `gitee` | Default platform |
| `giteeBaseUrl` | `CODESAGE_GITEE_BASE_URL` | `https://gitee.com` | Gitee API base URL |
| `giteeToken` | `CODESAGE_GITEE_TOKEN` | — | Gitee access token |
| `defaultFormat` | — | `terminal` | Output format (terminal/json/markdown) |

Priority: Environment variables > Config file > Defaults

## Supported AI Providers

Any Anthropic-compatible API endpoint works. Tested with:

| Provider | apiBaseUrl |
|----------|-----------|
| Anthropic Claude | `https://api.anthropic.com` (default) |
| BigModel (zhipu) | `https://open.bigmodel.cn/api/anthropic` |
| DeepSeek | `https://api.deepseek.com` |
| OpenRouter | `https://openrouter.ai/api/v1` |

## Prerequisites

- Node.js >= 18
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) installed (`npm install -g @anthropic-ai/claude-code`)
- A valid API key for Claude or a compatible provider

## Development

```bash
pnpm install
pnpm test          # Run tests (37 tests)
pnpm build         # Build
pnpm dev           # Watch mode
```

## Roadmap

- [ ] GitHub / GitLab platform adapters
- [ ] Web dashboard for review history
- [ ] Custom review rules (`.codesage.yml`)
- [ ] tree-sitter AST analysis for deeper code understanding
- [ ] Trend analysis across PRs
- [ ] npm publish for `npx codesage` usage

## Contributing

Contributions welcome! Please open an issue or PR on [GitHub](https://github.com/Louis-XWB/CodeSage).

## License

MIT
