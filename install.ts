#!/usr/bin/env node
import { readFile, writeFile, copyFile, access, mkdir, rm } from "node:fs/promises"
import { existsSync } from "node:fs"
import { createHash } from "node:crypto"
import { homedir } from "node:os"
import { join, dirname } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { createInterface } from "node:readline"
import process from "node:process"

const __filename = fileURLToPath(import.meta.url)
const PACKAGE_ROOT = dirname(__filename)
const GLOBAL_DIR = join(homedir(), ".config", "opencode")
const GLOBAL_PLUGINS_DIR = join(GLOBAL_DIR, "plugins")
const GLOBAL_CONFIG = join(GLOBAL_DIR, "opencode.json")
const PROJECT_DIR = process.env.INIT_CWD || process.cwd()
const PROJECT_PLUGIN_FILE = join(PROJECT_DIR, ".opencode", "plugins", "new-thread.ts")
const PROJECT_PACKAGE_JSON = join(PROJECT_DIR, ".opencode", "package.json")
const PROJECT_CONFIG = join(PROJECT_DIR, "opencode.json")
const REGISTRY_DIR = join(GLOBAL_DIR, ".opencode-new-thread")
const REGISTRY_FILE = join(REGISTRY_DIR, "installs.json")
const CACHE_PKG_DIR = join(homedir(), ".cache", "opencode", "packages", "opencode-new-thread")
const PKG_NAME = "opencode-new-thread"
// Prefer the TypeScript source during development; the published package only ships dist/.
const PLUGIN_SOURCE = existsSync(join(PACKAGE_ROOT, "index.ts"))
  ? join(PACKAGE_ROOT, "index.ts")
  : join(PACKAGE_ROOT, "index.js")

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

export async function fileExists(p: string) {
  try { await access(p); return true } catch { return false }
}

export async function pluginInConfig(configPath: string) {
  try {
    const raw = await readFile(configPath, "utf-8")
    const plugins: string[] = JSON.parse(raw).plugin ?? []
    return plugins.includes(PKG_NAME)
  } catch { return false }
}

export async function sha256File(p: string) {
  const data = await readFile(p)
  return createHash("sha256").update(data).digest("hex")
}

export type RegistryEntry =
  | { type: "file"; path: string; checksum: string }
  | { type: "cache" }
export type Registry = RegistryEntry[]

export async function readRegistry(file: string = REGISTRY_FILE): Promise<Registry | null> {
  try {
    const parsed: unknown = JSON.parse(await readFile(file, "utf-8"))
    if (!Array.isArray(parsed)) return null
    return parsed as Registry
  } catch { return null }
}

export async function writeRegistry(registry: Registry, file: string = REGISTRY_FILE): Promise<void> {
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, JSON.stringify(registry, null, 2) + "\n")
}

export async function recordInstall(entry: RegistryEntry, file: string = REGISTRY_FILE): Promise<void> {
  const registry = (await readRegistry(file)) ?? []
  let next: Registry
  if (entry.type === "cache") {
    next = [...registry.filter((e) => e.type !== "cache"), entry]
  } else {
    next = [...registry.filter((e) => !(e.type === "file" && e.path === entry.path)), entry]
  }
  await writeRegistry(next, file)
}

export async function copyPluginTo(dest: string) {
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

export type RefreshInput = {
  source: string
  registryFile: string
  legacyFiles: string[]
  cacheDir: string
  configRegistered: boolean
}

export type RefreshResult = {
  refreshed: string[]
  skipped: string[]
  clearedCache: boolean
}

export async function refreshPlugin(input: RefreshInput): Promise<RefreshResult> {
  const registry = (await readRegistry(input.registryFile)) ?? []
  const tracked = new Map<string, string>()
  for (const e of registry) if (e.type === "file") tracked.set(e.path, e.checksum)
  const cacheTracked = registry.some((e) => e.type === "cache")

  const paths = new Set<string>(tracked.keys())
  for (const p of input.legacyFiles) if (await fileExists(p)) paths.add(p)

  const refreshed: string[] = []
  const skipped: string[] = []
  const next: Registry = []

  for (const p of paths) {
    const stored = tracked.get(p)
    if (stored !== undefined) {
      if (!(await fileExists(p))) continue
      const current = await sha256File(p)
      if (current !== stored) {
        skipped.push(p)
        next.push({ type: "file", path: p, checksum: stored })
        continue
      }
    }
    await copyFile(input.source, p)
    next.push({ type: "file", path: p, checksum: await sha256File(p) })
    refreshed.push(p)
  }

  const configFound = input.configRegistered || cacheTracked
  const anyFile = refreshed.length > 0
  let clearedCache = false
  if ((anyFile || configFound) && await fileExists(input.cacheDir)) {
    await rm(input.cacheDir, { recursive: true, force: true })
    clearedCache = true
  }

  if (configFound) next.push({ type: "cache" })

  const changed = refreshed.length > 0 || skipped.length > 0 || configFound
  if (changed) await writeRegistry(next, input.registryFile)

  return { refreshed, skipped, clearedCache }
}

export async function uninstallPlugin(input: {
  registryFile: string
  legacyFiles: string[]
}): Promise<{ removed: string[] }> {
  const registry = (await readRegistry(input.registryFile)) ?? []
  const removed: string[] = []
  for (const e of registry) {
    if (e.type === "file" && await fileExists(e.path)) {
      await rm(e.path, { force: true })
      removed.push(e.path)
    }
  }
  for (const p of input.legacyFiles) {
    if (await fileExists(p)) {
      await rm(p, { force: true })
      removed.push(p)
    }
  }
  await rm(input.registryFile, { force: true })
  return { removed }
}

async function runRefresh() {
  console.log("")
  log("opencode-new-thread refresh")
  rule()
  const configRegistered =
    await pluginInConfig(GLOBAL_CONFIG) || await pluginInConfig(PROJECT_CONFIG)
  const res = await refreshPlugin({
    source: PLUGIN_SOURCE,
    registryFile: REGISTRY_FILE,
    legacyFiles: [join(GLOBAL_PLUGINS_DIR, "new-thread.ts"), PROJECT_PLUGIN_FILE],
    cacheDir: CACHE_PKG_DIR,
    configRegistered,
  })
  for (const p of res.refreshed) success(`Updated ${p}`)
  for (const p of res.skipped) warn(`Skipped ${p} (modified locally)`)
  if (res.clearedCache) success("Cleared opencode package cache (reloads @latest on next launch)")
  if (!res.refreshed.length && !res.skipped.length && !res.clearedCache) log("Nothing to update.")
  rule()
  console.log("")
}

async function runUninstall() {
  console.log("")
  log("opencode-new-thread uninstall")
  rule()
  const res = await uninstallPlugin({
    registryFile: REGISTRY_FILE,
    legacyFiles: [join(GLOBAL_PLUGINS_DIR, "new-thread.ts"), PROJECT_PLUGIN_FILE],
  })
  for (const p of res.removed) success(`Removed ${p}`)
  if (!res.removed.length) log("No plugin files found to remove.")
  warn("Config entries (if any) in opencode.json are left untouched.")
  rule()
  console.log("")
}

type Choice = {
  n: number
  v: "global-file" | "project-file" | "global-config" | "project-config"
  label: string
  warnIfExists: () => Promise<boolean>
  install: () => Promise<void>
}

async function main() {
  if (process.argv.includes("--refresh")) { await runRefresh(); return }
  if (process.argv.includes("--uninstall")) { await runUninstall(); return }

  await initStdin()

  console.log("")
  log("opencode-new-thread installer")
  rule()

  const choices: Choice[] = [
    {
      n: 1, v: "global-file", label: "Copy to global plugins dir (~/.config/opencode/plugins/)",
      async warnIfExists() { return fileExists(join(GLOBAL_PLUGINS_DIR, "new-thread.ts")) },
      async install() {
        const dest = join(GLOBAL_PLUGINS_DIR, "new-thread.ts")
        if (await copyPluginTo(dest)) {
          await recordInstall({ type: "file", path: dest, checksum: await sha256File(dest) })
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
          await recordInstall({ type: "file", path: PROJECT_PLUGIN_FILE, checksum: await sha256File(PROJECT_PLUGIN_FILE) })
        }
      },
    },
    {
      n: 3, v: "global-config", label: "Register in global config (~/.config/opencode/opencode.json)",
      async warnIfExists() { return pluginInConfig(GLOBAL_CONFIG) },
      async install() {
        await addToConfig(GLOBAL_CONFIG)
        await recordInstall({ type: "cache" })
      },
    },
    {
      n: 4, v: "project-config", label: "Register in this project's config (opencode.json)",
      async warnIfExists() { return pluginInConfig(PROJECT_CONFIG) },
      async install() {
        await addToConfig(PROJECT_CONFIG)
        await recordInstall({ type: "cache" })
      },
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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => { console.error("Install failed:", err); process.exit(1) })
}
