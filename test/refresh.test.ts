import { describe, it } from "node:test"
import { strict as assert } from "node:assert"
import { writeFile, readFile, mkdtemp, rm, mkdir, copyFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import {
  refreshPlugin,
  uninstallPlugin,
  recordInstall,
  readRegistry,
  sha256File,
} from "../install.ts"

async function tmpDir() {
  const dir = await mkdtemp(join(tmpdir(), "test-"))
  return { dir, cleanup: () => rm(dir, { recursive: true, force: true }) }
}

describe("refreshPlugin", () => {
  it("replaces a tracked copy when its checksum matches", async () => {
    const { dir, cleanup } = await tmpDir()
    try {
      const source = join(dir, "source.txt")
      const dest = join(dir, "dest.txt")
      const registryFile = join(dir, "installs.json")
      await writeFile(source, "v1")
      await copyFile(source, dest)
      await recordInstall({ type: "file", path: dest, checksum: await sha256File(dest) }, registryFile)

      await writeFile(source, "v2")
      const res = await refreshPlugin({
        source,
        registryFile,
        legacyFiles: [],
        cacheDir: join(dir, "cache"),
        configRegistered: false,
      })

      assert.deepEqual(res.refreshed, [dest])
      assert.deepEqual(res.skipped, [])
      assert.equal(await readFile(dest, "utf-8"), "v2")
      const registry = await readRegistry(registryFile)
      assert.deepEqual(registry, [{ type: "file", path: dest, checksum: await sha256File(dest) }])
    } finally {
      await cleanup()
    }
  })

  it("skips a tracked copy that was modified locally", async () => {
    const { dir, cleanup } = await tmpDir()
    try {
      const source = join(dir, "source.txt")
      const dest = join(dir, "dest.txt")
      const registryFile = join(dir, "installs.json")
      await writeFile(source, "v1")
      await copyFile(source, dest)
      await recordInstall({ type: "file", path: dest, checksum: await sha256File(dest) }, registryFile)

      await writeFile(dest, "user edit")
      await writeFile(source, "v2")
      const res = await refreshPlugin({
        source,
        registryFile,
        legacyFiles: [],
        cacheDir: join(dir, "cache"),
        configRegistered: false,
      })

      assert.deepEqual(res.refreshed, [])
      assert.deepEqual(res.skipped, [dest])
      assert.equal(await readFile(dest, "utf-8"), "user edit")
    } finally {
      await cleanup()
    }
  })

  it("refreshes and registers legacy copies found at known locations", async () => {
    const { dir, cleanup } = await tmpDir()
    try {
      const source = join(dir, "source.txt")
      const dest = join(dir, "dest.txt")
      const registryFile = join(dir, "installs.json")
      await writeFile(source, "v2")
      await writeFile(dest, "v1")

      const res = await refreshPlugin({
        source,
        registryFile,
        legacyFiles: [dest],
        cacheDir: join(dir, "cache"),
        configRegistered: false,
      })

      assert.deepEqual(res.refreshed, [dest])
      assert.equal(await readFile(dest, "utf-8"), "v2")
      const registry = await readRegistry(registryFile)
      assert.deepEqual(registry, [{ type: "file", path: dest, checksum: await sha256File(dest) }])
    } finally {
      await cleanup()
    }
  })

  it("clears the cache when config registration is detected", async () => {
    const { dir, cleanup } = await tmpDir()
    try {
      const source = join(dir, "source.txt")
      const registryFile = join(dir, "installs.json")
      const cacheDir = join(dir, "cache")
      await writeFile(source, "v2")
      await mkdir(cacheDir)

      const res = await refreshPlugin({
        source,
        registryFile,
        legacyFiles: [],
        cacheDir,
        configRegistered: true,
      })

      assert.equal(res.clearedCache, true)
      assert.deepEqual(res.refreshed, [])
      const registry = await readRegistry(registryFile)
      assert.deepEqual(registry, [{ type: "cache" }])
    } finally {
      await cleanup()
    }
  })

  it("clears the cache when a tracked cache entry exists", async () => {
    const { dir, cleanup } = await tmpDir()
    try {
      const source = join(dir, "source.txt")
      const registryFile = join(dir, "installs.json")
      const cacheDir = join(dir, "cache")
      await writeFile(source, "v2")
      await mkdir(cacheDir)
      await recordInstall({ type: "cache" }, registryFile)

      const res = await refreshPlugin({
        source,
        registryFile,
        legacyFiles: [],
        cacheDir,
        configRegistered: false,
      })

      assert.equal(res.clearedCache, true)
    } finally {
      await cleanup()
    }
  })

  it("does not clear the cache or write a registry when nothing is installed", async () => {
    const { dir, cleanup } = await tmpDir()
    try {
      const source = join(dir, "source.txt")
      const registryFile = join(dir, "installs.json")
      const cacheDir = join(dir, "cache")
      await writeFile(source, "v2")
      await mkdir(cacheDir)

      const res = await refreshPlugin({
        source,
        registryFile,
        legacyFiles: [join(dir, "missing.txt")],
        cacheDir,
        configRegistered: false,
      })

      assert.equal(res.clearedCache, false)
      assert.deepEqual(res.refreshed, [])
      assert.equal(await readRegistry(registryFile), null)
    } finally {
      await cleanup()
    }
  })
})

describe("uninstallPlugin", () => {
  it("removes tracked copies, legacy copies, and the registry", async () => {
    const { dir, cleanup } = await tmpDir()
    try {
      const source = join(dir, "source.txt")
      const dest = join(dir, "dest.txt")
      const legacy = join(dir, "legacy.txt")
      const registryFile = join(dir, "installs.json")
      await writeFile(source, "v1")
      await copyFile(source, dest)
      await writeFile(legacy, "legacy")
      await recordInstall({ type: "file", path: dest, checksum: await sha256File(dest) }, registryFile)

      const res = await uninstallPlugin({ registryFile, legacyFiles: [legacy] })

      assert.deepEqual(res.removed.sort(), [dest, legacy].sort())
      assert.equal(await readRegistry(registryFile), null)
    } finally {
      await cleanup()
    }
  })
})
