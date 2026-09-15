# opencode-new-thread

An [opencode](https://opencode.ai) plugin that lets the AI fork off parallel sessions from a conversation. Registers a `new_thread` tool that creates a new session via the SDK client, sends a prompt, inherits the model from the current session, and supports a custom working directory.

## Install

```bash
bun install -g opencode-new-thread
opencode-new-thread
```

## Usage

Once loaded, the AI can call `new_thread` with:

| Parameter   | Type   | Required | Description |
|-------------|--------|----------|-------------|
| `title`     | string | no       | Label for the new thread |
| `prompt`    | string | **yes**  | Initial prompt to send |
| `model`     | string | no       | Model override (e.g. `"opencode/deepseek-v4-flash-free"`) |
| `directory` | string | no       | Working directory for the new thread |

## Requirements

- [opencode](https://opencode.ai) v1 (`1.18.29+` for the object-form plugin) or v2 (`beta`, see https://opencode.ai/v2/docs/build/plugins/)
- [Bun](https://bun.sh) (used by opencode (and you) to install plugin dependencies)

The same install supports both: the plugin exports V1 `server()` and V2 `setup()` from one entrypoint, and the installer writes both `plugin` and `plugins` config keys and refreshes both `.opencode/plugins/` and `.opencode/plugin/` copies plus `opencode.jsonc`.

## License

Apache 2.0, see [LICENSE](LICENSE)
