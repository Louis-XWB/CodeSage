import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { TaskQueue } from '../queue.js'

describe('TaskQueue', () => {
  it('processes tasks in order', async () => {
    const results: number[] = []
    const queue = new TaskQueue(1)

    queue.enqueue(async () => { results.push(1) })
    queue.enqueue(async () => { results.push(2) })
    queue.enqueue(async () => { results.push(3) })

    // Wait for all tasks to complete
    await queue.drain()
    expect(results).toEqual([1, 2, 3])
  })

  it('respects concurrency limit', async () => {
    let concurrent = 0
    let maxConcurrent = 0
    const queue = new TaskQueue(2)

    for (let i = 0; i < 5; i++) {
      queue.enqueue(async () => {
        concurrent++
        maxConcurrent = Math.max(maxConcurrent, concurrent)
        await new Promise((r) => setTimeout(r, 50))
        concurrent--
      })
    }

    await queue.drain()
    expect(maxConcurrent).toBeLessThanOrEqual(2)
  })

  it('handles task errors without stopping the queue', async () => {
    const results: string[] = []
    const queue = new TaskQueue(1)

    queue.enqueue(async () => { results.push('ok1') })
    queue.enqueue(async () => { throw new Error('fail') })
    queue.enqueue(async () => { results.push('ok2') })

    await queue.drain()
    expect(results).toEqual(['ok1', 'ok2'])
  })
})
