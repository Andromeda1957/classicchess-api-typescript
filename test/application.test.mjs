import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ApplicationClient, ClassicChessClient } from '../dist/esm/index.js';

test('event catalogs and curated game order are first-class SDK requests', async () => {
  const calls = [];
  const payload = { query: '', series_cards: [{ name: 'Candidates', slug: 'candidates', year_from: null }] };
  const client = new ClassicChessClient({ fetch: async (url) => { calls.push(new URL(url)); return Response.json(payload); } });
  assert.deepEqual(await client.eventSeries(), payload);
  assert.equal(calls.at(-1).pathname, '/api/v1/public/event-series/');
  for (const series of ['candidates', 'matches', 'misc']) {
    await client.eventSeries(undefined, series);
    assert.equal(calls.at(-1).searchParams.get('series'), series);
  }
  await client.publicGames({ archiveEvent: 'london-1851', sort: 'event', page: 2 });
  assert.equal(calls.at(-1).searchParams.get('sort'), 'event');
  assert.throws(() => client.eventSeries('London', 'misc'), { code: 'invalid_query' });
  assert.throws(() => client.eventSeries(undefined, '../private'), { code: 'invalid_query' });
  assert.throws(() => client.publicGames({ sort: 'event' }), { code: 'invalid_query' });
  assert.equal(calls.length, 5);
});

test('application JSON transport retains status, private errors, binary uploads and explicit credentials', async () => {
  const calls = [];
  const payload = { error: { code: 'conflict', message: 'Changed elsewhere.' }, version: 9 };
  const client = new ApplicationClient({ fetch: async (url, init) => {
    calls.push({ url, ...init });
    return Response.json(payload, { status: 409, headers: { 'Retry-After': '30' } });
  } });
  for (const path of ['/api/v1/account/me/', '/api/v1/desktop/notebooks/atomic-sync/', '/cast/api/mobile/sessions/session/command/']) {
    const body = new Uint8Array([67, 67, 78, 66, 0, 255]);
    const response = await client.request({ path, method: 'POST', body,
      contentType: 'application/vnd.classicchess.notebook', token: 'test-device', timeoutMs: 60_000 });
    assert.deepEqual(response, { ok: false, status: 409, data: payload, retryAfter: '30' });
    const call = calls.at(-1);
    assert.deepEqual(call.body, body);
    assert.equal(new Headers(call.headers).get('Authorization'), 'Bearer test-device');
    assert.equal(call.redirect, 'error');
    assert.equal(call.credentials, 'omit');
  }
  await client.request({ path: '/api/v1/account/mobile/login/', method: 'POST', body: '{}' });
  assert.equal(new Headers(calls.at(-1).headers).has('Authorization'), false);
});

test('application credentials never reach public endpoints, alternate origins or ambiguous paths', async () => {
  let calls = 0;
  const client = new ApplicationClient({ fetch: async () => { calls++; return Response.json({}); } });
  for (const path of ['https://other.invalid/api/v1/account/me/', '//other.invalid/api/v1/account/me/',
    '/api/v1/../account/', '/api/v1/%2e%2e/account/', '/api/v1/account/me/#fragment',
    '/static/portrait.webp', '/api/v1/account\\me/', '/api/v1/account/me/\n']) {
    await assert.rejects(async () => client.request({ path, token: 'test-device' }), { code: 'unsafe_url' });
  }
  for (const path of ['/api/v1/public/players/', '/api/v1/games/?q=Tal', '/api/v1/opening-explorer/']) {
    await assert.rejects(async () => client.request({ path, token: 'test-device' }), { code: 'unsafe_credentials' });
  }
  await assert.rejects(async () => client.request({ path: '/api/v1/account/me/', token: 'bad\r\nheader' }), { code: 'invalid_token' });
  assert.equal(calls, 0);
});

test('application response bounds, cancellation and empty responses share the SDK transport', async () => {
  const client = new ApplicationClient({ maxResponseBytes: 8, fetch: async () => new Response('123456789') });
  await assert.rejects(client.request({ path: '/api/v1/mobile/home/' }), { code: 'response_too_large' });
  const empty = new ApplicationClient({ fetch: async () => new Response(null, { status: 204 }) });
  assert.deepEqual((await empty.request({ path: '/api/v1/account/me/' })).data, {});
  const invalid = new ApplicationClient({ fetch: async () => new Response('<h1>Missing</h1>', { status: 404 }) });
  await assert.rejects(invalid.request({ path: '/api/v1/account/me/' }), { code: 'invalid_response', status: 404 });
  const aborted = new ApplicationClient({ fetch: async (_url, init) => {
    assert.equal(init.signal.aborted, true);
    throw init.signal.reason;
  } });
  const controller = new AbortController(); controller.abort();
  await assert.rejects(aborted.request({ path: '/api/v1/mobile/home/', signal: controller.signal }), { code: 'aborted' });
});
