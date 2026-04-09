import Database from 'better-sqlite3'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'

let instance: Database.Database | null = null

const SCHEMA = `
CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  repo TEXT NOT NULL,
  pr_number INTEGER,
  base_branch TEXT,
  head_branch TEXT,
  score INTEGER NOT NULL,
  summary TEXT NOT NULL,
  issues_count INTEGER NOT NULL,
  critical_count INTEGER NOT NULL,
  warning_count INTEGER NOT NULL,
  info_count INTEGER NOT NULL,
  blocked INTEGER NOT NULL DEFAULT 0,
  files_changed INTEGER NOT NULL,
  additions INTEGER NOT NULL,
  deletions INTEGER NOT NULL,
  changed_files TEXT,
  report_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_repo ON reviews(repo);
CREATE INDEX IF NOT EXISTS idx_repo_pr ON reviews(repo, pr_number);
CREATE INDEX IF NOT EXISTS idx_created_at ON reviews(created_at);
`

function defaultDbPath(): string {
  return path.join(os.homedir(), '.codesage', 'history.db')
}

export function getDb(dbPath?: string): Database.Database {
  if (instance) return instance

  const filePath = dbPath ?? defaultDbPath()
  fs.mkdirSync(path.dirname(filePath), { recursive: true })

  instance = new Database(filePath)
  instance.pragma('journal_mode = WAL')
  instance.exec(SCHEMA)

  return instance
}

export function closeDb(): void {
  if (instance) {
    instance.close()
    instance = null
  }
}
