import { describe, it } from "node:test"
import { strict as assert } from "node:assert"
import { writeFile, readFile, mkdtemp, rm, mkdir } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import {
  refreshPlugin,
  recordInstall,
  readRegistry,
  sha256File,
  legacyPluginFiles,
  configPaths,
  configEntryMatches,
} from "../install.ts"

describe("dual-install refresh", () => {
  it("exposes singular + plural plugin paths", async () => {
    const dir = await mkdtemp(join(tmpdir(), "test-"))
    try {
      const files = legacyPluginFiles(dir)
      assert.equal(files.length, 3)
      assert.ok(files.some((f) => f.endsWith(join(".opencode", "plugins", "new-thread.ts"))))
      assert.ok(files.some((f) => f.endsWith(join(".opencode", "plugin", "new-thread.ts"))))
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it("refreshes a legacy copy in the singular v2 dir", async () => {
    const dir = await mkdtemp(join(tmpdir(), "test-proj-"))
    try {
      const source = join(dir, "source.js")
      const dest = join(dir, ".opencode", "plugin", "new-thread.ts")
      const registryFile = join(dir, "installs.json")
      await mkdir(join(dir, ".opencode", "plugin"), { recursive: true })
      await writeFile(source, "v2-dual")
      await writeFile(dest, "v1-old")
      const res = await refreshPlugin({
        source,
        registryFile,
        legacyFiles: [dest],
        cacheDir: join(dir, "cache"),
        configRegistered: false,
      })
      assert.deepEqual(res.refreshed, [dest])
      assert.equal(await readFile(dest, "utf-8"), "v2-dual")
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it("clears extra v2 cache dirs", async () => {
    const dir = await mkdtemp(join(tmpdir(), "test-"))
    try {
      const source = join(dir, "source.js")
      const registryFile = join(dir, "installs.json")
      const cacheA = join(dir, "cache-a")
      const cacheB = join(dir, "cache-b")
      await writeFile(source, "v2")
      await mkdir(cacheA)
      await mkdir(cacheB)
      await recordInstall({ type: "cache" }, registryFile)
      const res = await refreshPlugin({
        source,
        registryFile,
        legacyFiles: [],
        cacheDir: cacheA,
        cacheDirs: [cacheB],
        configRegistered: false,
      })
      assert.equal(res.clearedCache, true)
      assert.equal(await readRegistry(registryFile) !== null, true)
      const { access } = await import("node:fs/promises")
      await assert.rejects(access(cacheA))
      await assert.rejects(access(cacheB))
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it("matches string, tuple and object config entries", () => {
    assert.equal(configEntryMatches("opencode-new-thread"), true)
    assert.equal(configEntryMatches(["opencode-new-thread", {}]), true)
    assert.equal(configEntryMatches({ package: "opencode-new-thread" }), true)
    assert.equal(configEntryMatches("other"), false)
    assert.equal(configEntryMatches({ package: "other" }), false)
  })

  it("covers global + project json/jsonc config paths", async () => {
    const dir = await mkdtemp(join(tmpdir(), "test-"))
    try {
      const paths = configPaths(dir)
      assert.ok(paths.some((p) => p.endsWith("opencode.jsonc")))
      assert.ok(paths.some((p) => p.includes(".opencode")))
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it("leaves locally modified dual copies alone", async () => {
    const dir = await mkdtemp(join(tmpdir(), "test-"))
    try {
      const source = join(dir, "source.js")
      const dest = join(dir, "dest.ts")
      const registryFile = join(dir, "installs.json")
      await writeFile(source, "v1")
      await writeFile(dest, "v1")
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
      assert.deepEqual(res.skipped, [dest])
      assert.equal(await readFile(dest, "utf-8"), "user edit")
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
