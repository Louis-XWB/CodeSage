import { defineConfig } from 'tsup'

export default defineConfig([
  {
    entry: { 'cli/index': 'src/cli/index.ts' },
    format: ['esm'],
    target: 'node18',
    outDir: 'dist',
    clean: false,
    sourcemap: true,
    splitting: true,
    banner: { js: '#!/usr/bin/env node' },
  },
  {
    entry: ['src/server/index.ts', 'src/index.ts'],
    format: ['esm'],
    target: 'node18',
    outDir: 'dist',
    sourcemap: true,
    dts: true,
    splitting: true,
  },
])
