# opencode-new-thread

An [opencode](https://opencode.ai) plugin that lets the AI fork off parallel sessions from a conversation. Registers a `new_thread` tool that creates a new session via the SDK client, sends a prompt, inherits the model from the current session, and supports a custom working directory.

## Install

```bash
npm install -g opencode-new-thread
opencode-new-thread
```

The interactive installer lets you choose where to register the plugin:

1. **Global plugins dir** (`~/.config/opencode/plugins/`) -- auto-loaded for every project, zero config
2. **Project plugins dir** (`.opencode/plugins/`) -- scoped to the current project
3. **Global config** (`~/.config/opencode/opencode.json`) -- loaded for all projects via config
4. **Project config** (`opencode.json`) -- loaded for this project only

It checks the selected destination for existing installations and warns before overwriting.

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

- [opencode](https://opencode.ai) with plugin support
- [Bun](https://bun.sh) (used by opencode to install plugin dependencies)

## License

Apache 2.0 — see [LICENSE](LICENSE)
