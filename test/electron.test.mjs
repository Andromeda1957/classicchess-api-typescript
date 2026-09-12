import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import { ApiError } from '../dist/esm/index.js';

const { registerArchiveHandlers } = createRequire(import.meta.url)('../examples/electron/bridge.cjs');

test('Electron example validates callers, narrows inputs and preserves structured errors', async () => {
  const handlers = new Map();
  const ipc = { handle: (channel, handler) => handlers.set(channel, handler), removeHandler: channel => handlers.delete(channel) };
  const frame = { url: 'file:///example/index.html' };
  const window = { webContents: { mainFrame: frame } };
  const event = { sender: window.webContents, senderFrame: frame };
  const calls = [];
  const cleanup = registerArchiveHandlers(ipc, window, frame.url, {
    publicPlayers: async () => ({ results: [{ name: 'Tal' }] }),
    publicPlayerBio: async slug => { calls.push(slug); return { bio: null }; },
    publicNotableGames: async () => { throw new ApiError('Slow down', { code: 'rate_limited', status: 429, retryAfter: '900' }); },
    publicPgn: async token => token,
  });
  assert.deepEqual(await handlers.get('archive:players')(event), { ok: true, data: { results: [{ name: 'Tal' }] } });
  assert.deepEqual(await handlers.get('archive:bio')(event, 'Mikhail_Tal'), { ok: true, data: { bio: null } });
  assert.deepEqual(calls, ['Mikhail_Tal']);
  assert.deepEqual(await handlers.get('archive:notable')(event, 'Tal'), { ok: false, error: { code: 'rate_limited', message: 'Slow down', status: 429, retryAfter: '900' } });
  for (const value of ['../account', 'https://other.example', {}, 'x\ny']) {
    assert.equal((await handlers.get('archive:bio')(event, value)).ok, false);
    assert.equal((await handlers.get('archive:pgn')(event, value)).ok, false);
  }
  for (const outsider of [
    { sender: {}, senderFrame: frame },
    { sender: window.webContents, senderFrame: { url: frame.url } },
  ]) await assert.rejects(handlers.get('archive:players')(outsider), /Untrusted/);
  frame.url = 'https://other.example';
  await assert.rejects(handlers.get('archive:players')(event), /Untrusted/);
  cleanup();
  assert.equal(handlers.size, 0);
});

test('preload exposes only archive operations and never passes raw IPC to the renderer', async () => {
  const calls = [];
  let bridge;
  runInNewContext(readFileSync(new URL('../examples/electron/preload.cjs', import.meta.url), 'utf8'), {
    require: name => {
      assert.equal(name, 'electron');
      return {
        contextBridge: { exposeInMainWorld: (name, api) => { assert.equal(name, 'archive'); bridge = api; } },
        ipcRenderer: { invoke: async (...args) => { calls.push(args); return { ok: true }; } },
      };
    },
  });
  assert.deepEqual(Object.keys(bridge), ['players', 'bio', 'notable', 'pgn']);
  await bridge.players(); await bridge.bio('Tal'); await bridge.notable('Tal'); await bridge.pgn('game');
  assert.deepEqual(calls, [['archive:players'], ['archive:bio', 'Tal'], ['archive:notable', 'Tal'], ['archive:pgn', 'game']]);
});
