// src/core/git.ts
import simpleGit, { type SimpleGit } from 'simple-git'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import os from 'node:os'

export class GitService {
  private getGit(cwd: string): SimpleGit {
    return simpleGit(cwd)
  }

  getWorkDir(repoUrl: string): string {
    const hash = crypto.createHash('sha256').update(repoUrl).digest('hex').slice(0, 12)
    return path.join(os.homedir(), '.codesage', 'repos', hash)
  }

  async cloneOrFetch(repoUrl: string, workDir: string): Promise<void> {
    if (fs.existsSync(path.join(workDir, '.git'))) {
      const git = this.getGit(workDir)
      await git.fetch(['--all', '--prune'])
    } else {
      fs.mkdirSync(workDir, { recursive: true })
      await simpleGit().clone(repoUrl, workDir)
    }
  }

  async checkout(workDir: string, branch: string): Promise<void> {
    const git = this.getGit(workDir)
    await git.checkout(branch)
  }

  private async resolveRef(git: SimpleGit, ref: string): Promise<string> {
    try {
      // Try the ref as-is first (works for local branches, tags, SHAs)
      await git.revparse([ref])
      return ref
    } catch {
      // Fall back to origin/<ref> for remote tracking branches
      return `origin/${ref}`
    }
  }

  async getDiff(workDir: string, base: string, head: string): Promise<string> {
    const git = this.getGit(workDir)
    const resolvedBase = await this.resolveRef(git, base)
    const resolvedHead = await this.resolveRef(git, head)
    return git.diff([`${resolvedBase}...${resolvedHead}`])
  }

  async getFileContent(workDir: string, filePath: string, ref: string): Promise<string> {
    const git = this.getGit(workDir)
    const resolvedRef = await this.resolveRef(git, ref)
    return git.show([`${resolvedRef}:${filePath}`])
  }

  async getChangedFiles(workDir: string, base: string, head: string): Promise<string[]> {
    const git = this.getGit(workDir)
    const resolvedBase = await this.resolveRef(git, base)
    const resolvedHead = await this.resolveRef(git, head)
    const result = await git.diff(['--name-only', `${resolvedBase}...${resolvedHead}`])
    return result.split('\n').filter(Boolean)
  }
}
