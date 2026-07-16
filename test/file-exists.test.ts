import { describe, it } from "node:test"
import { strict as assert } from "node:assert"
import { writeFile, mkdtemp, rm } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { fileExists } from "./helpers.ts"

describe("fileExists", () => {
  it("returns true for existing files", async () => {
    const dir = await mkdtemp(join(tmpdir(), "test-"))
    const f = join(dir, "foo.txt")
    await writeFile(f, "hello")
    assert.equal(await fileExists(f), true)
    await rm(dir, { recursive: true, force: true })
  })

  it("returns false for missing files", async () => {
    assert.equal(await fileExists("/nonexistent/path"), false)
  })
})
