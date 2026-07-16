import { describe, it } from "node:test"
import { strict as assert } from "node:assert"
import { writeFile, readFile, mkdtemp, rm } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { PKG_NAME, pluginInConfig, addToConfig } from "./helpers.ts"

describe("pluginInConfig", () => {
  it("detects plugin in config JSON", async () => {
    const dir = await mkdtemp(join(tmpdir(), "test-"))
    const cfgPath = join(dir, "opencode.json")
    await writeFile(cfgPath, JSON.stringify({ plugin: [PKG_NAME] }))
    assert.equal(await pluginInConfig(cfgPath), true)
    await rm(dir, { recursive: true, force: true })
  })

  it("returns false for missing plugin key", async () => {
    const dir = await mkdtemp(join(tmpdir(), "test-"))
    const cfgPath = join(dir, "opencode.json")
    await writeFile(cfgPath, JSON.stringify({}))
    assert.equal(await pluginInConfig(cfgPath), false)
    await rm(dir, { recursive: true, force: true })
  })

  it("returns false for missing config file", async () => {
    assert.equal(await pluginInConfig("/nonexistent/config.json"), false)
  })
})

describe("addToConfig", () => {
  it("writes plugin entry to new config", async () => {
    const dir = await mkdtemp(join(tmpdir(), "test-"))
    const cfgPath = join(dir, "opencode.json")
    await addToConfig(cfgPath)
    const raw = await readFile(cfgPath, "utf-8")
    const cfg = JSON.parse(raw)
    assert.deepEqual(cfg.plugin, [PKG_NAME])
    await rm(dir, { recursive: true, force: true })
  })

  it("appends to existing plugin list", async () => {
    const dir = await mkdtemp(join(tmpdir(), "test-"))
    const cfgPath = join(dir, "opencode.json")
    await writeFile(cfgPath, JSON.stringify({ plugin: ["other-plugin"] }))
    await addToConfig(cfgPath)
    const raw = await readFile(cfgPath, "utf-8")
    const cfg = JSON.parse(raw)
    assert.deepEqual(cfg.plugin, ["other-plugin", PKG_NAME])
    await rm(dir, { recursive: true, force: true })
  })

  it("does not duplicate plugin", async () => {
    const dir = await mkdtemp(join(tmpdir(), "test-"))
    const cfgPath = join(dir, "opencode.json")
    await writeFile(cfgPath, JSON.stringify({ plugin: [PKG_NAME] }))
    await addToConfig(cfgPath)
    const raw = await readFile(cfgPath, "utf-8")
    const cfg = JSON.parse(raw)
    assert.deepEqual(cfg.plugin, [PKG_NAME])
    await rm(dir, { recursive: true, force: true })
  })
})
