// src/core/differ.ts
import type { DiffResult, ChangedFile, DiffHunk } from '../types.js'
import picomatch from 'picomatch'
import type { ProjectConfig } from '../config/project-config.js'

export function parseDiff(raw: string): DiffResult {
  if (!raw.trim()) {
    return { files: [], stats: { additions: 0, deletions: 0, filesChanged: 0 } }
  }

  const files: ChangedFile[] = []
  // Split into per-file diffs
  const fileDiffs = raw.split(/^diff --git /m).filter(Boolean)

  for (const fileDiff of fileDiffs) {
    const lines = fileDiff.split('\n')

    // Extract file path from "a/path b/path"
    const headerMatch = lines[0].match(/a\/(.+?) b\/(.+)/)
    if (!headerMatch) continue
    const filePath = headerMatch[2]

    // Detect status
    let status: ChangedFile['status'] = 'modified'
    if (fileDiff.includes('new file mode')) {
      status = 'added'
    } else if (fileDiff.includes('deleted file mode')) {
      status = 'deleted'
    } else if (fileDiff.includes('rename from')) {
      status = 'renamed'
    }

    // Parse hunks
    const hunks: DiffHunk[] = []
    const hunkRegex = /^@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@/
    let currentHunkLines: string[] = []
    let currentHunk: Omit<DiffHunk, 'content'> | null = null

    for (const line of lines) {
      const hunkMatch = line.match(hunkRegex)
      if (hunkMatch) {
        if (currentHunk) {
          hunks.push({ ...currentHunk, content: currentHunkLines.join('\n') })
        }
        currentHunk = {
          oldStart: parseInt(hunkMatch[1], 10),
          oldLines: parseInt(hunkMatch[2] || '0', 10),
          newStart: parseInt(hunkMatch[3], 10),
          newLines: parseInt(hunkMatch[4] || '0', 10),
        }
        currentHunkLines = [line]
      } else if (currentHunk && (line.startsWith('+') || line.startsWith('-') || line.startsWith(' '))) {
        currentHunkLines.push(line)
      }
    }
    if (currentHunk) {
      hunks.push({ ...currentHunk, content: currentHunkLines.join('\n') })
    }

    files.push({ path: filePath, status, hunks })
  }

  // Compute stats by counting +/- lines, capped by hunk header to handle edge cases
  let additions = 0
  let deletions = 0
  for (const file of files) {
    for (const hunk of file.hunks) {
      let hunkAdditions = 0
      let hunkDeletions = 0
      for (const line of hunk.content.split('\n')) {
        if (line.startsWith('+') && !line.startsWith('+++')) hunkAdditions++
        if (line.startsWith('-') && !line.startsWith('---')) hunkDeletions++
      }
      // Cap by hunk header values to stay consistent with declared counts
      additions += Math.min(hunkAdditions, hunk.newLines)
      deletions += Math.min(hunkDeletions, hunk.oldLines)
    }
  }

  return {
    files,
    stats: { additions, deletions, filesChanged: files.length },
  }
}

export function filterDiff(diff: DiffResult, config: Pick<ProjectConfig, 'include' | 'exclude' | 'maxFiles'>): DiffResult {
  let files = [...diff.files]

  if (config.include && config.include.length > 0) {
    const matchers = config.include.map(p => {
      const pattern = p.endsWith('/') ? `${p}**` : p
      return picomatch(pattern)
    })
    files = files.filter(f => matchers.some(m => m(f.path)))
  }

  if (config.exclude && config.exclude.length > 0) {
    const matchers = config.exclude.map(p => {
      const pattern = p.endsWith('/') ? `${p}**` : p
      return picomatch(pattern)
    })
    files = files.filter(f => !matchers.some(m => m(f.path)))
  }

  if (config.maxFiles && files.length > config.maxFiles) {
    files.sort((a, b) => {
      const aAdds = a.hunks.reduce((sum, h) => sum + h.newLines, 0)
      const bAdds = b.hunks.reduce((sum, h) => sum + h.newLines, 0)
      return bAdds - aAdds
    })
    files = files.slice(0, config.maxFiles)
  }

  let additions = 0
  let deletions = 0
  for (const file of files) {
    for (const hunk of file.hunks) {
      let hunkAdds = 0
      let hunkDels = 0
      for (const line of hunk.content.split('\n')) {
        if (line.startsWith('+') && !line.startsWith('+++')) hunkAdds++
        if (line.startsWith('-') && !line.startsWith('---')) hunkDels++
      }
      additions += Math.min(hunkAdds, hunk.newLines)
      deletions += Math.min(hunkDels, hunk.oldLines)
    }
  }

  return { files, stats: { additions, deletions, filesChanged: files.length } }
}
