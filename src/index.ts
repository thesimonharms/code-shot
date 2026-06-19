#!/usr/bin/env node

/**
 * code-shot — MCP server for rendering code as beautiful images.
 *
 * Tools:
 *   render_code  — Render source code as SVG/PNG with syntax highlighting
 *   render_diff  — Render a git unified diff as SVG/PNG
 */

import { createInterface } from 'node:readline';
import { createHighlighter, type Highlighter, type BundledLanguage, type BundledTheme } from 'shiki';
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
function mergeConfig<T extends Record<string, any>>(args: T): T {
  const merged = { ...userConfig } as any;
  for (const [k, v] of Object.entries(args)) {
    if (v !== undefined && v !== null) merged[k] = v;
  }
  return merged as T;
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

// ── Tool Handlers ────────────────────────────────────────────────────────────

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
    const fontSize = cfg.font_size || 14;
    const padding = cfg.padding ?? 16;
    const outputFormat = cfg.output_format || 'svg';

    const hl = await getHighlighter();

    // Highlight using shiki
    const themedTokens = hl.codeToTokensBase(code, {
      lang: language as any,
      theme: themeName as any,
    });

    // If shiki doesn't know the theme, fall back to plain text
    let fg = '#e6edf3';
    try {
      const bgColor = hl.getTheme(themeName as any).bg;
    } catch {
      // Fallback to plain text tokens
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

    const svg = renderSvg({
      lines,
      themeName,
      title: cfg.title,
      showLineNumbers,
      fontSize,
      padding,
      width: cfg.width,
      transparentBackground: cfg.transparent_background,
      highlightLines: cfg.highlight_lines,
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
  } catch (err: any) {
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
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
    const fontSize = cfg.font_size || 14;
    const padding = cfg.padding ?? 16;
    const outputFormat = cfg.output_format || 'svg';
    const highlightLang = cfg.highlight_language || detectDiffLanguage(diff);
    const hl = await getHighlighter();

    // Parse diff into structured lines
    const lines = diffToLines(diff);

    // Now apply syntax highlighting to the content (strip diff markers first)
    for (const line of lines) {
      if (line.diffType === 'hunk') continue; // skip hunk headers, they're plain text

      const content = line.tokens[0]?.text || '';
      if (!content.trim()) continue;

      try {
        const themedTokens = hl.codeToTokensBase(content, {
          lang: highlightLang as any,
          theme: themeName as any,
        });

        // Rebuild tokens from highlighting
        const newTokens: CodeToken[] = [];
        for (const tokenLine of themedTokens) {
          for (const t of tokenLine) {
            newTokens.push({
              text: t.content,
              color: t.color || '#e6edf3',
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
      title: cfg.title,
      showLineNumbers,
      fontSize,
      padding,
      transparentBackground: cfg.transparent_background,
      highlightLines: cfg.highlight_lines,
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
  } catch (err: any) {
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
  }
}

// ── Tool Definitions ─────────────────────────────────────────────────────────

interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, any>;
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
        process.stdout.write(rpcResult(msgId, {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {}, logging: {} },
          serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
        }));
        break;

      case 'notifications/initialized':
        // No-op
        break;

      case 'tools/list':
        process.stdout.write(rpcResult(msgId, { tools: TOOL_DEFINITIONS }));
        break;

      case 'tools/call': {
        const params = msg.params as any;
        const toolName = params?.name ?? '';
        const toolArgs = (params?.arguments as Record<string, unknown>) ?? {};

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
              process.stdout.write(rpcError(msgId, -32601, `Unknown tool: ${toolName}`));
              continue;
          }

          process.stdout.write(rpcResult(msgId, result));
        } catch (err: any) {
          process.stdout.write(rpcError(msgId, -32603, err.message));
        }
        break;
      }

      case 'ping':
        process.stdout.write(rpcResult(msgId, {}));
        break;
    }
  }
}

main().catch(err => {
  console.error(`[${SERVER_NAME}] fatal: ${err.message}`);
  process.exit(1);
});
