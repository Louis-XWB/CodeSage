// src/cli/config-cmd.ts
import { getConfigPath, loadConfig, saveConfig } from '../config.js'

export function configGet(key: string): void {
  const config = loadConfig()
  const value = (config as Record<string, unknown>)[key]
  if (value === undefined) {
    console.error(`Unknown config key: ${key}`)
    process.exit(1)
  }
  console.log(value)
}

export function configSet(key: string, value: string): void {
  const configPath = getConfigPath()
  saveConfig(configPath, { [key]: value })
  console.log(`Set ${key} = ${value}`)
}
