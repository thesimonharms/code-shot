/**
 * Test code-shot MCP server using cobasaja.
 * Run: cd ~/code-shot && npx cobasaja
 */

import { defineServer, describe, it, expect } from 'cobasaja';

defineServer({
  command: 'node',
  args: ['dist/index.js'],
  timeout: 30000,
});

it('lists expected tools', async ({ tools }) => {
  expect(tools).toHaveTool('render_code');
  expect(tools).toHaveTool('render_diff');
  expect(tools.length).toBe(2);
});

describe('render_code', () => {
  it('renders a simple code snippet as SVG', async ({ call }) => {
    const result = await call('render_code', {
      code: 'const x = 42;',
      language: 'javascript',
      theme: 'github-dark',
    });
    expect(result).toBeSuccessful();
    expect(result.content[0].text).toBeDefined();
    expect(result.content[0].text).toContain('<svg');
  });

  it('renders with nord theme', async ({ call }) => {
    const result = await call('render_code', {
      code: 'fn main() {}',
      language: 'rust',
      theme: 'nord',
    });
    expect(result).toBeSuccessful();
    expect(result.content[0].text).toContain('<svg');
  });

  it('renders with window title', async ({ call }) => {
    const result = await call('render_code', {
      code: 'print("hello")',
      language: 'python',
      title: 'hello.py',
    });
    expect(result).toBeSuccessful();
    expect(result.content[0].text).toContain('hello.py');
  });

  it('returns error for empty code', async ({ call }) => {
    const result = await call('render_code', { code: '' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('code is required');
  });

  it('renders with unknown theme without crashing', async ({ call }) => {
    const result = await call('render_code', {
      code: 'test',
      theme: 'nonexistent-theme',
    });
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain('<svg');
  });
});

describe('render_diff', () => {
  it('renders a git diff with add/del colors', async ({ call }) => {
    const diff = `@@ -1,3 +1,4 @@
- old line
+ new line
 context`;
    const result = await call('render_diff', { diff });
    expect(result).toBeSuccessful();
    expect(result.content[0].text).toContain('<svg');
  });

  it('returns error for empty diff', async ({ call }) => {
    const result = await call('render_diff', { diff: '' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('diff is required');
  });

  it('renders diff with language-aware highlighting', async ({ call }) => {
    const diff = `diff --git a/test.ts b/test.ts
@@ -1,3 +1,4 @@
-const x: number = 1;
+const x: number = 2;
+const y: string = "hello";`;
    const result = await call('render_diff', { diff });
    expect(result).toBeSuccessful();
    expect(result.content[0].text).toContain('<svg');
    // Should have actual TS syntax highlighting, not just plain diff tokens
    expect(result.content[0].text).toContain('number');
  });

  it('renders with line highlighting', async ({ call }) => {
    const result = await call('render_code', {
      code: 'line one\nline two\nline three',
      language: 'text',
      highlight_lines: [2],
    });
    expect(result).toBeSuccessful();
    expect(result.content[0].text).toContain('<svg');
  });
});

describe('bug regressions', () => {
  it('falls back to plain text for an unknown language without erroring', async ({ call }) => {
    const result = await call('render_code', {
      code: 'x = 1',
      language: 'totally-fake-language',
    });
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain('<svg');
  });

  it('clamps negative font_size and padding to defaults', async ({ call }) => {
    const result = await call('render_code', {
      code: 'x',
      language: 'text',
      font_size: -100,
      padding: -50,
    });
    expect(result).toBeSuccessful();
    // font_size clamps to 14; the first font-size attribute should reflect it
    expect(result.content[0].text).toContain('font-size="14"');
  });

  it('responds (does not hang) to an unknown tool with an error', async ({ client }) => {
    // An unknown tool name must yield a JSON-RPC error response, not silence.
    // The cobasaja client rejects on RPC error; a hang would time out instead.
    let caught: unknown;
    try {
      await client.callTool('__nonexistent_tool__', {});
    } catch (e: unknown) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toContain('Unknown tool');
  });

  it('colors diff line numbers from @@ hunk headers', async ({ call }) => {
    const diff = `@@ -10,3 +20,4 @@
- removed
+ added
 context`;
    const result = await call('render_diff', { diff });
    expect(result).toBeSuccessful();
    const svg = result.content[0].text;
    // deleted line shows original old start (10); added line shows new start (20)
    expect(svg).toContain('>10<');
    expect(svg).toContain('>20<');
  });
});
