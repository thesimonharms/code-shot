# code-shot: Halfway to v1.0.0

> **For Hermes:** Execute wave-by-wave, commit per wave, push only at the end.

**Goal:** Advance `@thesimonharms/code-shot` from ~40% to ~50% of v1.0.0 readiness — fill the biggest gaps in testing, hardening, and DX.

**Architecture:** Pure TypeScript MCP server. Core rendering in `src/renderer.ts`, tool handlers + parsing in `src/index.ts`, types in `src/types.ts`. Tests in Vitest.

**Tech Stack:** TypeScript, shiki (syntax highlighting), vitest (testing), resvg (PNG output).

---

## Wave 1: Infrastructure fixes

**Objective:** Quick wins — version auto-detection, XML escaping, empty input handling.

### Task 1.1: Read SERVER_VERSION from package.json

**Files:**
- Modify: `src/index.ts` (line 26)

Replace the hardcoded `SERVER_VERSION = '0.1.0'` with a dynamic read from `package.json`:

```typescript
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(resolve(__dirname, '..', 'package.json'), 'utf-8'));
const SERVER_VERSION = pkg.version;
```

Since the server may run from `npx -y @thesimonharms/code-shot` (npm cache), also try `process.cwd()` as a fallback:

```typescript
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
```

**Verify:** `npx tsx src/index.ts` — should see `v0.1.0 starting...` in stderr.

### Task 1.2: Fix XML escaping (add single-quote)

**Files:**
- Modify: `src/renderer.ts` (line 178-182)

The `esc()` function is missing `'` (single quote / apostrophe). Though SVG attribute values use double quotes, `'` inside `<text>` elements should still be escaped for correctness:

```typescript
const esc = (s: string) => s
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;');
```

### Task 1.3: Handle empty code gracefully

**Files:**
- Modify: `src/index.ts` (handleRenderCode and handleRenderDiff)

Currently `render_code` with empty string returns "code is required" — that's fine. But when `code` is a non-empty string of whitespace, or empty diff, the SVG should render a blank grid without crashing.

In `handleRenderCode`, after the `if (!code)` check, ensure the code still produces a valid single-line SVG when it's blank:

```typescript
// In handleRenderCode, after the 'code is required' check
const sanitizedCode = code; // Already validated as non-empty
```

For `handleRenderDiff`, empty diff should return a helpful error OR an empty-looking SVG.

Also add a `render_diff` empty diff check similar to `render_code`:

```typescript
if (!diff) {
  return { content: [{ type: 'text', text: 'Error: diff is required' }], isError: true };
}
```

(This already exists — just verifying it works with blank/whitespace-only diffs.)

Add a test for an empty diff — it should produce a valid SVG with at least the `<svg` tag.

---

## Wave 2: Unit test suite

**Objective:** Comprehensive unit tests for core rendering, diff parsing, and language guessing.

### Task 2.1: Unit tests for renderSvg()

**Files:**
- Create: `tests/renderer.test.ts`

Test the core SVG renderer directly (no MCP, no shiki needed — just construct CodeLine[] manually):

```typescript
import { describe, it, expect } from 'vitest';
import { renderSvg } from '../src/renderer.js';

describe('renderSvg', () => {
  it('produces valid SVG with root element', () => {
    const svg = renderSvg({
      lines: [{ tokens: [{ text: 'hello', color: '#e6edf3' }], lineNumber: 1 }],
      themeName: 'github-dark',
      showLineNumbers: true,
      fontSize: 14,
      padding: 16,
    });
    expect(svg).toContain('<svg');
    expect(svg).toContain('</svg>');
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
  });

  it('includes line numbers in gutter', () => {
    const lines = [
      { tokens: [{ text: 'line1', color: '#e6edf3' }], lineNumber: 1 },
      { tokens: [{ text: 'line2', color: '#e6edf3' }], lineNumber: 2 },
    ];
    const svg = renderSvg({ lines, themeName: 'github-dark', showLineNumbers: true, fontSize: 14, padding: 16 });
    expect(svg).toContain('>1<');
    expect(svg).toContain('>2<');
  });

  it('hides line numbers when showLineNumbers is false', () => {
    const lines = [
      { tokens: [{ text: 'test', color: '#e6edf3' }], lineNumber: 42 },
    ];
    const svg = renderSvg({ lines, themeName: 'github-dark', showLineNumbers: false, fontSize: 14, padding: 16 });
    expect(svg).not.toContain('>42<');
  });

  it('renders diff add lines with green background', () => {
    const lines = [
      { tokens: [{ text: 'added line', color: '#e6edf3' }], lineNumber: 1, diffType: 'add' },
    ];
    const svg = renderSvg({ lines, themeName: 'github-dark', showLineNumbers: true, fontSize: 14, padding: 16 });
    expect(svg).toContain('fill="#1b4520"');
    expect(svg).toContain('>+<');
  });

  it('renders diff del lines with red background', () => {
    const lines = [
      { tokens: [{ text: 'deleted line', color: '#e6edf3' }], lineNumber: 1, diffType: 'del' },
    ];
    const svg = renderSvg({ lines, themeName: 'github-dark', showLineNumbers: true, fontSize: 14, padding: 16 });
    expect(svg).toContain('fill="#4f1818"');
    expect(svg).toContain('>-<');
  });

  it('renders hunk lines with blue background', () => {
    const lines = [
      { tokens: [{ text: '@@ -1,3 +1,4 @@', color: '#8b949e' }], lineNumber: 1, diffType: 'hunk' },
    ];
    const svg = renderSvg({ lines, themeName: 'github-dark', showLineNumbers: true, fontSize: 14, padding: 16 });
    expect(svg).toContain('fill="#1a2332"');
    expect(svg).toContain('>~<');
  });

  it('includes title bar when title is provided', () => {
    const svg = renderSvg({
      lines: [{ tokens: [{ text: 'code', color: '#e6edf3' }], lineNumber: 1 }],
      themeName: 'github-dark',
      title: 'test.ts',
      showLineNumbers: true,
      fontSize: 14,
      padding: 16,
    });
    expect(svg).toContain('test.ts');
    expect(svg).toContain('id="title-grad"');
  });

  it('excludes title bar when title is omitted', () => {
    const svg = renderSvg({
      lines: [{ tokens: [{ text: 'code', color: '#e6edf3' }], lineNumber: 1 }],
      themeName: 'github-dark',
      showLineNumbers: true,
      fontSize: 14,
      padding: 16,
    });
    expect(svg).not.toContain('id="title-grad"');
  });

  it('renders bold and italic tokens correctly', () => {
    const lines = [{
      tokens: [
        { text: 'bold', color: '#e6edf3', fontStyle: 1 },
        { text: 'italic', color: '#e6edf3', fontStyle: 2 },
        { text: 'both', color: '#e6edf3', fontStyle: 3 },
      ],
      lineNumber: 1,
    }];
    const svg = renderSvg({ lines, themeName: 'github-dark', showLineNumbers: true, fontSize: 14, padding: 16 });
    expect(svg).toContain('font-weight="bold"');
    expect(svg).toContain('font-style="italic"');
  });

  it('handles empty lines array', () => {
    const svg = renderSvg({ lines: [], themeName: 'github-dark', showLineNumbers: true, fontSize: 14, padding: 16 });
    expect(svg).toContain('<svg');
    expect(svg).toContain('</svg>');
  });

  it('uses correct theme colors for known themes', () => {
    const svg = renderSvg({
      lines: [{ tokens: [{ text: 'test', color: '#d8dee9' }], lineNumber: 1 }],
      themeName: 'nord',
      showLineNumbers: true,
      fontSize: 14,
      padding: 16,
    });
    expect(svg).toContain('fill="#2e3440"'); // nord bg
  });

  it('escapes XML special characters in code', () => {
    const svg = renderSvg({
      lines: [{ tokens: [{ text: 'a < b > c & d " e', color: '#e6edf3' }], lineNumber: 1 }],
      themeName: 'github-dark',
      showLineNumbers: true,
      fontSize: 14,
      padding: 16,
    });
    expect(svg).toContain('&lt;');
    expect(svg).toContain('&gt;');
    expect(svg).toContain('&amp;');
    expect(svg).toContain('&quot;');
  });
});
```

### Task 2.2: Unit tests for diffToLines()

**Files:**
- Create: `tests/diff.test.ts` (or add to a combined test file)

```typescript
import { describe, it, expect } from 'vitest';
// diffToLines is not exported — we need to either export it or test via the tool handler
// Option A: Export diffToLines from index.ts
// Option B: Test indirectly via handleRenderDiff

// Since diffToLines is internal, we'll export it for testing.
```

**Approach:** Export `diffToLines` from `src/index.ts` (add to the existing export or mark as `@internal` for tests).

```typescript
// In src/index.ts, change:
// function diffToLines(...) -> export function diffToLines(...)
```

Then test:

```typescript
import { describe, it, expect } from 'vitest';
import { diffToLines } from '../src/index.js';

describe('diffToLines', () => {
  it('parses a simple diff with add and del lines', () => {
    const diff = `@@ -1,3 +1,4 @@
- old line
+ new line
 context`;
    const lines = diffToLines(diff);
    expect(lines.length).toBe(3);
    expect(lines[0].diffType).toBe('hunk');
    expect(lines[1].diffType).toBe('del');
    expect(lines[1].tokens[0].text).toBe(' old line');
    expect(lines[2].diffType).toBe('add');
    expect(lines[2].tokens[0].text).toBe(' new line');
  });

  it('filters git metadata before first hunk', () => {
    const diff = `commit abc123
Author: Test
Date: Mon Jan 1
    commit message body
diff --git a/file.ts b/file.ts
index abc..def 100644
--- a/file.ts
+++ b/file.ts
@@ -1 +1 @@
-old
+new`;
    const lines = diffToLines(diff);
    expect(lines[0].diffType).toBe('hunk');
    expect(lines[1].tokens[0].text).toBe('old');
    expect(lines[2].tokens[0].text).toBe('new');
  });

  it('handles empty diff', () => {
    const lines = diffToLines('');
    expect(lines).toEqual([]);
  });

  it('handles diff with only context lines', () => {
    const diff = `@@ -1,2 +1,2 @@
 context1
 context2`;
    const lines = diffToLines(diff);
    expect(lines.length).toBe(3);
    expect(lines[1].diffType).toBe('normal');
    expect(lines[2].diffType).toBe('normal');
  });
});
```

### Task 2.3: Unit tests for guessLanguage()

**Files:**
- Modify: `src/index.ts` (export `guessLanguage`)
- Create: `tests/guess-language.test.ts`

Export `guessLanguage`:

```typescript
export function guessLanguage(code: string): string {
  // ...existing implementation...
}
```

Tests:

```typescript
import { describe, it, expect } from 'vitest';
import { guessLanguage } from '../src/index.js';

describe('guessLanguage', () => {
  it('detects python from shebang', () => {
    expect(guessLanguage('#!/usr/bin/env python3\nprint("hello")')).toBe('python');
    expect(guessLanguage('#!/usr/bin/python\nprint("hello")')).toBe('python');
  });

  it('detects bash from shebang', () => {
    expect(guessLanguage('#!/bin/bash\necho hello')).toBe('bash');
    expect(guessLanguage('#!/bin/sh\necho hello')).toBe('bash');
  });

  it('detects TypeScript from import/interface', () => {
    expect(guessLanguage('import { foo } from "bar";')).toBe('typescript');
    expect(guessLanguage('interface Foo { bar: string }')).toBe('typescript');
    expect(guessLanguage('const x: number = 5;')).toBe('typescript');
  });

  it('detects Rust from fn/let mut/use', () => {
    expect(guessLanguage('fn main() {\n  println!("hi");\n}')).toBe('rust');
    expect(guessLanguage('let mut x = 5;')).toBe('rust');
    expect(guessLanguage('use std::io;')).toBe('rust');
  });

  it('detects Go from func/package', () => {
    expect(guessLanguage('package main\nfunc main() {}')).toBe('go');
  });

  it('detects Python from def/import', () => {
    expect(guessLanguage('def hello(): pass')).toBe('python');
    expect(guessLanguage('import os')).toBe('python');
    expect(guessLanguage('from typing import List')).toBe('python');
  });

  it('detects JavaScript from require', () => {
    expect(guessLanguage('const x = require("fs");')).toBe('javascript');
    expect(guessLanguage('export default function() {}')).toBe('javascript');
  });

  it('detects HTML from template tags', () => {
    expect(guessLanguage('<template>')).toBe('html');
    expect(guessLanguage('<!DOCTYPE html>')).toBe('html');
  });

  it('detects JSON from dependencies pattern', () => {
    expect(guessLanguage('{"dependencies": {}}')).toBe('json');
  });

  it('falls back to text for unknown code', () => {
    expect(guessLanguage('some random text without any keywords')).toBe('text');
  });

  it('handles empty string', () => {
    expect(guessLanguage('')).toBe('text');
  });
});
```

### Task 2.4: Integration test for handleRenderCode error cases

**Files:**
- Modify: `tests/code-shot.test.ts`

Add tests for edge cases through the MCP interface:

```typescript
import { describe, it, expect } from 'vitest';
import { spawn } from 'node:child_process';

// ...existing MCP client helpers...

describe('error handling', () => {
  it('returns error for empty code', async () => {
    const result = await callTool('render_code', { code: '' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('code is required');
  });

  it('returns error for missing code', async () => {
    const result = await callTool('render_code', {});
    expect(result.isError).toBe(true);
  });

  it('returns error for empty diff', async () => {
    const result = await callTool('render_diff', { diff: '' });
    expect(result.isError).toBe(true);
  });

  it('renders with unknown theme as plain text (no crash)', async () => {
    const result = await callTool('render_code', {
      code: 'const x = 1;',
      theme: 'nonexistent-theme',
    });
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain('<svg');
  });
});
```

---

## Wave 3: Feature — per-hunk language highlighting in render_diff

**Objective:** When rendering a diff, auto-detect the language from `diff --git a/FILE` headers and apply actual syntax highlighting per hunk instead of using `lang: 'diff'`.

**Files:**
- Modify: `src/index.ts` (handleRenderDiff and diffToLines)
- Modify: `src/types.ts` (RenderDiffArgs — add highlight_language param)

### Task 3.1: Extract language from diff headers

In `diffToLines` or a new helper, parse `diff --git a/file.ts b/file.ts` to extract extension:

```typescript
const EXTENSION_TO_LANG: Record<string, string> = {
  '.ts': 'typescript', '.tsx': 'tsx',
  '.js': 'javascript', '.jsx': 'jsx',
  '.py': 'python', '.rs': 'rust',
  '.go': 'go', '.java': 'java',
  '.rb': 'ruby', '.php': 'php',
  '.c': 'c', '.cpp': 'cpp', '.h': 'c',
  '.cs': 'csharp', '.swift': 'swift',
  '.kt': 'kotlin', '.scala': 'scala',
  '.css': 'css', '.html': 'html', '.json': 'json',
  '.yaml': 'yaml', '.yml': 'yaml',
  '.md': 'markdown', '.sql': 'sql',
  '.sh': 'bash', '.bash': 'bash',
  '.toml': 'toml', '.xml': 'xml',
  '.zig': 'zig', '.nim': 'nim',
};

function detectDiffLanguage(diff: string): string {
  const match = diff.match(/^diff --git a\/\S+\.(\w+)/m);
  if (match) {
    const ext = '.' + match[1];
    return EXTENSION_TO_LANG[ext] || 'diff';
  }
  return 'diff';
}
```

### Task 3.2: Add highlight_language param to RenderDiffArgs

```typescript
export interface RenderDiffArgs {
  // ...existing fields...
  /** Language for syntax highlighting within diff hunks. Auto-detected from file extension if omitted. Use 'diff' for plain diff highlighting. */
  highlight_language?: string;
}
```

### Task 3.3: Apply language-specific highlighting in handleRenderDiff

Replace `lang: 'diff'` with the detected or provided language:

```typescript
const highlightLang = cfg.highlight_language || detectDiffLanguage(diff);

for (const line of lines) {
  if (line.diffType === 'hunk') continue;
  const content = line.tokens[0]?.text || '';
  if (!content.trim()) continue;
  try {
    const themedTokens = hl.codeToTokensBase(content, {
      lang: highlightLang as any,
      theme: themeName as any,
    });
    // ... rebuild tokens ...
  } catch {
    // keep fallback
  }
}
```

### Task 3.4: Add test for language-specific diff highlighting

```typescript
it('render_diff › syntax highlights within diff hunks', async () => {
  const diff = `diff --git a/test.ts b/test.ts
@@ -1,3 +1,4 @@
-const x: number = 1;
+const x: number = 2;
+const y: string = "hello";`;
  const result = await callTool('render_diff', { diff, highlight_language: 'typescript' });
  expect(result.content[0].text).toContain('<svg');
  // Should have actual TS syntax tokens, not just plain diff tokens
  expect(result.content[0].text).toContain('number');
});
```

---

## Wave 4: README gallery + cleanup

**Objective:** Add rendered example images to README and final cleanup.

### Task 4.1: Generate example SVGs

Use the MCP server itself to generate example outputs for the README:

```bash
# Generate examples
echo '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"render_code","arguments":{"code":"fn main() {\\n    println!(\\"Hello, world!\\");\\n}","language":"rust","title":"hello.rs","theme":"nord"}}}' | npx tsx src/index.ts
```

Save each SVG to `examples/` directory.

### Task 4.2: Update README with example gallery

Add a gallery section showing each theme as a rendered example, with usage examples for each tool.

**Files:**
- Modify: `README.md`

---

## Execution order

1. Wave 1 (infrastructure fixes) — commit each
2. Wave 2 (test suite) — commit each
3. Wave 3 (per-hunk language highlighting) — commit each
4. Wave 4 (README gallery) — commit
5. Push code-shot to GitHub
6. Push cobasaja to GitHub
