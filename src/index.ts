#!/usr/bin/env node

/**
 * code-shot — MCP server for rendering code as beautiful images.
 *
 * Tools:
 *   render_code  — Render source code as SVG/PNG with syntax highlighting
 *   render_diff  — Render a git unified diff as SVG/PNG
 */

import { createInterface } from 'node:readline';
import { createHighlighter, type Highlighter, type BundledLanguage, type BundledTheme, type SpecialLanguage } from 'shiki';
import { writeFile, mkdir } from 'node:fs/promises';
import { tmpdir, homedir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import type { RenderCodeArgs, RenderDiffArgs, MCPResponse, CodeLine, CodeToken, CodeShotConfig } from './types.js';
import { renderSvg, svgToPng } from './renderer.js';
import { diffToLines, guessLanguage, detectDiffLanguage } from './parse.js';
import { existsSync, readFileSync } from 'node:fs';

// ── Configuration ────────────────────────────────────────────────────────────

const SERVER_NAME = 'code-shot';

function loadVersion(): string {
  try {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(readFileSync(resolve(__dirname, '..', 'package.json'), 'utf-8'));
    return pkg.version;
  } catch {
    try {
      const pkg = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf-8'));
      return pkg.version;
    } catch {
      return '0.0.0';
    }
  }
}
const SERVER_VERSION = loadVersion();

// ── User Config ──────────────────────────────────────────────────────────────

function loadConfig(): CodeShotConfig {
  const paths = [
    resolve(homedir(), '.code-shotrc'),
    resolve(homedir(), '.code-shotrc.json'),
    resolve(homedir(), '.config', 'code-shot', 'config.json'),
  ];
  for (const p of paths) {
    if (existsSync(p)) {
      try {
        const raw = readFileSync(p, 'utf-8');
        return JSON.parse(raw) as CodeShotConfig;
      } catch {
        console.error(`[code-shot] warning: failed to parse config at ${p}`);
      }
    }
  }
  return {};
}

const userConfig = loadConfig();

/** Merge user config defaults with tool-provided arguments (args win) */
function mergeConfig<T extends object>(args: T): T & Record<string, unknown> {
  // Start from user config; let present (non-null/undefined) args override.
  const merged: Record<string, unknown> = { ...userConfig };
  for (const [k, v] of Object.entries(args as Record<string, unknown>)) {
    if (v !== undefined && v !== null) merged[k] = v;
  }
  // Unchecked cast: merged is args' shape with userConfig defaults sprinkled in.
  return merged as T & Record<string, unknown>;
}

// Languages we support — a broad set for good highlighting
const LANGUAGES: BundledLanguage[] = [
  'typescript', 'javascript', 'jsx', 'tsx', 'python', 'rust', 'go', 'bash',
  'css', 'html', 'json', 'yaml', 'markdown', 'sql', 'dockerfile', 'graphql',
  'ruby', 'php', 'java', 'c', 'cpp', 'csharp', 'swift', 'kotlin',
  'scala', 'lua', 'perl', 'r', 'elixir', 'haskell', 'zig', 'nim',
  'solidity', 'move', 'toml', 'xml', 'regex', 'shell', 'powershell',
  'diff',
];

// Themes we bundle
const THEMES: BundledTheme[] = [
  'github-dark', 'github-light', 'nord', 'one-dark-pro', 'one-light',
  'dracula', 'dracula-soft', 'catppuccin-mocha', 'catppuccin-latte',
  'material-theme', 'material-theme-lighter', 'min-dark', 'min-light',
  'solarized-dark', 'solarized-light', 'vitesse-dark', 'vitesse-light',
];

// ── Highlighter instance (lazy init) ─────────────────────────────────────────

let shiki: Highlighter | null = null;

async function getHighlighter(): Promise<Highlighter> {
  if (!shiki) {
    shiki = await createHighlighter({
      themes: THEMES,
      langs: LANGUAGES,
    });
  }
  return shiki;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Resolve a bundled theme's real bg/fg from shiki, so unmapped themes (esp.
 *  light ones) render with correct colors. Returns {} for unknown themes so
 *  the renderer falls back to its curated defaults. */
function resolveThemeColors(hl: Highlighter, themeName: string): { bg?: string; fg?: string } {
  try {
    const t = hl.getTheme(themeName as BundledTheme);
    return { bg: t.bg, fg: t.fg };
  } catch {
    return {};
  }
}

/** Coerce a config arg to a finite number clamped to [min, ∞), else fallback. */
function clampNumber(v: unknown, fallback: number, min: number): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n >= min ? n : fallback;
}

/** Normalize highlight_lines into finite numbers (defends against JSON callers
 *  passing strings), or undefined when absent/invalid. */
function normalizeHighlightLines(v: unknown): number[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = v.map(Number).filter(n => Number.isFinite(n));
  return out.length ? out : undefined;
}

/** Write a JSON-RPC message to stdout, awaiting backpressure drain so large
 *  SVG responses are not silently dropped under pipe backpressure. */
async function send(rpc: string): Promise<void> {
  const ok = process.stdout.write(rpc);
  if (!ok) await new Promise<void>(r => process.stdout.once('drain', r));
}

/** Safely extract a message from a thrown value (catch params are unknown). */
function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

// ── Tool Handlers ────────────────────────────────────────────────────────────
async function handleRenderCode(args: RenderCodeArgs): Promise<MCPResponse> {
  try {
    const code = args.code;
    if (!code) {
      return { content: [{ type: 'text', text: 'Error: code is required' }], isError: true };
    }

    const cfg = mergeConfig(args);
    const language = cfg.language || guessLanguage(code);
    const themeName = cfg.theme || 'github-dark';
    const showLineNumbers = cfg.show_line_numbers !== false;
    const fontSize = clampNumber(cfg.font_size, 14, 1);
    const padding = clampNumber(cfg.padding, 16, 0);
    // output_format arg wins; else user-config default_format; else 'svg'.
    const outputFormat = cfg.output_format || userConfig.default_format || 'svg';

    const hl = await getHighlighter();
    const { bg: themeBg, fg: themeFg } = resolveThemeColors(hl, themeName);
    const fg = themeFg || '#e6edf3';

    // Highlight. Unknown lang or theme throws; fall back to a single plain
    // token per line so rendering still succeeds (matches "renders with
    // unknown theme without crashing" contract).
    let themedTokens: { content: string; color?: string; fontStyle?: number }[][];
    try {
      themedTokens = hl.codeToTokensBase(code, {
        // Unchecked cast: shiki's lang union is BundledLanguage | SpecialLanguage;
        // a caller may pass any string (errors caught above).
        lang: language as unknown as BundledLanguage | SpecialLanguage,
        theme: themeName as unknown as BundledTheme,
      });
    } catch {
      const codeLines = code.split('\n');
      themedTokens = codeLines.map(l => [{ content: l, color: undefined, fontStyle: undefined }]);
    }

    // Build CodeLines
    const lines: CodeLine[] = [];
    for (let i = 0; i < Math.max(themedTokens.length, 1); i++) {
      const tokenLine = themedTokens[i] || [];
      const tokens: CodeToken[] = tokenLine.map(t => ({
        text: t.content,
        color: t.color || fg,
        fontStyle: t.fontStyle,
      }));
      lines.push({
        tokens: tokens.length > 0 ? tokens : [{ text: '', color: fg }],
        lineNumber: i + 1,
      });
    }

    const width = typeof cfg.width === 'number' && Number.isFinite(cfg.width) && cfg.width >= 1 ? cfg.width : undefined;
    const svg = renderSvg({
      lines,
      themeName,
      themeBg,
      themeFg,
      title: cfg.title,
      showLineNumbers,
      fontSize,
      padding,
      width,
      transparentBackground: cfg.transparent_background,
      highlightLines: normalizeHighlightLines(cfg.highlight_lines),
    });

    if (outputFormat === 'png') {
      const png = await svgToPng(svg);
      const filename = `code-shot-${randomUUID().slice(0, 8)}.png`;
      const outDir = join(tmpdir(), 'code-shot');
      await mkdir(outDir, { recursive: true });
      const outPath = join(outDir, filename);
      await writeFile(outPath, png);
      return { content: [{ type: 'text', text: `PNG written to ${outPath}` }] };
    }

    return { content: [{ type: 'text', text: svg }] };
  } catch (err: unknown) {
    return { content: [{ type: 'text', text: `Error: ${errMsg(err)}` }], isError: true };
  }
}

async function handleRenderDiff(args: RenderDiffArgs): Promise<MCPResponse> {
  try {
    const diff = args.diff;
    if (!diff) {
      return { content: [{ type: 'text', text: 'Error: diff is required' }], isError: true };
    }

    const cfg = mergeConfig(args);
    const themeName = cfg.theme || 'github-dark';
    const showLineNumbers = cfg.show_line_numbers !== false;
    const fontSize = clampNumber(cfg.font_size, 14, 1);
    const padding = clampNumber(cfg.padding, 16, 0);
    const outputFormat = cfg.output_format || userConfig.default_format || 'svg';
    const highlightLang = cfg.highlight_language || detectDiffLanguage(diff);
    const hl = await getHighlighter();
    const { bg: themeBg, fg: themeFg } = resolveThemeColors(hl, themeName);
    const fg = themeFg || '#e6edf3';

    // Parse diff into structured lines
    const lines = diffToLines(diff);

    // Apply syntax highlighting to each line's content (diff markers were
    // stripped by diffToLines). Unknown lang/theme throws and we keep the
    // plain-text tokens already on the line.
    for (const line of lines) {
      if (line.diffType === 'hunk') continue; // hunk headers stay plain text

      const content = line.tokens[0]?.text || '';
      if (!content.trim()) continue;

      try {
        const themedTokens = hl.codeToTokensBase(content, {
          // Unchecked cast: shiki lang union; caller may pass any string.
          lang: highlightLang as unknown as BundledLanguage | SpecialLanguage,
          theme: themeName as unknown as BundledTheme,
        });

        const newTokens: CodeToken[] = [];
        for (const tokenLine of themedTokens) {
          for (const t of tokenLine) {
            newTokens.push({
              text: t.content,
              color: t.color || fg,
              fontStyle: t.fontStyle,
            });
          }
        }

        if (newTokens.length > 0) {
          line.tokens = newTokens;
        }
      } catch {
        // Keep plain text fallback
      }
    }

    const svg = renderSvg({
      lines,
      themeName,
      themeBg,
      themeFg,
      title: cfg.title,
      showLineNumbers,
      fontSize,
      padding,
      transparentBackground: cfg.transparent_background,
      highlightLines: normalizeHighlightLines(cfg.highlight_lines),
    });

    if (outputFormat === 'png') {
      const png = await svgToPng(svg);
      const filename = `code-shot-diff-${randomUUID().slice(0, 8)}.png`;
      const outDir = join(tmpdir(), 'code-shot');
      await mkdir(outDir, { recursive: true });
      const outPath = join(outDir, filename);
      await writeFile(outPath, png);
      return { content: [{ type: 'text', text: `PNG written to ${outPath}` }] };
    }

    return { content: [{ type: 'text', text: svg }] };
  } catch (err: unknown) {
    return { content: [{ type: 'text', text: `Error: ${errMsg(err)}` }], isError: true };
  }
}

// ── Tool Definitions ─────────────────────────────────────────────────────────

interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'render_code',
    description: `Render source code as a syntax-highlighted image (SVG or PNG). Perfect for AI agents to show code visually to humans on mobile devices.

The output is an SVG string by default (crisp, copyable, small). Set output_format='png' for a raster image (written to a temp file).

Supports 40+ themes including github-dark, github-light, nord, dracula, one-dark-pro, catppuccin, material-theme, and more.

Supports 40+ languages via shiki: TypeScript, Rust, Python, Go, JavaScript, JSX/TSX, CSS, HTML, JSON, YAML, Markdown, SQL, Dockerfile, GraphQL, Ruby, PHP, Java, C/C++, C#, Swift, Kotlin, Scala, Lua, Perl, R, Elixir, Haskell, Zig, Nim, Solidity, Move, TOML, XML, shell/bash, PowerShell, and more.

When you call this tool, include the full code and tell the user the image is being rendered.`,
    inputSchema: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'The source code to render as an image',
        },
        language: {
          type: 'string',
          description: 'Programming language for syntax highlighting. Auto-detected if omitted.',
          default: 'auto',
        },
        theme: {
          type: 'string',
          description: 'Color theme name. Popular: github-dark, github-light, nord, dracula-soft, one-dark-pro, catppuccin-mocha, material-theme, min-dark, solarized-dark, vitesse-dark.',
          default: 'github-dark',
        },
        title: {
          type: 'string',
          description: 'Optional title shown in a window title bar (e.g. the filename)',
        },
        show_line_numbers: {
          type: 'boolean',
          description: 'Show line numbers in the gutter',
          default: true,
        },
        font_size: {
          type: 'number',
          description: 'Font size in pixels',
          default: 14,
        },
        output_format: {
          type: 'string',
          enum: ['svg', 'png'],
          description: "Output format. 'svg' produces crisp, copyable vector output. 'png' produces a raster image saved to a temp file.",
          default: 'svg',
        },
        width: {
          type: 'number',
          description: 'Width of the code area in characters. Default: fits the longest line.',
        },
        padding: {
          type: 'number',
          description: 'Padding around the code block in pixels',
          default: 16,
        },
        transparent_background: {
          type: 'boolean',
          description: 'Use transparent background instead of theme background color. Default: false',
          default: false,
        },
        highlight_lines: {
          type: 'array',
          items: { type: 'number' },
          description: 'Line numbers to highlight (1-indexed). Example: [3, 7, 12]. Default: none',
        },
      },
      required: ['code'],
    },
  },
  {
    name: 'render_diff',
    description: `Render a git unified diff as a beautiful syntax-highlighted image (SVG or PNG). Shows additions in green and deletions in red with diff markers.

Perfect for PR reviews, sharing code changes on mobile, or visualising what changed between two versions.

Accepts standard git diff output (unified format). Automatically parses @@ hunk headers and renders additions/deletions with appropriate backgrounds. Syntax highlighting is language-aware — auto-detected from the diff header (e.g. "diff --git a/file.ts b/file.ts" detects TypeScript).

The output is SVG by default. Set output_format='png' for a raster image.`,
    inputSchema: {
      type: 'object',
      properties: {
        diff: {
          type: 'string',
          description: 'The unified diff content (e.g. output of `git diff` or `git show`). Should include @@ hunk headers and +/- markers.',
        },
        theme: {
          type: 'string',
          description: 'Color theme name',
          default: 'github-dark',
        },
        title: {
          type: 'string',
          description: 'Optional title shown in a window title bar',
        },
        show_line_numbers: {
          type: 'boolean',
          description: 'Show line numbers in the gutter',
          default: true,
        },
        font_size: {
          type: 'number',
          description: 'Font size in pixels',
          default: 14,
        },
        output_format: {
          type: 'string',
          enum: ['svg', 'png'],
          description: "Output format. 'svg' or 'png'.",
          default: 'svg',
        },
        padding: {
          type: 'number',
          description: 'Padding around the code block in pixels',
          default: 16,
        },
        highlight_language: {
          type: 'string',
          description: 'Language for syntax highlighting within diff hunks. Auto-detected from file extension if omitted (e.g. from "diff --git a/file.ts b/file.ts"). Set to "diff" for plain diff highlighting.',
        },
        transparent_background: {
          type: 'boolean',
          description: 'Use transparent background instead of theme background color. Default: false',
          default: false,
        },
        highlight_lines: {
          type: 'array',
          items: { type: 'number' },
          description: 'Line numbers to highlight (1-indexed). Example: [3, 7, 12]. Default: none',
        },
      },
      required: ['diff'],
    },
  },
];

// ── JSON-RPC helpers ─────────────────────────────────────────────────────────

interface RpcMessage {
  jsonrpc: '2.0';
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

function rpcResult(id: string | number | null, result: unknown): string {
  return JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n';
}

function rpcError(id: string | number | null, code: number, message: string): string {
  return JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }) + '\n';
}

// ── Main Entry ───────────────────────────────────────────────────────────────

async function main() {
  console.error(`[${SERVER_NAME}] v${SERVER_VERSION} starting...`);

  const rl = createInterface({ input: process.stdin });

  for await (const line of rl) {
    if (!line.trim()) continue;

    let msg: RpcMessage;
    try {
      msg = JSON.parse(line);
    } catch {
      continue;
    }

    const msgId = msg.id ?? null;

    switch (msg.method) {
      case 'initialize':
        await send(rpcResult(msgId, {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {}, logging: {} },
          serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
        }));
        break;

      case 'notifications/initialized':
        // No-op
        break;

      case 'tools/list':
        await send(rpcResult(msgId, { tools: TOOL_DEFINITIONS }));
        break;

      case 'tools/call': {
        // Narrow msg.params (Record<string, unknown>) with type guards so the
        // extracted name/arguments are checked, not asserted via inline casts.
        const params = msg.params;
        const toolName = params && typeof params === 'object' && 'name' in params && typeof params.name === 'string'
          ? params.name
          : '';
        const rawArgs = params && typeof params === 'object' && 'arguments' in params && typeof params.arguments === 'object' && params.arguments !== null
          ? params.arguments
          : {};
        const toolArgs = rawArgs as Record<string, unknown>;

        try {
          let result: MCPResponse;

          switch (toolName) {
            case 'render_code':
              result = await handleRenderCode(toolArgs as unknown as RenderCodeArgs);
              break;
            case 'render_diff':
              result = await handleRenderDiff(toolArgs as unknown as RenderDiffArgs);
              break;
            default:
              await send(rpcError(msgId, -32601, `Unknown tool: ${toolName}`));
              continue;
          }

          await send(rpcResult(msgId, result));
        } catch (err: unknown) {
          await send(rpcError(msgId, -32603, errMsg(err)));
        }
        break;
      }

      case 'ping':
        await send(rpcResult(msgId, {}));
        break;

      default:
        // Unknown method: reply -32601 if this is a request (has an id);
        // silently ignore notifications (id absent) per JSON-RPC 2.0.
        if (msgId !== null && msg.id !== undefined) {
          await send(rpcError(msgId, -32601, `Method not found: ${msg.method ?? ''}`));
        }
        break;
    }
  }
}

main().catch((err: unknown) => {
  console.error(`[${SERVER_NAME}] fatal: ${errMsg(err)}`);
  process.exit(1);
});
