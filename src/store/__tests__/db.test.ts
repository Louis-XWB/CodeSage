import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { getDb, closeDb } from '../db.js'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

describe('database', () => {
  const testDir = path.join(os.tmpdir(), 'codesage-db-test-' + Date.now())
  const dbPath = path.join(testDir, 'test.db')

  beforeEach(() => {
    fs.mkdirSync(testDir, { recursive: true })
  })

  afterEach(() => {
    closeDb()
    fs.rmSync(testDir, { recursive: true, force: true })
  })

  it('creates database and reviews table', () => {
    const db = getDb(dbPath)
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='reviews'").get()
    expect(tables).toBeDefined()
    expect((tables as { name: string }).name).toBe('reviews')
  })

  it('creates indexes', () => {
    const db = getDb(dbPath)
    const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'").all()
    const names = indexes.map((i: any) => i.name)
    expect(names).toContain('idx_repo')
    expect(names).toContain('idx_repo_pr')
    expect(names).toContain('idx_created_at')
  })

  it('returns same instance on multiple calls', () => {
    const db1 = getDb(dbPath)
    const db2 = getDb(dbPath)
    expect(db1).toBe(db2)
  })
})
