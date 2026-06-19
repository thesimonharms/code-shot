/** Types for the code-shot MCP server */

/** User config file (~/.config/code-shot/config.json) */
export interface CodeShotConfig {
  /** Default color theme */
  theme?: string;
  /** Show line numbers by default */
  show_line_numbers?: boolean;
  /** Default font size in px */
  font_size?: number;
  /** Default padding in px */
  padding?: number;
  /** Default output format */
  default_format?: 'svg' | 'png';
  /** Default code area width in characters */
  width?: number;
}

export interface RenderCodeArgs {
  /** The source code to render */
  code: string;
  /** Programming language for syntax highlighting (e.g. 'typescript', 'rust', 'python'). Auto-detected if omitted. */
  language?: string;
  /** Color theme. See shiki themes list. Default: 'github-dark' */
  theme?: string;
  /** Window title bar text (e.g. filename). Omit for no title bar. */
  title?: string;
  /** Show line numbers gutter. Default: true */
  show_line_numbers?: boolean;
  /** Font size in px. Default: 14 */
  font_size?: number;
  /** Output format. 'svg' (default, crisp & copyable) or 'png' (raster). */
  output_format?: 'svg' | 'png';
  /** Width of the rendered image in chars. Default: auto (fits longest line + gutter) */
  width?: number;
  /** Padding around the code block in px. Default: 16 */
  padding?: number;
  /** Use transparent background instead of theme background color. Default: false */
  transparent_background?: boolean;
}

export interface RenderDiffArgs {
  /** Unified diff content (e.g. output of `git diff`). */
  diff: string;
  /** Color theme. Default: 'github-dark' */
  theme?: string;
  /** Title text. Omit for no title bar. */
  title?: string;
  /** Show line numbers. Default: true */
  show_line_numbers?: boolean;
  /** Font size in px. Default: 14 */
  font_size?: number;
  /** Output format. 'svg' (default) or 'png' */
  output_format?: 'svg' | 'png';
  /** Padding in px. Default: 16 */
  padding?: number;
  /** Language for syntax highlighting within diff hunks. Auto-detected from file extension if omitted. Use 'diff' for plain diff highlighting. */
  highlight_language?: string;
  /** Use transparent background instead of theme background color. Default: false */
  transparent_background?: boolean;
}

export interface MCPResponse {
  content: { type: string; text?: string; data?: string; mimeType?: string }[];
  isError?: boolean;
}

/** Line of rendered code with diff metadata */
export interface CodeLine {
  tokens: CodeToken[];
  lineNumber: number;
  /** For diff: the original line number (left side) */
  oldLineNumber?: number;
  /** Diff type: 'add' (green), 'del' (red), 'hunk' (blue header), or 'normal' */
  diffType?: 'add' | 'del' | 'hunk' | 'normal';
}

export interface CodeToken {
  text: string;
  color: string;
  fontStyle?: number; // 0=normal, 1=bold, 2=italic, 3=bold+italic
}
