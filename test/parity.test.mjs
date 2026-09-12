import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ClassicChessClient } from '../dist/esm/index.js';
import { ApplicationClient } from '../dist/esm/application.js';

test('public capabilities include stats, resolver, explorer and both export formats', async () => {
  const calls = [];
  const api = new ClassicChessClient({ fetch: async (url, input) => {
    calls.push({ url: new URL(url), input });
    return new Response(url.pathname.includes('/export/') ? 'exported' : '{"ok":true}');
  } });
  assert.deepEqual(await api.masterStats({ query: 'Tal & Keres' }), { ok: true });
  await api.players('Tal & Keres', { limit: 7 });
  await api.explorer({ play: 'e2e4,e7e5', topGames: 3 });
  await api.explorerSources();
  assert.equal(await api.exportMasterGames({ query: 'Tal', format: 'ndjson', pgnInJson: false }), 'exported');
  assert.equal(await api.exportPublicGames({ archivePlayer: 'Tal', format: 'ndjson', pgnInJson: false }), 'exported');
  assert.deepEqual(calls.map(c => c.url.pathname), ['/api/v1/stats/', '/api/v1/players/',
    '/api/v1/opening-explorer/', '/api/v1/opening-explorer/sources/', '/api/v1/games/export/', '/api/v1/public/games/export/']);
  assert.equal(calls[0].url.searchParams.get('q'), 'Tal & Keres');
  assert.equal(calls[1].url.searchParams.get('limit'), '7');
  assert.equal(calls[2].url.searchParams.get('topGames'), '3');
  for (const call of calls.slice(4)) {
    assert.equal(call.url.searchParams.get('format'), 'ndjson');
    assert.equal(call.url.searchParams.get('pgnInJson'), 'false');
  }
  assert.ok(calls.every(c => !new Headers(c.input.headers).has('Authorization')));
});

test('account helpers send explicit credentials and preserve request bodies', async () => {
  const calls = [];
  const api = new ApplicationClient({ fetch: async (url, input) => {
    calls.push({ path: new URL(url).pathname, ...input });
    return Response.json({ ok: true });
  } });
  await api.accountMe('fixture');
  await api.accountCollections('fixture');
  await api.accountCreateCollection('Tal archive', 'fixture');
  await api.accountImportPublicPlayerGames({ name: 'Tal archive', archivePlayer: 'Tal', since: 1960 }, 'fixture');
  assert.deepEqual(calls.map(c => c.path), ['/api/v1/account/me/', '/api/v1/account/collections/',
    '/api/v1/account/collections/', '/api/v1/account/collections/import/']);
  assert.deepEqual(JSON.parse(calls[2].body), { name: 'Tal archive' });
  assert.equal(JSON.parse(calls[3].body).archive_player, 'Tal');
  assert.ok(calls.every(c => new Headers(c.headers).get('Authorization') === 'Bearer fixture'));
});

test('scanner sends bounded JPEG multipart bytes and does not send invalid images', async () => {
  const calls = [];
  const api = new ApplicationClient({ fetch: async (url, input) => {
    calls.push({ url, input });
    return Response.json({ ok: true });
  } });
  const jpeg = new Uint8Array([255, 216, 0, 127, 255, 217]);
  await api.scanPosition(jpeg, 'fixture');
  assert.equal(new URL(calls[0].url).pathname, '/api/v1/mobile/position-scan/');
  const headers = new Headers(calls[0].input.headers);
  assert.equal(headers.get('Authorization'), 'Bearer fixture');
  const form = await new Response(calls[0].input.body, { headers }).formData();
  const file = form.get('image');
  assert.equal(file.name, 'diagram.jpg');
  assert.equal(file.type, 'image/jpeg');
  assert.deepEqual(new Uint8Array(await file.arrayBuffer()), jpeg);
  for (const image of [new Uint8Array(), new Uint8Array(850001)]) {
    await assert.rejects(() => api.scanPosition(image, 'fixture'), { code: 'invalid_upload' });
  }
  assert.equal(calls.length, 1);
});

test('PGN bundles preserve order and reject links outside the configured public API', async () => {
  const calls = [];
  const api = new ClassicChessClient({ fetch: async url => {
    calls.push(String(url));
    return new Response(` PGN ${calls.length}\n`);
  } });
  assert.equal(await api.pgnTextForGames(['/api/v1/public/games/one/pgn/', '/api/v1/annotated/books/book/pgn/']),
    'PGN 1\n\nPGN 2\n');
  assert.equal(await api.pgnTextForGames([]), '');
  await assert.rejects(() => api.pgnTextForGames(['https://elsewhere.test/api/v1/public/games/one/pgn/']), { code: 'unsafe_url' });
  assert.equal(calls.length, 2);
});
