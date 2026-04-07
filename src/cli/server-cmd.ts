// src/cli/server-cmd.ts
import { createServer } from '../server/index.js'

export async function startServer(options: { port?: string }): Promise<void> {
  const port = parseInt(options.port ?? '3000', 10)
  console.log(`Starting CodeSage webhook server on port ${port}...`)
  await createServer(port)
}
