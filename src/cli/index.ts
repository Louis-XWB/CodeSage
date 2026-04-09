// src/cli/index.ts
import { Command } from 'commander'
import { GitService } from '../core/git.js'
import { Reviewer } from '../core/reviewer.js'
import { buildReviewAction } from './review.js'
import { configGet, configSet } from './config-cmd.js'
import { startServer } from './server-cmd.js'
import { historyAction, historyStatsAction, historyListAction } from './history-cmd.js'

const program = new Command()

program
  .name('codesage')
  .description('AI code review engine powered by Claude Code')
  .version('0.1.0')

program
  .command('review')
  .description('Review a PR or local branch diff')
  .option('--pr <url>', 'PR URL to review (Gitee/GitHub)')
  .option('--repo <path>', 'Local repository path')
  .option('--base <branch>', 'Base branch for comparison')
  .option('--head <branch>', 'Head branch to review')
  .option('--format <type>', 'Output format: json, markdown, terminal', 'terminal')
  .option('--output <file>', 'Write report to file')
  .option('--comment', 'Post review as PR comment')
  .action(async (options) => {
    try {
      const action = buildReviewAction({
        gitService: new GitService(),
        reviewer: new Reviewer(),
      })
      await action(options)
    } catch (err) {
      console.error(`Error: ${(err as Error).message}`)
      process.exit(1)
    }
  })

const configCmd = program
  .command('config')
  .description('Manage configuration')

configCmd
  .command('get <key>')
  .description('Get a config value')
  .action(configGet)

configCmd
  .command('set <key> <value>')
  .description('Set a config value')
  .action(configSet)

program
  .command('server')
  .description('Start webhook server')
  .option('--port <port>', 'Server port', '3000')
  .action(startServer)

const historyCmd = program
  .command('history')
  .description('View review history')
  .option('--repo <name>', 'Filter by repository (owner/repo)')
  .option('--pr <number>', 'Filter by PR number')
  .action(historyAction)

historyCmd
  .command('list')
  .description('List all reviewed repositories')
  .action(historyListAction)

historyCmd
  .command('stats')
  .description('Show repository statistics')
  .requiredOption('--repo <name>', 'Repository name (owner/repo)')
  .action(historyStatsAction)

program.parse()
