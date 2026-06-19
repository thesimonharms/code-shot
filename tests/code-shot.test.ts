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
});
