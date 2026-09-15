import { type Plugin, tool } from "@opencode-ai/plugin"
import type { UserMessage, AssistantMessage } from "@opencode-ai/sdk"
import { Plugin as V2 } from "@opencode/plugin"

const DESCRIPTION = "Only use when the user explicitly asks to start a new chat thread or open a new tab. Creates a new top-level session in the GUI."
const TOOL_NAME = "new_thread"

function parseModelArg(model: string) {
  const [providerID, modelID] = model.split("/")
  if (!providerID || !modelID) {
    throw new Error(`Invalid model format "${model}". Use "provider/model" (e.g. "opencode/deepseek-v4-flash-free")`)
  }
  return { providerID, modelID }
}

async function inheritV1Model(client: any, sessionID: string) {
  try {
    const msgs = await client.session.messages({ path: { id: sessionID }, query: { limit: 1 } })
    const msgsData = "data" in (msgs as any) ? (msgs as any).data : msgs
    const last = Array.isArray(msgsData) ? msgsData[msgsData.length - 1] : msgsData
    if (last && "info" in (last as any) && (last as any).info?.role === "user") {
      const m = ((last as any).info as UserMessage).model
      if (m?.providerID && m?.modelID) return m
    } else if (last && "info" in (last as any) && (last as any).info?.role === "assistant") {
      const info = (last as any).info as AssistantMessage
      if (info.providerID && info.modelID) return { providerID: info.providerID, modelID: info.modelID }
    }
  } catch (e) {
    console.warn(`[opencode-new-thread] Could not inherit model from current session: ${e}`)
  }
  return undefined
}

export const NewThreadPlugin: Plugin = async ({ client }) => {
  return {
    tool: {
      new_thread: tool({
        description: DESCRIPTION,
        args: {
          title: tool.schema.string().describe("Title for the new thread").optional(),
          prompt: tool.schema.string().describe("Initial prompt to send into the new thread"),
          model: tool.schema.string().describe("Model to use (e.g. 'opencode/deepseek-v4-flash-free'). Defaults to same model as current session.").optional(),
          directory: tool.schema.string().describe("Working directory for the new thread (e.g. 'C:/Users/sonya/Documents/project'). Defaults to same directory as current session.").optional(),
        },
        async execute(args, context) {
          let model
          if (args.model) {
            model = parseModelArg(args.model)
          } else {
            model = await inheritV1Model(client, context.sessionID)
          }

          const dir = args.directory || context.directory
          const res = await (client as any).session.create({
            body: { title: args.title || "New thread" },
            query: { directory: dir },
          })
          const session = res.data
          if (!session) throw new Error("Session API returned an empty response")
          const { id, title } = session
          if (!id) throw new Error("Session API did not return a session id")
          if (!args.prompt) throw new Error("prompt is required")

          try {
            await (client as any).session.promptAsync({
              path: { id },
              body: {
                parts: [{ type: "text", text: args.prompt }],
                ...(model ? { model } : {}),
              },
              query: { directory: dir },
            })
          } catch (e) {
            console.warn(`[opencode-new-thread] Created thread "${title}" (${id}) but initial prompt may have failed: ${e}`)
          }

          return `Created new thread: "${title}" (id: ${id})`
        },
      }),
    },
  }
}

const v2Definition = V2.define({
  id: "new-thread",
  async setup(ctx) {
    await ctx.tool.transform((editor) => {
      editor.add({
        name: TOOL_NAME,
        description: DESCRIPTION,
        input: {
          type: "object",
          properties: {
            title: { type: "string", description: "Title for the new thread" },
            prompt: { type: "string", description: "Initial prompt to send into the new thread" },
            model: { type: "string", description: "Model to use (e.g. 'opencode/deepseek-v4-flash-free'). Defaults to same model as current session." },
            directory: { type: "string", description: "Working directory for the new thread. Defaults to same directory as current session." },
          },
          required: ["prompt"],
          additionalProperties: false,
        },
        execute: async (rawInput: any, toolCtx: any) => {
          const input = rawInput as { title?: string; prompt: string; model?: string; directory?: string }
          if (!input.prompt) throw new Error("prompt is required")
          const tctx = toolCtx as any
          const fallbackDir = tctx?.sessionID ? undefined : undefined
          void fallbackDir
          const defaultDir = (ctx as any).location?.directory ?? tctx?.directory
          const dir = input.directory || tctx?.directory || defaultDir
          let v2model: { providerID: string; id: string } | undefined
          if (input.model) {
            const parsed = parseModelArg(input.model)
            v2model = { providerID: parsed.providerID, id: parsed.modelID }
          } else {
            try {
              const currentSessionID = tctx?.sessionID as string | undefined
              if (currentSessionID) {
                const current = await (ctx as any).session.get({ sessionID: currentSessionID })
                const m = (current as any)?.model ?? (current as any)?.data?.model
                if (m?.providerID && (m?.id || m?.modelID)) {
                  v2model = { providerID: m.providerID, id: m.id ?? m.modelID }
                }
              }
            } catch (e) {
              console.warn(`[opencode-new-thread] Could not inherit model from current session: ${e}`)
            }
          }
          const created: any = await (ctx as any).session.create({
            title: input.title || "New thread",
            ...(v2model ? { model: v2model } : {}),
            ...(dir ? { location: { directory: dir } } : {}),
          })
          const session = created?.data ?? created
          const id = session?.id
          if (!id) throw new Error("Session API did not return a session id")
          const title = session?.title ?? input.title ?? "New thread"
          try {
            await (ctx as any).session.prompt({ sessionID: id, text: input.prompt })
          } catch (e) {
            console.warn(`[opencode-new-thread] Created thread "${title}" (${id}) but initial prompt may have failed: ${e}`)
          }
          return { content: `Created new thread: "${title}" (id: ${id})` }
        },
      } as any)
    })
  },
})

export default {
  ...v2Definition,
  server: NewThreadPlugin,
}
