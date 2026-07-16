import { describe, it } from "node:test"
import { strict as assert } from "node:assert"
import { writeFile, readFile, mkdtemp, rm } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { copyPluginTo } from "./helpers.ts"

describe("copyPluginTo", () => {
  it("copies file to destination", async () => {
    const dir = await mkdtemp(join(tmpdir(), "test-"))
    const src = join(dir, "source.txt")
    const dest = join(dir, "dest.txt")
    await writeFile(src, "plugin-content")
    const result = await copyPluginTo(src, dest)
    assert.equal(result, true)
    const content = await readFile(dest, "utf-8")
    assert.equal(content, "plugin-content")
    await rm(dir, { recursive: true, force: true })
  })

  it("returns false when user declines overwrite", async () => {
    const dir = await mkdtemp(join(tmpdir(), "test-"))
    const src = join(dir, "source.txt")
    const dest = join(dir, "dest.txt")
    await writeFile(src, "plugin-content")
    await writeFile(dest, "existing-content")
    const result = await copyPluginTo(src, dest, "n")
    assert.equal(result, false)
    const content = await readFile(dest, "utf-8")
    assert.equal(content, "existing-content")
    await rm(dir, { recursive: true, force: true })
  })
})
