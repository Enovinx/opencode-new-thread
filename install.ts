#!/usr/bin/env node
import { readFile, writeFile, copyFile, access, mkdir } from "node:fs/promises"
import { homedir } from "node:os"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { createInterface } from "node:readline"
import process from "node:process"

const __filename = fileURLToPath(import.meta.url)
const PACKAGE_ROOT = dirname(__filename)
const GLOBAL_DIR = join(homedir(), ".config", "opencode")
const GLOBAL_PLUGINS_DIR = join(GLOBAL_DIR, "plugins")
const GLOBAL_CONFIG = join(GLOBAL_DIR, "opencode.json")
const PROJECT_DIR = process.cwd()
const PROJECT_PLUGIN_FILE = join(PROJECT_DIR, ".opencode", "plugins", "new-thread.ts")
const PROJECT_PACKAGE_JSON = join(PROJECT_DIR, ".opencode", "package.json")
const PROJECT_CONFIG = join(PROJECT_DIR, "opencode.json")
const PKG_NAME = "opencode-new-thread"
const PLUGIN_SOURCE = join(PACKAGE_ROOT, "index.ts")

let pipedAnswers: string[] | null = null

function log(msg: string) { console.log(`  ${msg}`) }
function success(msg: string) { console.log(`  \u2713 ${msg}`) }
function warn(msg: string) { console.log(`  \u26A0 ${msg}`) }
function rule() { console.log("  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500") }

function initStdin(): Promise<void> {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) {
      resolve()
    } else {
      const chunks: Buffer[] = []
      process.stdin.on("data", (chunk: Buffer) => chunks.push(chunk))
      process.stdin.on("end", () => {
        pipedAnswers = Buffer.concat(chunks).toString("utf-8").split(/\r?\n/).filter(Boolean)
        resolve()
      })
      process.stdin.resume()
    }
  })
}

function ask(question: string): Promise<string> {
  return new Promise((resolve) => {
    if (pipedAnswers !== null) {
      const ans = pipedAnswers.shift() ?? ""
      process.stdout.write(`  ${question} ${ans}\n`)
      resolve(ans.trim())
    } else {
      const rl = createInterface({ input: process.stdin, output: process.stdout })
      rl.question(`  ${question} `, (ans: string) => {
        rl.close()
        resolve(ans.trim())
      })
    }
  })
}

async function fileExists(p: string) {
  try { await access(p); return true } catch { return false }
}

async function pluginInConfig(configPath: string) {
  try {
    const raw = await readFile(configPath, "utf-8")
    const plugins: string[] = JSON.parse(raw).plugin ?? []
    return plugins.includes(PKG_NAME)
  } catch { return false }
}

async function copyPluginTo(dest: string) {
  await mkdir(dirname(dest), { recursive: true })
  if (await fileExists(dest)) {
    warn(`${dest}\n     already exists.`)
    const ans = await ask("Overwrite? [y/N]")
    if (ans.toLowerCase() !== "y") { log("  Skipped."); return false }
  }
  await copyFile(PLUGIN_SOURCE, dest)
  success(`Copied to ${dest}`)
  return true
}

async function ensureProjectPackageJson() {
  if (!await fileExists(PROJECT_PACKAGE_JSON)) {
    await mkdir(dirname(PROJECT_PACKAGE_JSON), { recursive: true })
    await writeFile(PROJECT_PACKAGE_JSON, JSON.stringify({
      dependencies: { "@opencode-ai/plugin": "^1.0.0" },
    }, null, 2) + "\n")
    success(`Created ${PROJECT_PACKAGE_JSON}`)
  }
}

async function addToConfig(configPath: string) {
  await mkdir(dirname(configPath), { recursive: true })
  let cfg: Record<string, unknown> = {}
  try { cfg = JSON.parse(await readFile(configPath, "utf-8")) } catch {}
  const plugins: string[] = (cfg.plugin as string[]) ?? []
  if (plugins.includes(PKG_NAME)) {
    warn(`"${PKG_NAME}" already listed in ${configPath}`)
    return
  }
  cfg.plugin = [...plugins, PKG_NAME]
  await writeFile(configPath, JSON.stringify(cfg, null, 2) + "\n")
  success(`Added "${PKG_NAME}" to ${configPath}`)
}

type Choice = {
  n: number
  v: "global-file" | "project-file" | "global-config" | "project-config"
  label: string
  warnIfExists: () => Promise<boolean>
  install: () => Promise<void>
}

async function main() {
  await initStdin()

  console.log("")
  log("opencode-new-thread installer")
  rule()

  const choices: Choice[] = [
    {
      n: 1, v: "global-file", label: "Copy to global plugins dir (~/.config/opencode/plugins/)",
      async warnIfExists() { return fileExists(join(GLOBAL_PLUGINS_DIR, "new-thread.ts")) },
      async install() {
        if (await copyPluginTo(join(GLOBAL_PLUGINS_DIR, "new-thread.ts"))) {
          log("  Auto-loaded for every project -- no config needed.")
        }
      },
    },
    {
      n: 2, v: "project-file", label: "Copy to this project's plugins dir (.opencode/plugins/)",
      async warnIfExists() { return fileExists(PROJECT_PLUGIN_FILE) },
      async install() {
        if (await copyPluginTo(PROJECT_PLUGIN_FILE)) {
          await ensureProjectPackageJson()
        }
      },
    },
    {
      n: 3, v: "global-config", label: "Register in global config (~/.config/opencode/opencode.json)",
      async warnIfExists() { return pluginInConfig(GLOBAL_CONFIG) },
      async install() { await addToConfig(GLOBAL_CONFIG) },
    },
    {
      n: 4, v: "project-config", label: "Register in this project's config (opencode.json)",
      async warnIfExists() { return pluginInConfig(PROJECT_CONFIG) },
      async install() { await addToConfig(PROJECT_CONFIG) },
    },
  ]

  log("Where to install?")
  choices.forEach((c) => console.log(`    ${c.n}) ${c.label}`))
  console.log("")

  const raw = await ask("Enter a number (1-4):")
  const n = parseInt(raw, 10)
  const choice = choices.find((c) => c.n === n)
  if (!choice) { log("  Invalid choice. Aborted."); process.exit(1); return }
  rule()

  const exists = await choice.warnIfExists()
  if (exists) {
    warn("Plugin is already installed at this location.")
    const ans = await ask("Continue anyway? [y/N]")
    if (ans.toLowerCase() !== "y") { log("  Aborted."); process.exit(0) }
    rule()
  }

  await choice.install()
  rule()
  success("Done!")
  console.log("")
}

main().catch((err) => { console.error("Install failed:", err); process.exit(1) })
