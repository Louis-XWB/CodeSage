FROM node:18-slim AS builder

RUN npm install -g pnpm

WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY tsconfig.json tsup.config.ts ./
COPY src/ src/
RUN pnpm build

FROM node:18-slim

# Install Claude Code CLI
RUN npm install -g @anthropic-ai/claude-code

WORKDIR /app
COPY --from=builder /app/dist dist/
COPY --from=builder /app/node_modules node_modules/
COPY --from=builder /app/package.json .
COPY src/skills/ dist/skills/

ENV PORT=3000
EXPOSE 3000

CMD ["node", "dist/server/index.js"]
