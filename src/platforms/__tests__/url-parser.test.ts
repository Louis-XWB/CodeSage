import { describe, it, expect } from 'vitest'
import { parsePRUrl } from '../url-parser.js'

describe('parsePRUrl', () => {
  it('parses Gitee PR URL', () => {
    const result = parsePRUrl('https://gitee.com/myorg/myrepo/pulls/42')
    expect(result).toEqual({
      platform: 'gitee',
      baseUrl: 'https://gitee.com',
      owner: 'myorg',
      repo: 'myrepo',
      number: 42,
    })
  })

  it('parses Gitee private deployment URL', () => {
    const result = parsePRUrl('https://gitee.mycompany.com/team/project/pulls/7')
    expect(result).toEqual({
      platform: 'gitee',
      baseUrl: 'https://gitee.mycompany.com',
      owner: 'team',
      repo: 'project',
      number: 7,
    })
  })

  it('parses GitHub PR URL', () => {
    const result = parsePRUrl('https://github.com/owner/repo/pull/123')
    expect(result).toEqual({
      platform: 'github',
      baseUrl: 'https://github.com',
      owner: 'owner',
      repo: 'repo',
      number: 123,
    })
  })

  it('throws on invalid URL', () => {
    expect(() => parsePRUrl('https://example.com/not-a-pr')).toThrow()
  })
})
