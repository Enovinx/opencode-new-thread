import { access } from "node:fs/promises"

export const PKG_NAME = "opencode-new-thread"

export async function fileExists(p: string) {
  try { await access(p); return true } catch { return false }
}

export async function pluginInConfig(configPath: string) {
  const { readFile } = await import("node:fs/promises")
  try {
    const raw = await readFile(configPath, "utf-8")
    const plugins: string[] = JSON.parse(raw).plugin ?? []
    return plugins.includes(PKG_NAME)
  } catch { return false }
}

export async function addToConfig(configPath: string) {
  const { readFile, writeFile, mkdir } = await import("node:fs/promises")
  const { dirname } = await import("node:path")
  await mkdir(dirname(configPath), { recursive: true })
  let cfg: Record<string, unknown> = {}
  try { cfg = JSON.parse(await readFile(configPath, "utf-8")) } catch {}
  const plugins: string[] = (cfg.plugin as string[]) ?? []
  if (plugins.includes(PKG_NAME)) return
  cfg.plugin = [...plugins, PKG_NAME]
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
  const { writeFile, mkdir, access } = await import("node:fs/promises")
  const path = await import("node:path")
  const pkgPath = path.join(projectDir, ".opencode", "package.json")
  try {
    await access(pkgPath)
  } catch {
    await mkdir(path.dirname(pkgPath), { recursive: true })
    await writeFile(pkgPath, JSON.stringify({
      dependencies: { "@opencode-ai/plugin": "^1.0.0" },
    }, null, 2) + "\n")
    return true
  }
  return false
}
