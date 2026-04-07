# CodeSage

AI code review engine powered by Claude Code. Full-project-aware review for Pull Requests — not just diffs.

CodeSage leverages Claude Code CLI as its review engine, giving it the ability to explore your entire codebase (read files, search for references, understand call chains) before providing structured review feedback.

## Features

- **Full-project review** — Goes beyond diff, explores references and call chains using Claude Code's tooling
- **Gitee-first** — First-class support for Gitee (including private deployments), with a platform-agnostic architecture
- **CLI + Webhook** — Review PRs manually from the terminal or automatically via webhook
- **Structured reports** — JSON / Markdown / Terminal output with severity levels, categories, and fix suggestions
- **PR comment writeback** — Posts review summary and line-level comments directly to your PR
- **Multi-model** — Switch AI providers via `ANTHROPIC_BASE_URL` (DeepSeek, OpenRouter, local models, etc.)

## Quick Start

### Install

```bash
# From source
git clone https://github.com/Louis-XWB/CodeSage.git
cd CodeSage
pnpm install
pnpm build
npm link
```

### Configure

```bash
# Set your Gitee token
codesage config set giteeToken "your-gitee-token"

# For private Gitee deployments
codesage config set giteeBaseUrl "https://gitee.your-company.com"

# Use a different AI provider (optional)
codesage config set apiBaseUrl "https://api.deepseek.com"
codesage config set apiToken "your-api-token"
```

Or use environment variables:

```bash
export CODESAGE_GITEE_TOKEN="your-token"
export CODESAGE_GITEE_BASE_URL="https://gitee.your-company.com"
```

### Review a PR

```bash
# Review a Gitee PR
codesage review --pr https://gitee.com/org/repo/pulls/123

# Review and post comments back to the PR
codesage review --pr https://gitee.com/org/repo/pulls/123 --comment

# Review a local branch diff
codesage review --repo /path/to/repo --base main --head feature/xyz

# Output as JSON
codesage review --pr https://gitee.com/org/repo/pulls/123 --format json

# Save report to file
codesage review --pr https://gitee.com/org/repo/pulls/123 --output report.md --format markdown
```

### Webhook Server

Automatically review PRs when they are created or updated:

```bash
# Start the webhook server
codesage server --port 3000
```

Then configure your Gitee repository webhook:

1. Go to **Settings > Webhooks** in your Gitee repository
2. Set URL to `http://your-server:3000/webhook/gitee`
3. Select **Pull Request** events
4. Set a Secret Token (optional)

### Docker

```bash
docker build -t codesage .
docker run -p 3000:3000 \
  -e CODESAGE_GITEE_TOKEN=your-token \
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
3. **Analyze** — Claude Code CLI reviews the code with full project context (reads files, searches for references, understands call chains)
4. **Report** — Structured JSON with score, issues by severity, and suggestions
5. **Distribute** — Terminal output, Markdown report, or PR comments

## Review Output

CodeSage generates structured reviews with:

- **Score** (0-100) — Overall code quality assessment
- **Issues** grouped by severity:
  - `critical` — Must fix (bugs, security vulnerabilities)
  - `warning` — Should fix (performance, design issues)
  - `info` — Optional improvements (style, naming)
- **Categories** — bug, security, performance, style, design
- **Suggestions** — General improvement recommendations

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

## Prerequisites

- Node.js >= 18
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) installed (`npm install -g @anthropic-ai/claude-code`)
- A valid API key for Claude (or compatible provider)

## Development

```bash
pnpm install
pnpm test          # Run tests
pnpm build         # Build
pnpm dev           # Watch mode
```

## Roadmap

- [ ] GitHub / GitLab platform adapters
- [ ] Web dashboard for review history
- [ ] Custom review rules (`.codesage.yml`)
- [ ] tree-sitter AST analysis for deeper code understanding
- [ ] Trend analysis across PRs

## License

MIT
