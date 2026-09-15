import { access } from "node:fs/promises"

export const PKG_NAME = "opencode-new-thread"
export const V1_DEP = "@opencode-ai/plugin"
export const V1_DEP_RANGE = "^1.0.0"
export const V2_DEP = "@opencode/plugin"
export const V2_DEP_RANGE = "beta"

export async function fileExists(p: string) {
  try { await access(p); return true } catch { return false }
}

export function stripJsonc(raw: string) {
  return raw
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|\s)\/\/[^\n\r]*/g, "$1")
}

export function configEntryMatches(entry: unknown) {
  if (typeof entry === "string") return entry === PKG_NAME
  if (Array.isArray(entry)) return entry[0] === PKG_NAME
  if (entry && typeof entry === "object") {
    return (entry as Record<string, unknown>).package === PKG_NAME
  }
  return false
}

export async function pluginInConfig(configPath: string) {
  const { readFile } = await import("node:fs/promises")
  try {
    const raw = await readFile(configPath, "utf-8")
    let cfg: Record<string, unknown>
    try {
      cfg = JSON.parse(raw)
    } catch {
      cfg = JSON.parse(stripJsonc(raw))
    }
    const lists = [cfg.plugin, cfg.plugins].filter(Array.isArray)
    return lists.some((list) => (list as unknown[]).some(configEntryMatches))
  } catch { return false }
}

export async function addToConfig(configPath: string) {
  const { readFile, writeFile, mkdir } = await import("node:fs/promises")
  const { dirname } = await import("node:path")
  await mkdir(dirname(configPath), { recursive: true })
  let cfg: Record<string, unknown> = {}
  try {
    const raw = await readFile(configPath, "utf-8")
    try { cfg = JSON.parse(raw) } catch { cfg = JSON.parse(stripJsonc(raw)) }
  } catch {}
  for (const key of ["plugin", "plugins"] as const) {
    const list = Array.isArray(cfg[key]) ? [...(cfg[key] as unknown[])] : []
    if (!list.some(configEntryMatches)) {
      list.push(PKG_NAME)
      cfg[key] = list
    }
  }
  await writeFile(configPath, JSON.stringify(cfg, null, 2) + "\n")
}

export async function copyPluginTo(source: string, dest: string, overwriteAnswer = "y") {
  const { copyFile, mkdir, access } = await import("node:fs/promises")
  const { dirname } = await import("node:path")
  await mkdir(dirname(dest), { recursive: true })
  try {
    await access(dest)
    if (overwriteAnswer.toLowerCase() !== "y") return false
  } catch {}
  await copyFile(source, dest)
  return true
}

export async function ensureProjectPackageJson(projectDir: string) {
  const { writeFile, mkdir, access, readFile } = await import("node:fs/promises")
  const path = await import("node:path")
  const pkgPath = path.join(projectDir, ".opencode", "package.json")
  try {
    await access(pkgPath)
  } catch {
    await mkdir(path.dirname(pkgPath), { recursive: true })
    await writeFile(pkgPath, JSON.stringify({
      dependencies: { [V1_DEP]: V1_DEP_RANGE, [V2_DEP]: V2_DEP_RANGE },
    }, null, 2) + "\n")
    return true
  }
  try {
    const pkg = JSON.parse(await readFile(pkgPath, "utf-8")) as { dependencies?: Record<string, string> }
    pkg.dependencies = pkg.dependencies ?? {}
    let changed = false
    if (!pkg.dependencies[V1_DEP]) { pkg.dependencies[V1_DEP] = V1_DEP_RANGE; changed = true }
    if (!pkg.dependencies[V2_DEP]) { pkg.dependencies[V2_DEP] = V2_DEP_RANGE; changed = true }
    if (changed) {
      await writeFile(pkgPath, JSON.stringify(pkg, null, 2) + "\n")
      return true
    }
  } catch { return false }
  return false
}
