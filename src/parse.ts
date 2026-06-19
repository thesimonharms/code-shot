/**
 * Utility functions for parsing code and diffs.
 * Separated from index.ts to avoid MCP server side effects when testing.
 */

import type { CodeLine, CodeToken } from './types.js';

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

export function detectDiffLanguage(diff: string): string {
  const match = diff.match(/^diff --git a\/\S+\.(\w+)/m);
  if (match) {
    const ext = '.' + match[1];
    return EXTENSION_TO_LANG[ext] || 'diff';
  }
  return 'diff';
}

export function diffToLines(diff: string): CodeLine[] {
  const lines = diff.split('\n');
  const result: CodeLine[] = [];
  let lineNum = 1;
  let inDiff = false;

  for (const line of lines) {
    // Skip git commit metadata (before first @@ hunk)
    if (!inDiff && (line.startsWith('commit ') || line.startsWith('Author:') ||
        line.startsWith('Date:') || line === '' ||
        line.startsWith('    ') || line.startsWith('diff --git') ||
        line.startsWith('index ') || line.startsWith('---') ||
        line.startsWith('+++'))) {
      continue;
    }
    // Skip diff headers even after inDiff
    if (line.startsWith('---') || line.startsWith('+++') ||
        line.startsWith('diff --git') || line.startsWith('index ')) {
      continue;
    }

    if (line.startsWith('@@')) {
      inDiff = true;
      result.push({
        tokens: [{ text: line, color: '#8b949e' }],
        lineNumber: lineNum++,
        diffType: 'hunk',
      });
    } else if (line.startsWith('+')) {
      result.push({
        tokens: [{ text: line.substring(1), color: '#e6edf3' }],
        lineNumber: lineNum++,
        diffType: 'add',
      });
    } else if (line.startsWith('-')) {
      result.push({
        tokens: [{ text: line.substring(1), color: '#e6edf3' }],
        lineNumber: lineNum++,
        diffType: 'del',
      });
    } else if (inDiff) {
      // Context lines within a diff hunk
      result.push({
        tokens: [{ text: line, color: '#e6edf3' }],
        lineNumber: lineNum++,
        diffType: 'normal',
      });
    }
  }

  return result;
}

export function guessLanguage(code: string): string {
  // Check for shebang
  const firstLine = code.split('\n')[0]?.trim();
  if (firstLine?.startsWith('#!/')) {
    if (firstLine.includes('python') || firstLine.includes('python3')) return 'python';
    if (firstLine.includes('bash') || firstLine.includes('sh')) return 'bash';
    if (firstLine.includes('node')) return 'javascript';
    if (firstLine.includes('deno')) return 'typescript';
    if (firstLine.includes('ruby')) return 'ruby';
    if (firstLine.includes('perl')) return 'perl';
  }

  // Quick heuristics based on first non-empty lines (order matters!)
  const sample = code.slice(0, 1000);
  // C/family must come first — #include / #define start with #
  if (/^#\s*(include|define|pragma)/m.test(sample)) return 'c';
  // HTML: <template / <script / <!DOCTYPE / <html
  if (/^<(template|script|!DOCTYPE|html)/m.test(sample)) return 'html';
  // JSON: starts with { and has "dependencies" or "scripts"
  if (/^{[\s\S]*"(dependencies|scripts)"/m.test(sample)) return 'json';
  // Go: func keyword, package keyword, import with parens or string
  if (/^(func\s+\w+|package\s+\w+|import\s+[("])/m.test(sample)) return 'go';
  // Perl: use strict / use warnings
  if (/^use\s+(strict|warnings)/m.test(sample)) return 'perl';
  // Python: def, from X import
  if (/^(def\s+\w+|from\s+\w+\s+import)/m.test(sample)) return 'python';
  // Python: import X (single module, no "from" clause)
  if (/^import\s+\w+(\s+as\s+\w+)?$/m.test(sample)) return 'python';
  // TypeScript: import type, import { ... }, interface, type alias, const/let/var with type
  if (/^(import\s+(type|\{)|interface\s+\w+|type\s+\w+\s*=)/m.test(sample)) return 'typescript';
  if (/^(const|let|var)\s+\w+\s*:\s*\w+/m.test(sample)) return 'typescript';
  // JavaScript: import X from, export, module.exports
  if (/^(import\s+\w+\s+from|export|module\.exports)/m.test(sample)) return 'javascript';
  // JavaScript: const/let/var X = (require(...)) or X = () or X = function
  if (/^(const|let|var)\s+\w+\s*=\s*(require\s*\(|\(|function)/m.test(sample)) return 'javascript';
  // Rust: fn, let mut, impl, use std/crate/serde
  if (/^(fn|let\s+mut|impl\s+\w+|use\s+(std|crate|serde))/m.test(sample)) return 'rust';
  // Java: class/public/private/protected/static/void
  if (/^(class|public|private|protected|static|void\s+\w+)/m.test(sample)) return 'java';
  // Kotlin: module/open/let/val/fun
  if (/^(module|open|let|val|fun\s+)/m.test(sample)) return 'kotlin';

  return 'text';
}
