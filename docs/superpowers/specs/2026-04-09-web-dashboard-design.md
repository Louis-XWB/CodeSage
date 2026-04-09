# Web Dashboard — Design Spec

## Overview

Two-part feature: REST API in CodeSage main repo + standalone React dashboard in a new repo (CodeSage-Dashboard).

## Part 1: REST API (CodeSage main repo)

Add API routes to existing Fastify server. Reuses `src/store/history.ts` query functions.

### Routes

```
GET /api/history/repos                          → listRepos()
GET /api/history/repos/:repo/stats              → getRepoStats(repo)
GET /api/history?repo=x&pr=1&limit=20           → getHistory(query)
GET /api/history/:id                            → getReviewDetail(id)
```

`:repo` param uses URL encoding for `owner/repo` format (e.g., `xuweibin%2FAICodeSage`).

### getReviewDetail (new query)

Returns the full `report_json` for a single review by ID. New function in `src/store/history.ts`:

```typescript
interface ReviewDetail extends HistoryEntry {
  changedFiles: string[]
  report: ReviewReport
}

function getReviewDetail(id: number): ReviewDetail | null
```

### CORS

Enable CORS on all `/api/*` routes so the standalone Dashboard frontend can call the API from a different origin.

### Files

| File | Change |
|------|--------|
| `src/server/api-routes.ts` | New — API route handlers |
| `src/server/index.ts` | Register API routes + CORS |
| `src/store/history.ts` | Add `getReviewDetail()` |

### Dependency

`@fastify/cors` — CORS plugin for Fastify

## Part 2: Dashboard Frontend (new repo: CodeSage-Dashboard)

### Tech Stack

- React 18 + TypeScript
- Vite (build)
- Tailwind CSS (styling)
- Recharts (charts)
- React Router (routing)

### Layout

Top navigation bar + wide content area. Dark theme.

Nav items: Overview | Repositories | Reviews | Trends | Settings

### Pages

#### 1. Overview (`/`)

- Summary cards: total repos, total reviews, avg score, blocked rate
- Global score trend line chart (last 30 reviews across all repos)
- Recent reviews table (last 10)

#### 2. Repositories (`/repos`)

- Card grid of all repos
- Each card: repo name, review count, avg score (color-coded), last review date
- Click → Repo Detail

#### 3. Repo Detail (`/repos/:name`)

- Score trend line chart for this repo
- Issue category breakdown (pie/donut chart)
- Stats cards: total reviews, avg score, blocked count, critical count
- PR review history table with score, verdict, date

#### 4. Reviews (`/reviews`)

- Filterable table of all reviews
- Filters: repo dropdown, score range, date range, verdict (blocked/passed)
- Columns: date, repo, PR#, branch, score, issues, verdict
- Click → Review Detail

#### 5. Review Detail (`/reviews/:id`)

- Full review report display (same structure as PR comment)
- Score badge, verdict, summary
- Issues grouped by severity with commit info
- Suggestions section

#### 6. Trends (`/trends`)

- Score trend over time (all repos overlaid)
- Issues by category over time (stacked area chart)
- Blocked vs passed ratio over time
- Top issue categories ranking

#### 7. Settings (`/settings`)

- API URL configuration
- Theme toggle (dark/light)
- Dashboard preferences (default page, items per page)

### API Connection

Dashboard reads API base URL from:
1. Environment variable `VITE_API_URL` at build time
2. Or Settings page runtime config (saved to localStorage)
3. Default: `http://localhost:3000`

### Deployment

`npm run build` → `dist/` static files. Serve with any static file server or nginx.
