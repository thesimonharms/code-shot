/**
 * Unit tests for the SVG renderer using Node's built-in test runner.
 * Run: node --experimental-strip-types --test tests/renderer.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { renderSvg } from '../dist/renderer.js';

void describe('renderSvg', () => {
  void it('produces valid SVG with root element', () => {
    const svg = renderSvg({
      lines: [{ tokens: [{ text: 'hello', color: '#e6edf3' }], lineNumber: 1 }],
      themeName: 'github-dark',
      showLineNumbers: true,
      fontSize: 14,
      padding: 16,
    });
    assert.ok(svg.includes('<svg'));
    assert.ok(svg.includes('</svg>'));
    assert.ok(svg.includes('xmlns="http://www.w3.org/2000/svg"'));
  });

  void it('includes line numbers in gutter', () => {
    const lines = [
      { tokens: [{ text: 'line1', color: '#e6edf3' }], lineNumber: 1 },
      { tokens: [{ text: 'line2', color: '#e6edf3' }], lineNumber: 2 },
    ];
    const svg = renderSvg({ lines, themeName: 'github-dark', showLineNumbers: true, fontSize: 14, padding: 16 });
    assert.ok(svg.includes('>1<'));
    assert.ok(svg.includes('>2<'));
  });

  void it('hides line numbers when showLineNumbers is false', () => {
    const lines = [{ tokens: [{ text: 'test', color: '#e6edf3' }], lineNumber: 42 }];
    const svg = renderSvg({ lines, themeName: 'github-dark', showLineNumbers: false, fontSize: 14, padding: 16 });
    assert.ok(!svg.includes('>42<'));
  });

  void it('renders diff add lines with green background and + marker', () => {
    const lines = [
      { tokens: [{ text: 'added line', color: '#e6edf3' }], lineNumber: 1, diffType: 'add' as const },
    ];
    const svg = renderSvg({ lines, themeName: 'github-dark', showLineNumbers: true, fontSize: 14, padding: 16 });
    assert.ok(svg.includes('#1b4520'));
    assert.ok(svg.includes('>+<'));
  });

  void it('renders diff del lines with red background and - marker', () => {
    const lines = [
      { tokens: [{ text: 'deleted line', color: '#e6edf3' }], lineNumber: 1, diffType: 'del' as const },
    ];
    const svg = renderSvg({ lines, themeName: 'github-dark', showLineNumbers: true, fontSize: 14, padding: 16 });
    assert.ok(svg.includes('#4f1818'));
    assert.ok(svg.includes('>-<'));
  });

  void it('renders hunk lines with blue background and ~ marker', () => {
    const lines = [
      { tokens: [{ text: '@@ -1,3 +1,4 @@', color: '#8b949e' }], lineNumber: 1, diffType: 'hunk' as const },
    ];
    const svg = renderSvg({ lines, themeName: 'github-dark', showLineNumbers: true, fontSize: 14, padding: 16 });
    assert.ok(svg.includes('#1a2332'));
    assert.ok(svg.includes('>~<'));
  });

  void it('includes title bar when title is provided', () => {
    const svg = renderSvg({
      lines: [{ tokens: [{ text: 'code', color: '#e6edf3' }], lineNumber: 1 }],
      themeName: 'github-dark',
      title: 'test.ts',
      showLineNumbers: true,
      fontSize: 14,
      padding: 16,
    });
    assert.ok(svg.includes('test.ts'));
    assert.ok(svg.includes('url(#title-grad)'));
  });

  void it('excludes title bar rect when title is omitted', () => {
    const svg = renderSvg({
      lines: [{ tokens: [{ text: 'code', color: '#e6edf3' }], lineNumber: 1 }],
      themeName: 'github-dark',
      showLineNumbers: true,
      fontSize: 14,
      padding: 16,
    });
    assert.ok(!svg.includes('url(#title-grad)'));
  });

  void it('renders bold and italic tokens correctly', () => {
    const lines = [{
      tokens: [
        { text: 'bold', color: '#e6edf3', fontStyle: 1 },
        { text: 'italic', color: '#e6edf3', fontStyle: 2 },
        { text: 'both', color: '#e6edf3', fontStyle: 3 },
      ],
      lineNumber: 1,
    }];
    const svg = renderSvg({ lines, themeName: 'github-dark', showLineNumbers: true, fontSize: 14, padding: 16 });
    assert.ok(svg.includes('font-weight="bold"'));
    assert.ok(svg.includes('font-style="italic"'));
  });

  void it('handles empty lines array without crashing', () => {
    const svg = renderSvg({ lines: [], themeName: 'github-dark', showLineNumbers: true, fontSize: 14, padding: 16 });
    assert.ok(svg.includes('<svg'));
    assert.ok(svg.includes('</svg>'));
  });

  void it('uses correct theme colors for nord theme', () => {
    const svg = renderSvg({
      lines: [{ tokens: [{ text: 'test', color: '#d8dee9' }], lineNumber: 1 }],
      themeName: 'nord',
      showLineNumbers: true,
      fontSize: 14,
      padding: 16,
    });
    assert.ok(svg.includes('#2e3440'));
  });

  void it('escapes XML special characters including single quote', () => {
    const svg = renderSvg({
      lines: [{ tokens: [{ text: 'a < b > c & d " e \' f', color: '#e6edf3' }], lineNumber: 1 }],
      themeName: 'github-dark',
      showLineNumbers: true,
      fontSize: 14,
      padding: 16,
    });
    assert.ok(svg.includes('&lt;'));
    assert.ok(svg.includes('&gt;'));
    assert.ok(svg.includes('&amp;'));
    assert.ok(svg.includes('&quot;'));
    assert.ok(svg.includes('&apos;'));
  });

  void it('expands tabs to spaces in code', () => {
    const svg = renderSvg({
      lines: [{ tokens: [{ text: '\t\tindented', color: '#e6edf3' }], lineNumber: 1 }],
      themeName: 'github-dark',
      showLineNumbers: true,
      fontSize: 14,
      padding: 16,
    });
    assert.ok(svg.includes('indented'));
    assert.ok(!svg.includes('\t'));
  });

  void it('positions leading indentation via x offset instead of text content', () => {
    const gutterX = 16 + (1 * 14 * 0.6 + 16 + 8); // padding + gutter for 1 line
    const indentChars = 2;
    const expectedX = gutterX + indentChars * 14 * 0.6;
    const svg = renderSvg({
      lines: [{ tokens: [{ text: '  indented', color: '#e6edf3' }], lineNumber: 1 }],
      themeName: 'github-dark',
      showLineNumbers: true,
      fontSize: 14,
      padding: 16,
    });
    assert.ok(svg.includes(`x="${expectedX}"`));
    assert.ok(svg.includes('>indented<'));
    assert.ok(!svg.includes('>  indented<'));
  });

  void it('merges whitespace-only tokens into the previous tspan', () => {
    const svg = renderSvg({
      lines: [{
        tokens: [
          { text: 'const', color: '#f97583' },
          { text: ' ', color: '#e1e4e8' },
          { text: 'x', color: '#79b8ff' },
        ],
        lineNumber: 1,
      }],
      themeName: 'github-dark',
      showLineNumbers: true,
      fontSize: 14,
      padding: 16,
    });
    assert.ok(svg.includes('>const <'));
    assert.ok(!svg.match(/<tspan[^>]*>\s*<\/tspan>/));
  });

  void it('renders adjacent tokens in a single text element to avoid positioning gaps', () => {
    const svg = renderSvg({
      lines: [{
        tokens: [
          { text: 'console', color: '#e6edf3' },
          { text: '.', color: '#e6edf3' },
          { text: 'log', color: '#e6edf3' },
          { text: '(', color: '#e6edf3' },
          { text: 'svg', color: '#e6edf3' },
          { text: ')', color: '#e6edf3' },
        ],
        lineNumber: 1,
      }],
      themeName: 'github-dark',
      showLineNumbers: false,
      fontSize: 14,
      padding: 16,
    });
    const lineText = svg.match(/<text[^>]*xml:space="preserve"[^>]*>[\s\S]*?<\/text>/)?.[0] ?? '';
    assert.ok(lineText.includes('>console</tspan><tspan'));
    assert.ok(lineText.includes('>.</tspan><tspan'));
    assert.ok(lineText.includes('>log</tspan><tspan'));
    assert.equal((svg.match(/<text x="/g) ?? []).length, 1);
  });

  void it('wraps long lines in a clip-path to prevent overflow', () => {
    const longCode = 'a'.repeat(500);
    const svg = renderSvg({
      lines: [{ tokens: [{ text: longCode, color: '#e6edf3' }], lineNumber: 1 }],
      themeName: 'github-dark',
      showLineNumbers: true,
      fontSize: 14,
      padding: 16,
    });
    assert.ok(svg.includes('clip-path="url(#content-clip)"'));
    assert.ok(svg.includes('id="content-clip">'));
  });

  void it('omits background rect when transparentBackground is true', () => {
    const svg = renderSvg({
      lines: [{ tokens: [{ text: 'test', color: '#e6edf3' }], lineNumber: 1 }],
      themeName: 'github-dark',
      showLineNumbers: true,
      fontSize: 14,
      padding: 16,
      transparentBackground: true,
    });
    // The background rect uses the theme bg color — should not exist
    assert.ok(!svg.includes('fill="#0d1117"'));
    // But content and line numbers should still be present
    assert.ok(svg.includes('<svg'));
    assert.ok(svg.includes('>test<'));
  });

  void it('highlights specified lines with selection background', () => {
    const svg = renderSvg({
      lines: [
        { tokens: [{ text: 'line1', color: '#e6edf3' }], lineNumber: 1 },
        { tokens: [{ text: 'line2', color: '#e6edf3' }], lineNumber: 2 },
        { tokens: [{ text: 'line3', color: '#e6edf3' }], lineNumber: 3 },
      ],
      themeName: 'github-dark',
      showLineNumbers: true,
      fontSize: 14,
      padding: 16,
      highlightLines: [2],
    });
    assert.ok(svg.includes('opacity="0.5"'));
    // Line 2 should have the highlight rect
    // Line 1 and 3 should not
  });

  void it('renders title window dots at increasing x positions (not overlapping)', () => {
    const svg = renderSvg({
      lines: [{ tokens: [{ text: 'code', color: '#e6edf3' }], lineNumber: 1 }],
      themeName: 'github-dark',
      title: 'app.ts',
      showLineNumbers: true,
      fontSize: 14,
      padding: 16,
    });
    const cx = [...svg.matchAll(/<circle cx="(\d+)"/g)].map(m => Number(m[1]));
    assert.equal(cx.length, 3, 'expected 3 window dots');
    assert.ok(cx[1] > cx[0], `dot 2 (${cx[1]}) should be right of dot 1 (${cx[0]})`);
    assert.ok(cx[2] > cx[1], `dot 3 (${cx[2]}) should be right of dot 2 (${cx[1]})`);
  });

  void it('uses light diff palette for unmapped light theme via bg luminance', () => {
    const svg = renderSvg({
      lines: [{ tokens: [{ text: 'added', color: '' }], lineNumber: 1, diffType: 'add' }],
      themeName: 'one-light',
      themeBg: '#FAFAFA',
      themeFg: '#383A42',
      showLineNumbers: false,
      fontSize: 14,
      padding: 16,
    });
    assert.ok(svg.includes('#dafbe1'), 'light addBg should be used');
    assert.ok(!svg.includes('#1b4520'), 'dark addBg must not leak into light theme');
    assert.ok(svg.includes('#FAFAFA'), 'shiki bg should be used for background');
  });

  void it('uses dark diff palette for unmapped dark theme via bg luminance', () => {
    const svg = renderSvg({
      lines: [{ tokens: [{ text: 'added', color: '' }], lineNumber: 1, diffType: 'add' }],
      themeName: 'vitesse-dark',
      themeBg: '#000000',
      themeFg: '#ffffff',
      showLineNumbers: false,
      fontSize: 14,
      padding: 16,
    });
    assert.ok(svg.includes('#1b4520'), 'dark addBg should be used');
    assert.ok(!svg.includes('#dafbe1'), 'light addBg must not leak into dark theme');
  });

  void it('renders real shiki theme fg as title text and token fallback', () => {
    const svg = renderSvg({
      lines: [{ tokens: [{ text: 'hi', color: '' }], lineNumber: 1 }],
      themeName: 'solarized-light',
      themeBg: '#FDF6E3',
      themeFg: '#657B83',
      title: 'solarized.ts',
      showLineNumbers: false,
      fontSize: 14,
      padding: 16,
    });
    assert.ok(svg.includes('#657B83'), 'shiki fg should appear as title fill and/or token fallback');
    assert.ok(svg.includes('#FDF6E3'), 'shiki bg should appear in title gradient');
  });

  void it('omits gutter line number for hunk header lines but keeps the marker', () => {
    const svg = renderSvg({
      lines: [
        { tokens: [{ text: '@@ -1,3 +1,4 @@', color: '#8b949e' }], lineNumber: 1, diffType: 'hunk' },
        { tokens: [{ text: 'const x = 1', color: '#e6edf3' }], lineNumber: 1, diffType: 'add' },
      ],
      themeName: 'github-dark',
      showLineNumbers: true,
      fontSize: 14,
      padding: 16,
    });
    assert.ok(svg.includes('>~<'), 'hunk marker ~ should be rendered');
    // The hunk line should not produce a gutter line-number <text> — the only
    // gutter number present is "1" for the add line.
    const lnTexts = [...svg.matchAll(/text-anchor="end"[^>]*>(\d+)</g)].map(m => m[1]);
    assert.deepEqual(lnTexts, ['1'], `gutter should show only add line number, got: ${JSON.stringify(lnTexts)}`);
  });

});
