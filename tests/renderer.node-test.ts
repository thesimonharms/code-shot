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
});
