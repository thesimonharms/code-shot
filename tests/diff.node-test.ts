/**
 * Unit tests for diffToLines() using Node's test runner.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { diffToLines } from '../dist/parse.js';

void describe('diffToLines', () => {
  void it('parses a simple diff with add and del lines', () => {
    const diff = [
      '@@ -1,3 +1,4 @@',
      '- old line',
      '+ new line',
      ' context',
    ].join('\n');
    const lines = diffToLines(diff);
    assert.equal(lines[0].diffType, 'hunk');
    assert.ok(lines[0].tokens[0].text.startsWith('@@'));
    assert.equal(lines[1].diffType, 'del');
    assert.equal(lines[1].tokens[0].text, ' old line');
    assert.equal(lines[2].diffType, 'add');
    assert.equal(lines[2].tokens[0].text, ' new line');
    assert.equal(lines[3].diffType, 'normal');
    assert.equal(lines[3].tokens[0].text, ' context');
  });

  void it('filters git metadata before first hunk', () => {
    const diff = [
      'commit abc123',
      'Author: Test',
      'Date: Mon Jan 1',
      '    commit message body',
      'diff --git a/file.ts b/file.ts',
      'index abc..def 100644',
      '--- a/file.ts',
      '+++ b/file.ts',
      '@@ -1 +1 @@',
      '-old',
      '+new',
    ].join('\n');
    const lines = diffToLines(diff);
    // Hunk header + del + add
    assert.equal(lines[0].diffType, 'hunk');
    assert.equal(lines[1].diffType, 'del');
    assert.equal(lines[1].tokens[0].text, 'old');
    assert.equal(lines[2].diffType, 'add');
    assert.equal(lines[2].tokens[0].text, 'new');
  });

  void it('filters ---/+++ and diff --git after inDiff', () => {
    const diff = [
      '@@ -1,3 +1,4 @@',
      ' unchanged',
      '--- a/other.ts',
      '+++ b/other.ts',
      '@@ -5,2 +6,3 @@',
      '+new line',
      ' context',
    ].join('\n');
    const lines = diffToLines(diff);
    // hunk + normal + hunk + add + normal
    assert.equal(lines[0].diffType, 'hunk');
    assert.equal(lines[1].diffType, 'normal');
    assert.equal(lines[1].tokens[0].text, ' unchanged');
    // --- and +++ headers are filtered (not in output)
    assert.equal(lines[2].diffType, 'hunk');
    assert.equal(lines[3].diffType, 'add');
    assert.equal(lines[3].tokens[0].text, 'new line');
    assert.equal(lines[4].diffType, 'normal');
  });

  void it('handles empty diff', () => {
    const lines = diffToLines('');
    assert.deepEqual(lines, []);
  });

  void it('handles diff with only context lines', () => {
    const diff = [
      '@@ -1,2 +1,2 @@',
      ' context1',
      ' context2',
    ].join('\n');
    const lines = diffToLines(diff);
    assert.equal(lines[1].diffType, 'normal');
    assert.equal(lines[1].tokens[0].text, ' context1');
    assert.equal(lines[2].diffType, 'normal');
    assert.equal(lines[2].tokens[0].text, ' context2');
  });

  void it('handles whitespace-only diff input', () => {
    const lines = diffToLines('   \n\t\n');
    assert.deepEqual(lines, []);
  });
});
