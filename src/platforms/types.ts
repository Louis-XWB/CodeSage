export interface PRInfo {
  title: string
  description: string
  baseBranch: string
  headBranch: string
  repoCloneUrl: string
  author: string
  files: string[]
}

export interface PlatformAdapter {
  getPRInfo(owner: string, repo: string, number: number): Promise<PRInfo>
  postComment(owner: string, repo: string, number: number, body: string): Promise<void>
  postLineComment(
    owner: string,
    repo: string,
    number: number,
    file: string,
    line: number,
    body: string,
  ): Promise<void>
}
