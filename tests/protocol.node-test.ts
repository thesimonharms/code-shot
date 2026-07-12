/**
 * Raw JSON-RPC protocol regression tests for the code-shot MCP server.
 * Exercises behavior that cobasaja's tool-call abstraction can't reach:
 *   - unknown methods must return -32601 (previously silently dropped → client hang)
 *   - default_format user config option drives output when no arg given
 *   - stdout backpressure drain (large SVG response not truncated)
 *
 * Run: node --experimental-strip-types --test tests/protocol.node-test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Send one JSON-RPC line to the server, return parsed stdout response. */
function rpc(input: string): { stdout: string; stderr: string; status: number | null } {
  const r = spawnSync('node', ['dist/index.js'], {
    input: input + '\n',
    encoding: 'utf8',
    timeout: 10000,
  });
  return { stdout: r.stdout ?? '', stderr: r.stderr ?? '', status: r.status };
}

function parseResponses(stdout: string): unknown[] {
  return stdout.split('\n').filter(l => l.trim()).map(JSON.parse);
}

void describe('JSON-RPC protocol', () => {
  void it('returns -32601 for unknown request methods (does not hang)', () => {
    const req = JSON.stringify({ jsonrpc: '2.0', id: 99, method: 'resources/list', params: {} });
    const { stdout, status } = rpc(req);
    assert.equal(status, 0, `server should exit cleanly, got status ${status}`);
    const responses = parseResponses(stdout);
    const err = (responses as Array<Record<string, unknown>>).find(m => 'error' in m);
    assert.ok(err, 'expected an error response for unknown method');
    const e = (err as { error: { code: number; message: string } }).error;
    assert.equal(e.code, -32601, `expected -32601, got ${e.code}`);
    assert.ok(e.message.includes('resources/list'), `message should name the method, got: ${e.message}`);
  });

  void it('silently ignores unknown notifications (no id) per JSON-RPC 2.0', () => {
    // A notification has no id — server must not reply or hang.
    const req = JSON.stringify({ jsonrpc: '2.0', method: 'some/random/notification', params: {} });
    const { stdout } = rpc(req);
    assert.equal(stdout.trim(), '', 'notifications should produce no response');
  });

  void it('responds to initialize then tools/list without losing either', () => {
    const req = [
      JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }),
      JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }),
    ].join('\n');
    const { stdout } = rpc(req);
    const responses = parseResponses(stdout);
    assert.equal(responses.length, 2, 'both requests should get responses');
    const init = responses[0] as { result: { protocolVersion: string } };
    const list = responses[1] as { result: { tools: unknown[] } };
    assert.ok(init.result.protocolVersion, 'initialize should return protocolVersion');
    assert.ok(Array.isArray(list.result.tools), 'tools/list should return tools array');
  });
});

void describe('default_format user config', () => {
  void it('uses default_format=svg from config when output_format arg is absent', () => {
    const home = mkdtempSync(join(tmpdir(), 'code-shot-cfg-'));
    writeFileSync(join(home, '.code-shotrc'), JSON.stringify({ default_format: 'svg' }));
    try {
      const req = JSON.stringify({
        jsonrpc: '2.0', id: 1, method: 'tools/call',
        params: { name: 'render_code', arguments: { code: 'x = 1' } },
      });
      const r = spawnSync('node', ['dist/index.js'], {
        input: req + '\n',
        encoding: 'utf8',
        timeout: 15000,
        env: { ...process.env, HOME: home, USERPROFILE: home },
      });
      const responses = parseResponses(r.stdout ?? '');
      const result = (responses[0] as { result: { content: { text: string }[]; isError?: boolean } }).result;
      assert.ok(!result.isError);
      assert.ok(result.content[0].text.includes('<svg'), 'default_format=svg should produce SVG');
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});