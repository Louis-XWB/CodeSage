// src/core/__tests__/git.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { GitService } from '../git.js'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { execSync } from 'node:child_process'

describe('GitService', () => {
  const testDir = path.join(os.tmpdir(), 'codesage-git-test-' + Date.now())
  const repoDir = path.join(testDir, 'repo')
  const workDir = path.join(testDir, 'work')

  beforeEach(() => {
    // Create a bare-like test repo with commits
    fs.mkdirSync(repoDir, { recursive: true })
    execSync('git init', { cwd: repoDir })
    execSync('git config user.email "test@test.com"', { cwd: repoDir })
    execSync('git config user.name "Test"', { cwd: repoDir })
    fs.writeFileSync(path.join(repoDir, 'file.txt'), 'initial content\n')
    execSync('git add . && git commit -m "initial"', { cwd: repoDir })
    // Create a feature branch with changes
    execSync('git checkout -b feature', { cwd: repoDir })
    fs.writeFileSync(path.join(repoDir, 'file.txt'), 'modified content\n')
    fs.writeFileSync(path.join(repoDir, 'new-file.txt'), 'new content\n')
    execSync('git add . && git commit -m "feature changes"', { cwd: repoDir })
    execSync('git checkout main || git checkout master', { cwd: repoDir })
  })

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true })
  })

  it('clones a repo', async () => {
    const git = new GitService()
    await git.cloneOrFetch(repoDir, workDir)
    expect(fs.existsSync(path.join(workDir, '.git'))).toBe(true)
    expect(fs.existsSync(path.join(workDir, 'file.txt'))).toBe(true)
  })

  it('fetches when repo already cloned', async () => {
    const git = new GitService()
    await git.cloneOrFetch(repoDir, workDir)
    // Second call should fetch, not fail
    await git.cloneOrFetch(repoDir, workDir)
    expect(fs.existsSync(path.join(workDir, 'file.txt'))).toBe(true)
  })

  it('checks out a branch', async () => {
    const git = new GitService()
    await git.cloneOrFetch(repoDir, workDir)
    await git.checkout(workDir, 'feature')
    const content = fs.readFileSync(path.join(workDir, 'file.txt'), 'utf-8')
    expect(content).toBe('modified content\n')
  })

  it('gets diff between branches', async () => {
    const git = new GitService()
    await git.cloneOrFetch(repoDir, workDir)
    const diff = await git.getDiff(workDir, 'main', 'feature')
    expect(diff).toContain('modified content')
    expect(diff).toContain('new-file.txt')
  })

  it('gets changed file list', async () => {
    const git = new GitService()
    await git.cloneOrFetch(repoDir, workDir)
    const files = await git.getChangedFiles(workDir, 'main', 'feature')
    expect(files).toContain('file.txt')
    expect(files).toContain('new-file.txt')
  })
})
