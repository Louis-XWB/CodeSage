export interface ParsedPRUrl {
  platform: 'gitee' | 'github'
  baseUrl: string
  owner: string
  repo: string
  number: number
}

export function parsePRUrl(url: string): ParsedPRUrl {
  const parsed = new URL(url)
  const parts = parsed.pathname.split('/').filter(Boolean)

  // GitHub: /owner/repo/pull/123
  if (parsed.hostname === 'github.com' || parts[2] === 'pull') {
    if (parts.length >= 4 && parts[2] === 'pull') {
      return {
        platform: 'github',
        baseUrl: `${parsed.protocol}//${parsed.host}`,
        owner: parts[0],
        repo: parts[1],
        number: parseInt(parts[3], 10),
      }
    }
  }

  // Gitee: /owner/repo/pulls/123
  if (parts.length >= 4 && parts[2] === 'pulls') {
    return {
      platform: 'gitee',
      baseUrl: `${parsed.protocol}//${parsed.host}`,
      owner: parts[0],
      repo: parts[1],
      number: parseInt(parts[3], 10),
    }
  }

  throw new Error(`Cannot parse PR URL: ${url}. Expected format: https://<host>/<owner>/<repo>/pulls/<number>`)
}
