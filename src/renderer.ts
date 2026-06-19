/**
 * SVG renderer for syntax-highlighted code.
 * Handles line numbers, diff markers, title bars, and themes.
 * No DOM/browser needed — pure string construction.
 */

import type { CodeLine } from './types.js';

/** Color theme derived from shiki + our additions */
interface ThemeColors {
  bg: string;
  fg: string;
  lineNumber: string;
  lineNumberBg: string;
  gutterBorder: string;
  titleBg: string;
  titleFg: string;
  addBg: string;
  delBg: string;
  addMarker: string;
  delMarker: string;
  hunkBg: string;
  selectionBg: string;
}

/** Known shiki theme → our theme colors map */
const THEME_MAP: Record<string, Partial<ThemeColors>> = {
  'github-dark': {
    bg: '#0d1117', fg: '#e6edf3',
    lineNumber: '#636d83', lineNumberBg: '#0d1117', gutterBorder: '#21262d',
    titleBg: '#161b22', titleFg: '#e6edf3',
    addBg: '#1b4520', delBg: '#4f1818',
    addMarker: '#3fb950', delMarker: '#f85149',
    hunkBg: '#1a2332', selectionBg: '#3b5998',
  },
  'github-light': {
    bg: '#ffffff', fg: '#1f2328',
    lineNumber: '#656d76', lineNumberBg: '#ffffff', gutterBorder: '#d8dee4',
    titleBg: '#f6f8fa', titleFg: '#1f2328',
    addBg: '#dafbe1', delBg: '#ffebe9',
    addMarker: '#1a7f37', delMarker: '#cf222e',
    hunkBg: '#ddf4ff', selectionBg: '#d0e5ff',
  },
  'nord': {
    bg: '#2e3440', fg: '#d8dee9',
    lineNumber: '#616e88', lineNumberBg: '#2e3440', gutterBorder: '#3b4252',
    titleBg: '#3b4252', titleFg: '#eceff4',
    addBg: '#2e3f28', delBg: '#4c2f2f',
    addMarker: '#a3be8c', delMarker: '#bf616a',
    hunkBg: '#3b4252', selectionBg: '#434c5e',
  },
  'one-dark-pro': {
    bg: '#282c34', fg: '#abb2bf',
    lineNumber: '#636d83', lineNumberBg: '#282c34', gutterBorder: '#3b4048',
    titleBg: '#21252b', titleFg: '#abb2bf',
    addBg: '#2d3f2d', delBg: '#4f2d2d',
    addMarker: '#98c379', delMarker: '#e06c75',
    hunkBg: '#2c313a', selectionBg: '#3e4451',
  },
  'dracula': {
    bg: '#282a36', fg: '#f8f8f2',
    lineNumber: '#6272a4', lineNumberBg: '#282a36', gutterBorder: '#44475a',
    titleBg: '#21222c', titleFg: '#f8f8f2',
    addBg: '#2e3f2e', delBg: '#4f2d2f',
    addMarker: '#50fa7b', delMarker: '#ff5555',
    hunkBg: '#313446', selectionBg: '#44475a',
  },
  'catppuccin-mocha': {
    bg: '#1e1e2e', fg: '#cdd6f4',
    lineNumber: '#585b70', lineNumberBg: '#1e1e2e', gutterBorder: '#313244',
    titleBg: '#181825', titleFg: '#cdd6f4',
    addBg: '#1e3a2a', delBg: '#4c2a2a',
    addMarker: '#a6e3a1', delMarker: '#f38ba8',
    hunkBg: '#252536', selectionBg: '#45475a',
  },
  'material-theme': {
    bg: '#263238', fg: '#eeffff',
    lineNumber: '#546e7a', lineNumberBg: '#263238', gutterBorder: '#37474f',
    titleBg: '#1e272c', titleFg: '#eeffff',
    addBg: '#1e3a2a', delBg: '#4c2a2a',
    addMarker: '#c3e88d', delMarker: '#f07178',
    hunkBg: '#2d3a40', selectionBg: '#314549',
  },
  'min-light': {
    bg: '#fafafa', fg: '#24292e',
    lineNumber: '#6a737d', lineNumberBg: '#fafafa', gutterBorder: '#e1e4e8',
    titleBg: '#f0f0f0', titleFg: '#24292e',
    addBg: '#e6ffed', delBg: '#ffeef0',
    addMarker: '#22863a', delMarker: '#d73a49',
    hunkBg: '#f1f8ff', selectionBg: '#e1f0ff',
  },
  'min-dark': {
    bg: '#1f1f1f', fg: '#e1e1e1',
    lineNumber: '#6e6e6e', lineNumberBg: '#1f1f1f', gutterBorder: '#333333',
    titleBg: '#252525', titleFg: '#e1e1e1',
    addBg: '#1e3a1e', delBg: '#4c2828',
    addMarker: '#7ecb7e', delMarker: '#ff6b6b',
    hunkBg: '#2d2d3a', selectionBg: '#3a3a3a',
  },
};

function getTheme(themeName: string): ThemeColors {
  const partial = THEME_MAP[themeName];
  if (partial) {
    return {
      bg: '#0d1117', fg: '#e6edf3',
      lineNumber: '#636d83', lineNumberBg: '#0d1117', gutterBorder: '#21262d',
      titleBg: '#161b22', titleFg: '#e6edf3',
      addBg: '#1b4520', delBg: '#4f1818',
      addMarker: '#3fb950', delMarker: '#f85149',
      hunkBg: '#1a2332', selectionBg: '#3b5998',
      ...partial,
    };
  }
  // Fallback: treat as a raw hex-from-shiki theme — we only know bg/fg
  return {
    bg: '#0d1117', fg: '#e6edf3',
    lineNumber: '#636d83', lineNumberBg: '#0d1117', gutterBorder: '#21262d',
    titleBg: '#161b22', titleFg: '#e6edf3',
    addBg: '#1b4520', delBg: '#4f1818',
    addMarker: '#3fb950', delMarker: '#f85149',
    hunkBg: '#1a2332', selectionBg: '#3b5998',
  };
}

const FONT_FAMILY = "'JetBrains Mono','Fira Code','Cascadia Code','Consolas','Courier New',monospace";
const TAB_SIZE = 2;
const CHAR_ASPECT = 0.6; // width = font_size * 0.6 for monospace
const LINE_HEIGHT_RATIO = 1.5;

interface RenderSvgParams {
  lines: CodeLine[];
  themeName: string;
  title?: string;
  showLineNumbers: boolean;
  fontSize: number;
  padding: number;
  width?: number;
  transparentBackground?: boolean;
}

export function renderSvg(params: RenderSvgParams): string {
  const { lines, themeName, title, showLineNumbers, fontSize, padding, width: widthChars, transparentBackground } = params;
  const theme = getTheme(themeName);

  const charWidth = fontSize * CHAR_ASPECT;
  const lineHeight = fontSize * LINE_HEIGHT_RATIO;

  // Calculate dimensions
  const hasTitle = !!title;
  const titleHeight = hasTitle ? lineHeight + 20 : 0;
  const gutterWidth = showLineNumbers
    ? String(lines.length).length * charWidth + 16 + 8  // digits + padding + border
    : 0;
  const gutterX = padding + gutterWidth;

  // Max line content width in chars
  const maxContentChars = widthChars ?? Math.max(
    40,
    ...lines.map(l => {
      let len = 0;
      // Add diff marker width
      if (l.diffType === 'add' || l.diffType === 'del') len += 1;
      // Sum token lengths, expanding tabs
      for (const t of l.tokens) {
        len += t.text.replace(/\t/g, ' '.repeat(TAB_SIZE)).length;
      }
      return len;
    })
  );

  const contentWidth = maxContentChars * charWidth;
  const svgWidth = padding * 2 + gutterWidth + contentWidth + padding; // extra right padding
  const svgHeight = padding * 2 + titleHeight + lines.length * lineHeight + padding;

  const linesStartY = padding + titleHeight;

  // Escape SVG text (basic XML)
  const esc = (s: string) => s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

  // ── Build SVG parts ──

  const parts: string[] = [];

  // Root SVG
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgWidth} ${svgHeight}" width="${svgWidth}" height="${svgHeight}">`);

  // Defs — rounded rect clip + blur for title dots
  parts.push(`<defs>
    <clipPath id="body-clip"><rect x="0" y="0" width="${svgWidth}" height="${svgHeight}" rx="8"/></clipPath>
    <clipPath id="content-clip"><rect x="${padding + gutterWidth}" y="0" width="${contentWidth + padding}" height="${svgHeight}"/></clipPath>
    <linearGradient id="title-grad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${theme.titleBg}"/>
      <stop offset="100%" stop-color="${theme.bg}"/>
    </linearGradient>
  </defs>`);

  // Background
  if (!transparentBackground) {
    parts.push(`<rect x="0" y="0" width="${svgWidth}" height="${svgHeight}" rx="8" fill="${theme.bg}" clip-path="url(#body-clip)"/>`);
  }

  // Title bar
  if (hasTitle) {
    parts.push(`<rect x="0" y="0" width="${svgWidth}" height="${titleHeight}" fill="url(#title-grad)" clip-path="url(#body-clip)"/>`);
    // Window dots
    const dotR = 5;
    const dotY = titleHeight / 2;
    const dotX = 20;
    for (const color of ['#ff5f56', '#ffbd2e', '#27c93f']) {
      parts.push(`<circle cx="${dotX}" cy="${dotY}" r="${dotR}" fill="${color}"/>`);
      // advance by 3*radius + gap
    }
    // Title text
    parts.push(`<text x="${svgWidth / 2}" y="${titleHeight / 2}" text-anchor="middle" dominant-baseline="central" font-family="${FONT_FAMILY}" font-size="${fontSize}" fill="${theme.titleFg}" opacity="0.85">${esc(title)}</text>`);
  }

  // ── Render each line ──
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const y = linesStartY + i * lineHeight + lineHeight * 0.75; // baseline offset

    // ── Diff background + marker ──
    if (line.diffType === 'add') {
      parts.push(`<rect x="0" y="${linesStartY + i * lineHeight}" width="${svgWidth}" height="${lineHeight}" fill="${theme.addBg}"/>`);
    } else if (line.diffType === 'del') {
      parts.push(`<rect x="0" y="${linesStartY + i * lineHeight}" width="${svgWidth}" height="${lineHeight}" fill="${theme.delBg}"/>`);
    } else if (line.diffType === 'hunk') {
      parts.push(`<rect x="0" y="${linesStartY + i * lineHeight}" width="${svgWidth}" height="${lineHeight}" fill="${theme.hunkBg}"/>`);
    }

    // Diff marker character (+/-/~)
    let diffMarker = '';
    if (line.diffType === 'add') diffMarker = '+';
    else if (line.diffType === 'del') diffMarker = '-';
    else if (line.diffType === 'hunk') diffMarker = '~';

    // ── Line number ──
    if (showLineNumbers) {
      const lnX = gutterWidth - 8 - 4; // right-aligned
      const lnText = line.oldLineNumber != null && line.diffType === 'del'
        ? String(line.oldLineNumber)
        : String(line.lineNumber);
      const lnColor = line.diffType === 'add' ? theme.addMarker
        : line.diffType === 'del' ? theme.delMarker
        : theme.lineNumber;
      parts.push(`<text x="${lnX}" y="${y}" text-anchor="end" font-family="${FONT_FAMILY}" font-size="${fontSize}" fill="${lnColor}" opacity="0.8">${esc(lnText)}</text>`);
    }

    // Divider line after gutter
    if (showLineNumbers) {
      parts.push(`<line x1="${gutterX - 4}" y1="${linesStartY + i * lineHeight}" x2="${gutterX - 4}" y2="${linesStartY + i * lineHeight + lineHeight}" stroke="${theme.gutterBorder}" stroke-width="1"/>`);
    }

    // ── Code content group with clip-path ──
    parts.push(`<g clip-path="url(#content-clip)">`);

    // ── Diff marker ──
    let cursorX = gutterX;
    if (diffMarker) {
      const markerColor = line.diffType === 'add' ? theme.addMarker
        : line.diffType === 'del' ? theme.delMarker
        : theme.lineNumber;
      parts.push(`<text x="${cursorX}" y="${y}" font-family="${FONT_FAMILY}" font-size="${fontSize}" fill="${markerColor}" font-weight="bold">${esc(diffMarker)}</text>`);
      cursorX += charWidth;
    }

    // ── Syntax-highlighted tokens ──
    let isFirstToken = true;
    for (const token of line.tokens) {
      let displayText = token.text.replace(/\t/g, ' '.repeat(TAB_SIZE));
      if (!displayText) continue;

      // Strip leading whitespace from the first token only
      if (isFirstToken) {
        const indentMatch = displayText.match(/^ +/);
        if (indentMatch) {
          cursorX += indentMatch[0].length * charWidth;
          displayText = displayText.slice(indentMatch[0].length);
          if (!displayText) continue;
        }
        isFirstToken = false;
      }

      const tokenLen = displayText.length;
      const fillColor = token.color || theme.fg;

      let fontWeight = 'normal';
      let fontStyle = 'normal';
      if (token.fontStyle !== undefined && token.fontStyle !== 0) {
        if (token.fontStyle & 1) fontWeight = 'bold';
        if (token.fontStyle & 2) fontStyle = 'italic';
      }

      parts.push(`<text x="${cursorX}" y="${y}" font-family="${FONT_FAMILY}" font-size="${fontSize}" fill="${fillColor}" font-weight="${fontWeight}" font-style="${fontStyle}">${esc(displayText)}</text>`);
      cursorX += tokenLen * charWidth;
    }

    parts.push('</g>'); // end content clip group
  }

  parts.push('</svg>');
  return parts.join('\n');
}

/** SVG → PNG buffer using resvg */
export async function svgToPng(svg: string): Promise<Uint8Array> {
  // Dynamic import so the dependency is only needed when PNG is requested
  const { Resvg } = await import('@resvg/resvg-js');
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'original' },
    font: {
      loadSystemFonts: true,
      fontFiles: [],
    },
  });
  const rendered = resvg.render();
  return rendered.asPng();
}
