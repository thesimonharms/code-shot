# @thesimonharms/code-shot

**MCP server that renders source code as beautiful images.** Perfect for AI agents to show code visually to humans on mobile devices, or for sharing syntax-highlighted snippets.

## Tools

### `render_code`

Render source code as SVG or PNG with full syntax highlighting.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `code` | string | **required** | Source code to render |
| `language` | string | auto-detect | Language (ts, rust, py, go, js, and 40+ more) |
| `theme` | string | `github-dark` | Color theme (nord, dracula, catppuccin, one-dark-pro, etc.) |
| `title` | string | — | Window title bar text (e.g. filename) |
| `show_line_numbers` | boolean | `true` | Line number gutter |
| `font_size` | number | `14` | Font size in px |
| `output_format` | `svg\|png` | `svg` | SVG is crisp & copyable; PNG is raster |
| `width` | number | auto | Code area width in characters |
| `padding` | number | `16` | Padding in px |

### `render_diff`

Render a git unified diff with color-coded additions/deletions.

Same options as `render_code`, plus:

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `diff` | string | **required** | Unified diff content (`git diff` output) |

Diff lines are highlighted with:
- `@@` hunk headers → blue background
- `+` additions → green background (`#1b4520` dark / `#dafbe1` light)
- `-` deletions → red background (`#4f1818` dark / `#ffebe9` light)

## Usage with Hermes

Add to `~/.hermes/config.yaml` (local build):

```yaml
mcp_servers:
  code-shot:
    command: "node"
    args: ["/path/to/code-shot/dist/index.js"]
```

Or from npm (after `npm install -g @thesimonharms/code-shot` or via `npx`):

```yaml
mcp_servers:
  code-shot:
    command: "npx"
    args: ["-y", "@thesimonharms/code-shot"]
```

## Configuration

Set defaults via `~/.code-shotrc` (JSON):

```json
{
  "theme": "nord",
  "show_line_numbers": true,
  "font_size": 14,
  "padding": 16
}
```

Also checked (in order): `~/.code-shotrc` > `~/.code-shotrc.json` > `~/.config/code-shot/config.json`.

Tool call arguments override config file values.

## Usage with Claude Code / Cursor

```json
{
  "mcpServers": {
    "code-shot": {
      "command": "node",
      "args": ["/path/to/code-shot/dist/index.js"]
    }
  }
}
```

## Build

```bash
npm install
npm run build
```

## Themes

18 bundled themes: `github-dark`, `github-light`, `nord`, `one-dark-pro`, `one-light`, `dracula`, `dracula-soft`, `catppuccin-mocha`, `catppuccin-latte`, `material-theme`, `material-theme-lighter`, `min-dark`, `min-light`, `solarized-dark`, `solarized-light`, `vitesse-dark`, `vitesse-light`.

## How it works

1. **Shiki** tokenizes the code with full syntax highlighting (grammars for 40+ languages)
2. **SVG renderer** builds a pixel-perfect SVG with monospace positioning, window chrome, line numbers, and diff markers
3. **Optional PNG** via `@resvg/resvg-js` for platforms that don't support SVG natively

No browser, no DOM, no headless Chromium — pure math-based SVG generation.

## License

MIT
