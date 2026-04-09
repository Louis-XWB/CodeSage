import type { FastifyInstance } from 'fastify'
import { listRepos, getRepoStats, getHistory, getReviewDetail } from '../store/history.js'

export async function registerApiRoutes(app: FastifyInstance): Promise<void> {
  // List all repos
  app.get('/api/history/repos', async () => {
    return listRepos()
  })

  // Get repo stats
  app.get('/api/history/repos/:repo/stats', async (request) => {
    const { repo } = request.params as { repo: string }
    const decoded = decodeURIComponent(repo)
    return getRepoStats(decoded)
  })

  // Query review history
  app.get('/api/history', async (request) => {
    const query = request.query as { repo?: string; pr?: string; limit?: string }
    return getHistory({
      repo: query.repo,
      prNumber: query.pr ? parseInt(query.pr, 10) : undefined,
      limit: query.limit ? parseInt(query.limit, 10) : undefined,
    })
  })

  // Get single review detail
  app.get('/api/history/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const detail = getReviewDetail(parseInt(id, 10))
    if (!detail) {
      return reply.code(404).send({ error: 'Review not found' })
    }
    return detail
  })
}
