# opencode-new-thread

An [opencode](https://opencode.ai) plugin that lets the AI fork off parallel sessions from a conversation. Registers a `new_thread` tool that creates a new session via the SDK client, sends a prompt, inherits the model from the current session, and supports a custom working directory.

## Install

```bash
npm install -g opencode-new-thread
opencode-new-thread
```

### Manual setup

Place the plugin files into your project's `.opencode/plugins/new-thread.ts` and add `@opencode-ai/plugin` to `.opencode/package.json`. OpenCode runs `bun install` at startup to resolve dependencies.

## Usage

Once loaded, the AI can call `new_thread` with:

| Parameter   | Type   | Required | Description |
|-------------|--------|----------|-------------|
| `title`     | string | no       | Label for the new thread |
| `prompt`    | string | **yes**  | Initial prompt to send |
| `model`     | string | no       | Model override (e.g. `"opencode/deepseek-v4-flash-free"`) |
| `directory` | string | no       | Working directory for the new thread |

## Requirements

- [opencode](https://opencode.ai)
- [Bun](https://bun.sh) (used by opencode to install plugin dependencies)

## License

Apache 2.0 — see [LICENSE](LICENSE)
