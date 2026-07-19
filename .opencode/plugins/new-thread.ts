import { type Plugin, tool } from "@opencode-ai/plugin"
import type { UserMessage, AssistantMessage } from "@opencode-ai/sdk"

export const NewThreadPlugin: Plugin = async ({ client }) => {
  return {
    tool: {
      new_thread: tool({
        description: "Only use when the user explicitly asks to start a new chat thread or open a new tab. Creates a new top-level session in the GUI.",
        args: {
          title: tool.schema.string().describe("Title for the new thread").optional(),
          prompt: tool.schema.string().describe("Optional initial prompt to send into the new thread").optional(),
          model: tool.schema.string().describe("Model to use (e.g. 'opencode/deepseek-v4-flash-free'). Defaults to same model as current session.").optional(),
          directory: tool.schema.string().describe("Working directory for the new thread (e.g. 'C:/Users/sonya/Documents/project'). Defaults to same directory as current session.").optional(),
        },
        async execute(args, context) {
          let model
          if (args.model) {
            const [providerID, modelID] = args.model.split("/")
            model = { providerID, modelID }
          } else {
            try {
              const msgs = await client.session.messages({ path: { id: context.sessionID }, query: { limit: 1 } })
              const msgsData = msgs.data ?? msgs
              const last = Array.isArray(msgsData) ? msgsData[msgsData.length - 1] : msgsData
              if (last?.info?.role === "user") {
                const m = (last.info as UserMessage).model
                if (m?.providerID && m?.modelID) model = m
              } else if (last?.info?.role === "assistant") {
                const info = last.info as AssistantMessage
                if (info.providerID && info.modelID) model = { providerID: info.providerID, modelID: info.modelID }
              }
            } catch {}
          }
          const dir = args.directory || context.directory
          const res = await client.session.create({
            body: { title: args.title || "New thread" },
            query: { directory: dir },
          })
          const id = res.data?.id ?? res.id
          const title = res.data?.title ?? res.title
          if (args.prompt && id) {
            try {
              await client.session.prompt({
                path: { id },
                body: {
                  parts: [{ type: "text", text: args.prompt }],
                  ...(model ? { model } : {}),
                },
                query: { directory: dir },
              })
            } catch (e) {
              return `Created new thread: "${title}" (id: ${id}) — prompt failed: ${e}`
            }
          }
          return `Created new thread: "${title}" (id: ${id})`
        },
      }),
    },
  }
}
