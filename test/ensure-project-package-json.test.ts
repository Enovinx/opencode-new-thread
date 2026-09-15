import { describe, it } from "node:test"
import { strict as assert } from "node:assert"
import { writeFile, readFile, mkdtemp, rm, mkdir } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { ensureProjectPackageJson } from "./helpers.ts"

describe("ensureProjectPackageJson", () => {
  it("creates .opencode/package.json when missing", async () => {
    const dir = await mkdtemp(join(tmpdir(), "test-"))
    const result = await ensureProjectPackageJson(dir)
    assert.equal(result, true)
    const pkg = JSON.parse(await readFile(join(dir, ".opencode", "package.json"), "utf-8"))
    assert.deepEqual(pkg, { dependencies: { "@opencode-ai/plugin": "^1.0.0", "@opencode/plugin": "beta" } })
    await rm(dir, { recursive: true, force: true })
  })

  it("merges missing dual deps into existing file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "test-"))
    await mkdir(join(dir, ".opencode"), { recursive: true })
    await writeFile(join(dir, ".opencode", "package.json"), JSON.stringify({ dependencies: { foo: "1.0.0" } }))
    const result = await ensureProjectPackageJson(dir)
    assert.equal(result, true)
    const pkg = JSON.parse(await readFile(join(dir, ".opencode", "package.json"), "utf-8"))
    assert.deepEqual(pkg, { dependencies: { foo: "1.0.0", "@opencode-ai/plugin": "^1.0.0", "@opencode/plugin": "beta" } })
    await rm(dir, { recursive: true, force: true })
  })

  it("does not touch file when both deps present", async () => {
    const dir = await mkdtemp(join(tmpdir(), "test-"))
    await mkdir(join(dir, ".opencode"), { recursive: true })
    const existing = { dependencies: { "@opencode-ai/plugin": "^1.0.0", "@opencode/plugin": "beta" } }
    await writeFile(join(dir, ".opencode", "package.json"), JSON.stringify(existing))
    const result = await ensureProjectPackageJson(dir)
    assert.equal(result, false)
    const pkg = JSON.parse(await readFile(join(dir, ".opencode", "package.json"), "utf-8"))
    assert.deepEqual(pkg, existing)
    await rm(dir, { recursive: true, force: true })
  })
})
