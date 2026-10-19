import assert from 'node:assert/strict';
import { test, mock } from 'node:test';
import { Transport } from '../dist/esm/transport.js';

const url = new URL('https://classicchess.com/api/v1/desktop/notebooks/');
const json = (body, headers = {}) => Response.json(body, { headers: { ETag: '"one"', 'Cache-Control': 'private, no-cache', ...headers } });
const get = (headers = {}) => ({ method: 'GET', headers: { Accept: 'application/json', ...headers } });
function setup(replies, extra = {}) {
  const calls = [];
  const transport = new Transport({ revalidate: () => true, ...extra, fetch: async (url, init) => {
    calls.push({ url, init });
    const reply = replies.shift();
    if (reply instanceof Error) throw reply;
    assert.ok(reply, 'unexpected request');
    return reply;
  } });
  return { transport, calls };
}

test('binary replies never decode text until requested, then memoize UTF-8 text', async () => {
  const body = new TextEncoder().encode('échec');
  const { transport } = setup([new Response(body)]);
  const decode = mock.method(TextDecoder.prototype, 'decode');
  try {
    const response = await transport.exchange(url, get());
    assert.deepEqual(response.bytes, body);
    assert.equal(decode.mock.callCount(), 0);
    assert.equal(response.text, 'échec');
    assert.equal(response.text, 'échec');
    assert.equal(decode.mock.callCount(), 1);
  } finally { decode.mock.restore(); }
});

test('conditional JSON reads send a validator and return independent parsed bodies on 304', async () => {
  const { transport, calls } = setup([json({ results: [1] }), new Response(null, { status: 304, headers: { ETag: '"one"' } })]);
  const first = await transport.exchange(url, get({ Authorization: 'Bearer first' }));
  first.bytes.fill(0); // A caller must not corrupt the stored representation.
  const repeat = await transport.exchange(url, get({ Authorization: 'Bearer first' }));
  assert.equal(new Headers(calls[1].init.headers).get('If-None-Match'), '"one"');
  assert.equal(repeat.status, 200);
  assert.deepEqual(transport.json(repeat), { results: [1] });
});

test('credentials, format and query parameters partition the cache', async () => {
  const { transport, calls } = setup(Array.from({ length: 5 }, () => json({ results: [] })));
  await transport.exchange(url, get({ Authorization: 'Bearer one' }));
  await transport.exchange(url, get({ Authorization: 'Bearer two' }));
  await transport.exchange(url, get({ Authorization: 'Bearer one', 'CCNB-Format': '3' }));
  await transport.exchange(new URL('?page=2', url), get({ Authorization: 'Bearer one' }));
  await transport.exchange(url, get({ Authorization: 'Bearer one' }));
  assert.deepEqual(calls.map(c => new Headers(c.init.headers).get('If-None-Match')), [null, null, null, null, '"one"']);
});

test('no-store, Vary star, absent validators and non-JSON replies are never retained', async () => {
  for (const headers of [{ 'Cache-Control': 'private, no-store' }, { Vary: '*' }, { ETag: '' }, { 'Content-Type': 'application/octet-stream' }]) {
    const { transport, calls } = setup([json({ x: 1 }, headers), json({ x: 2 })]);
    await transport.exchange(url, get()); await transport.exchange(url, get());
    assert.equal(new Headers(calls[1].init.headers).get('If-None-Match'), null);
  }
});

test('writes and HTTP errors invalidate entries; network failures never serve stale data', async () => {
  const { transport, calls } = setup([json({ x: 1 }), new Error('offline'), new Response(null, { status: 403 }), json({ x: 2 }), json({ saved: true }), json({ x: 3 })]);
  await transport.exchange(url, get());
  await assert.rejects(transport.exchange(url, get()), { code: 'network_error' });
  assert.equal((await transport.exchange(url, get())).status, 403);
  await transport.exchange(url, get());
  assert.equal(new Headers(calls[3].init.headers).get('If-None-Match'), null);
  await transport.exchange(url, { method: 'POST' });
  await transport.exchange(url, get());
  assert.equal(new Headers(calls[5].init.headers).get('If-None-Match'), null);
});

test('an in-flight read cannot repopulate the cache after a write', async () => {
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const calls = [];
  const transport = new Transport({ revalidate: () => true, fetch: async (_url, init) => {
    calls.push(init);
    return calls.length === 1 ? pending : json({ version: calls.length });
  } });
  const old = transport.exchange(url, get());
  await transport.exchange(url, { method: 'POST' });
  release(json({ version: 1 })); await old;
  await transport.exchange(url, get());
  assert.equal(new Headers(calls[2].headers).get('If-None-Match'), null);
});

test('conditional storage is opt-in and bounded by entry count and byte size', async () => {
  const off = setup([json({ x: 1 }), json({ x: 1 })], { revalidate: undefined });
  await off.transport.exchange(url, get()); await off.transport.exchange(url, get());
  assert.equal(new Headers(off.calls[1].init.headers).get('If-None-Match'), null);
  const bounded = setup(Array.from({ length: 67 }, () => json({ value: 'x'.repeat(300_000) })));
  for (let i = 0; i < 65; i++) await bounded.transport.exchange(new URL('?page=' + i, url), get());
  await bounded.transport.exchange(new URL('?page=0', url), get());
  assert.equal(new Headers(bounded.calls[65].init.headers).get('If-None-Match'), null);
});
