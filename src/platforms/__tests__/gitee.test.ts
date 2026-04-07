import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GiteeAdapter } from '../gitee.js'

// Mock global fetch
const mockFetch = vi.fn()
global.fetch = mockFetch

describe('GiteeAdapter', () => {
  const adapter = new GiteeAdapter({
    baseUrl: 'https://gitee.com',
    token: 'test-token',
  })

  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('getPRInfo calls correct API endpoint', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        title: 'Fix bug',
        body: 'Fixes #123',
        base: { ref: 'main', repo: { clone_url: 'https://gitee.com/org/repo.git' } },
        head: { ref: 'fix/bug' },
        user: { login: 'developer' },
      }),
    }).mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { filename: 'src/foo.ts' },
        { filename: 'src/bar.ts' },
      ],
    })

    const info = await adapter.getPRInfo('org', 'repo', 123)
    expect(info.title).toBe('Fix bug')
    expect(info.baseBranch).toBe('main')
    expect(info.headBranch).toBe('fix/bug')
    expect(info.files).toEqual(['src/foo.ts', 'src/bar.ts'])
    expect(mockFetch).toHaveBeenCalledWith(
      'https://gitee.com/api/v5/repos/org/repo/pulls/123',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'token test-token',
        }),
      }),
    )
  })

  it('postComment calls correct API endpoint', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) })

    await adapter.postComment('org', 'repo', 123, 'Great PR!')
    expect(mockFetch).toHaveBeenCalledWith(
      'https://gitee.com/api/v5/repos/org/repo/pulls/123/comments',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ body: 'Great PR!' }),
      }),
    )
  })

  it('throws on API error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      text: async () => 'Not found',
    })

    await expect(adapter.getPRInfo('org', 'repo', 999)).rejects.toThrow('Gitee API error: 404')
  })
})
