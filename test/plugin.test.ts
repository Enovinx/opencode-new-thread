import { describe, it } from "node:test"
import { strict as assert } from "node:assert"
import plugin, { NewThreadPlugin } from "../index.ts"

async function setupV2(getResult: unknown = { model: { providerID: "opencode", id: "test-model" } }) {
  let registered: any = null
  const calls: { create: any[]; get: any[]; prompt: any[] } = { create: [], get: [], prompt: [] }
  const ctx: any = {
    location: { directory: "C:/proj" },
    session: {
      create: async (input: any) => {
        calls.create.push(input)
        return { id: "ses_123", title: input.title }
      },
      get: async (input: any) => {
        calls.get.push(input)
        return getResult
      },
      prompt: async (input: any) => {
        calls.prompt.push(input)
        return { ok: true }
      },
    },
    tool: {
      transform: async (fn: any) => {
        await fn({ add: (t: any) => { registered = t } })
      },
    },
  }
  await (plugin as any).setup(ctx)
  return { tool: registered, calls }
}

function v1Client(overrides: any = {}) {
  const calls: { create: any[]; messages: any[]; promptAsync: any[] } = { create: [], messages: [], promptAsync: [] }
  const client: any = {
    session: {
      create: async (input: any) => {
        calls.create.push(input)
        return { data: { id: "ses_123", title: input.body?.title } }
      },
      messages: async (input: any) => {
        calls.messages.push(input)
        return overrides.messages ?? []
      },
      promptAsync: async (input: any) => {
        calls.promptAsync.push(input)
        return { ok: true }
      },
    },
  }
  return { client, calls }
}

const v1Context: any = { sessionID: "cur_1", directory: "C:/proj" }

describe("v2 new_thread tool", () => {
  it("registers new_thread with prompt required", async () => {
    const { tool } = await setupV2()
    assert.equal(tool.name, "new_thread")
    assert.ok(tool.input.required.includes("prompt"))
  })

  it("returns a result object with content (not a bare string)", async () => {
    const { tool } = await setupV2()
    const result = await tool.execute({ prompt: "hi" }, { sessionID: "cur_1", directory: "C:/proj" })
    assert.equal(typeof result, "object")
    assert.ok("content" in (result as Record<string, unknown>))
    assert.match((result as { content: string }).content, /ses_123/)
  })

  it("inherits the model and directory, then sends the prompt", async () => {
    const { tool, calls } = await setupV2()
    await tool.execute({ title: "Hi", prompt: "hello" }, { sessionID: "cur_1", directory: "C:/proj" })
    assert.deepEqual(calls.create[0].model, { providerID: "opencode", id: "test-model" })
    assert.deepEqual(calls.create[0].location, { directory: "C:/proj" })
    assert.deepEqual(calls.prompt[0], { sessionID: "ses_123", text: "hello" })
  })

  it("accepts an explicit provider/model override", async () => {
    const { tool, calls } = await setupV2()
    await tool.execute({ prompt: "hi", model: "anthropic/claude-x" }, { sessionID: "y" })
    assert.deepEqual(calls.create[0].model, { providerID: "anthropic", id: "claude-x" })
  })

  it("throws when prompt is missing", async () => {
    const { tool } = await setupV2()
    await assert.rejects(tool.execute({ title: "x" }, { sessionID: "y" }), /prompt is required/)
  })

  it("throws on invalid model format", async () => {
    const { tool } = await setupV2()
    await assert.rejects(tool.execute({ prompt: "hi", model: "nonslash" }, { sessionID: "y" }), /Invalid model format/)
  })
})

describe("v1 new_thread tool", () => {
  it("creates a session and returns its id", async () => {
    const { client, calls } = v1Client()
    const p = await NewThreadPlugin({ client } as any)
    const result = await p.tool.new_thread.execute({ title: "Hi", prompt: "hello" }, v1Context)
    assert.equal(typeof result, "string")
    assert.match(result as string, /ses_123/)
    assert.equal(calls.create[0].body.title, "Hi")
    assert.equal(calls.promptAsync[0].body.parts[0].text, "hello")
  })

  it("inherits the model from the current session", async () => {
    const { client, calls } = v1Client({
      messages: [{ info: { role: "user", model: { providerID: "opencode", modelID: "m1" } } }],
    })
    const p = await NewThreadPlugin({ client } as any)
    await p.tool.new_thread.execute({ prompt: "hi" }, v1Context)
    assert.deepEqual(calls.promptAsync[0].body.model, { providerID: "opencode", modelID: "m1" })
  })

  it("throws when prompt is missing", async () => {
    const { client } = v1Client()
    const p = await NewThreadPlugin({ client } as any)
    await assert.rejects(p.tool.new_thread.execute({ title: "x" }, v1Context), /prompt is required/)
  })

  it("throws on invalid model format", async () => {
    const { client } = v1Client()
    const p = await NewThreadPlugin({ client } as any)
    await assert.rejects(
      p.tool.new_thread.execute({ prompt: "hi", model: "nonslash" }, v1Context),
      /Invalid model format/,
    )
  })
})
