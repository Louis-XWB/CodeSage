// src/server/queue.ts

type Task = () => Promise<void>

export class TaskQueue {
  private queue: Task[] = []
  private running = 0
  private concurrency: number
  private drainResolvers: (() => void)[] = []

  constructor(concurrency: number) {
    this.concurrency = concurrency
  }

  enqueue(task: Task): void {
    this.queue.push(task)
    this.process()
  }

  async drain(): Promise<void> {
    if (this.running === 0 && this.queue.length === 0) return
    return new Promise((resolve) => {
      this.drainResolvers.push(resolve)
    })
  }

  private async process(): Promise<void> {
    while (this.running < this.concurrency && this.queue.length > 0) {
      const task = this.queue.shift()!
      this.running++
      task()
        .catch((err) => {
          console.error('Task failed:', err.message)
        })
        .finally(() => {
          this.running--
          if (this.queue.length > 0) {
            this.process()
          } else if (this.running === 0) {
            for (const resolve of this.drainResolvers) {
              resolve()
            }
            this.drainResolvers = []
          }
        })
    }
  }
}
