import type { PlatformAdapter, PRInfo } from './types.js'

export interface GiteeConfig {
  baseUrl: string
  token: string
}

export class GiteeAdapter implements PlatformAdapter {
  private baseUrl: string
  private token: string

  constructor(config: GiteeConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '')
    this.token = config.token
  }

  private get headers(): Record<string, string> {
    return {
      Authorization: `token ${this.token}`,
      'Content-Type': 'application/json',
    }
  }

  private apiUrl(path: string): string {
    return `${this.baseUrl}/api/v5${path}`
  }

  private async request(url: string, options?: RequestInit): Promise<Response> {
    const res = await fetch(url, {
      ...options,
      headers: { ...this.headers, ...options?.headers },
    })
    if (!res.ok) {
      throw new Error(`Gitee API error: ${res.status} ${res.statusText}`)
    }
    return res
  }

  async getPRInfo(owner: string, repo: string, number: number): Promise<PRInfo> {
    const prRes = await this.request(this.apiUrl(`/repos/${owner}/${repo}/pulls/${number}`))
    const pr = await prRes.json()

    const filesRes = await this.request(this.apiUrl(`/repos/${owner}/${repo}/pulls/${number}/files`))
    const files = await filesRes.json()

    return {
      title: pr.title,
      description: pr.body ?? '',
      baseBranch: pr.base.ref,
      headBranch: pr.head.ref,
      headSha: pr.head.sha,
      repoCloneUrl: pr.base.repo.clone_url ?? pr.base.repo.html_url ?? pr.base.repo.ssh_url,
      author: pr.user.login,
      files: files.map((f: { filename: string }) => f.filename),
    }
  }

  async postComment(owner: string, repo: string, number: number, body: string): Promise<void> {
    await this.request(this.apiUrl(`/repos/${owner}/${repo}/pulls/${number}/comments`), {
      method: 'POST',
      body: JSON.stringify({ body }),
    })
  }

  async setReviewLabel(
    owner: string,
    repo: string,
    prNumber: number,
    blocked: boolean,
  ): Promise<void> {
    const addLabel = blocked ? 'CodeSage-BLOCKED' : 'CodeSage-PASSED'
    const removeLabel = blocked ? 'CodeSage-PASSED' : 'CodeSage-BLOCKED'

    try {
      // Remove the opposite label first
      await fetch(this.apiUrl(`/repos/${owner}/${repo}/pulls/${prNumber}/labels/${encodeURIComponent(removeLabel)}`), {
        method: 'DELETE',
        headers: this.headers,
      })
    } catch {
      // Label might not exist, ignore
    }

    try {
      // Add the current label
      await this.request(this.apiUrl(`/repos/${owner}/${repo}/pulls/${prNumber}/labels`), {
        method: 'POST',
        body: JSON.stringify([addLabel]),
      })
    } catch (err) {
      console.warn(`Failed to set PR label: ${(err as Error).message}`)
    }
  }

  async postLineComment(
    owner: string,
    repo: string,
    number: number,
    file: string,
    line: number,
    body: string,
  ): Promise<void> {
    await this.request(this.apiUrl(`/repos/${owner}/${repo}/pulls/${number}/comments`), {
      method: 'POST',
      body: JSON.stringify({
        body,
        path: file,
        position: line,
      }),
    })
  }
}
