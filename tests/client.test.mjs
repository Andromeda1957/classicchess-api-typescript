import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { test } from 'node:test';
import { ClassicChessClient, ApiError } from '../dist/esm/index.js';

function fake(payloads, extra = {}) {
  const calls = [];
  const client = new ClassicChessClient({
    ...extra,
    fetch: async (url, options) => {
      calls.push({ url: new URL(url), ...options });
      const payload = payloads.shift();
      assert.notEqual(payload, undefined, `Unexpected fetch: ${url}`);
      return payload instanceof Response ? payload : Response.json(payload);
    },
  });
  return { client, calls };
}

test('MasterDB search preserves approximate counts, limits and query paging', async () => {
  for (const query of ['karpov', 'Kasparov Karpov', 'Tal & Keres?']) {
    const payload = { query, count: 26, count_is_exact: false, page: 1, page_count: 2,
      page_size: 25, result_limit: 1000, hit_result_limit: false,
      next: '/api/v1/games/?q=karpov&page=2&page_size=25', previous: null,
      message: null, hint: 'Refine your search', results: [{ token: 'g1-000000000000', opening: 'Sicilian Defense' }] };
    const { client, calls } = fake([payload]);
    assert.deepEqual(await client.masterGames({ query, page: 1, pageSize: 25 }), payload);
    assert.equal(calls[0].url.pathname, '/api/v1/games/');
    assert.deepEqual(Object.fromEntries(calls[0].url.searchParams), { page: '1', page_size: '25', q: query });
    assert.equal(calls[0].credentials, 'omit');
    assert.equal(calls[0].redirect, 'error');
  }
});

test('MasterDB detail and PGN use opaque MasterDB tokens', async () => {
  const token = 'gabc-000000000000';
  const detail = { token, pgn: '[Result "*"]\n\n1. e4 *', mainline: { moves: [{ san: 'e4' }] } };
  const { client, calls } = fake([detail, new Response(detail.pgn)]);
  assert.deepEqual(await client.masterGame(token), detail);
  assert.equal(await client.masterPgn(token), detail.pgn);
  assert.deepEqual(calls.map(c => c.url.pathname), [`/api/v1/games/${token}/`, `/api/v1/games/${token}/pgn/`]);
  for (const bad of ['../account', 'Tal/game', 'game-slug', token + '?x=1', 'g1-0123456789ag']) {
    assert.throws(() => client.masterGame(bad), { code: 'invalid_identifier' });
    assert.throws(() => client.masterPgn(bad), { code: 'invalid_identifier' });
  }
  assert.equal(calls.length, 2);
});

test('MasterDB query and pagination bounds reject invalid inputs without fetching', () => {
  const { client, calls } = fake([]);
  for (const query of ['', '   ', 'a'.repeat(121), {}, null]) {
    assert.throws(() => client.masterGames({ query }), { code: 'invalid_query' });
  }
  for (const page of [0, -1, 1.5, NaN]) assert.throws(() => client.masterGames({ query: 'Tal', page }), { code: 'invalid_pagination' });
  assert.throws(() => client.masterGames({ query: 'Tal', pageSize: 101 }), { code: 'invalid_pagination' });
  assert.equal(calls.length, 0);
});

test('MasterDB iteration follows approximate-count pages and stops at the server limit', async () => {
  const { client, calls } = fake([1, 2, 3].map(page => ({
    results: [{ token: String(page) }], count_is_exact: false, hit_result_limit: page === 3,
    next: page < 3 ? `/api/v1/games/?q=Tal&page=${page + 1}` : null,
  })));
  assert.deepEqual(await collect(client.iterateMasterGames({ query: 'Tal' })), [{ token: '1' }, { token: '2' }, { token: '3' }]);
  assert.equal(calls.length, 3);
  for (const next of ['https://other.example/api/v1/games/', '/api/v1/account/me/', '/api/v1/games/g1-0123456789ab/', '/api/v1/public/games/']) {
    const unsafe = fake([{ results: [1], next }]);
    await assert.rejects(collect(unsafe.client.iterateMasterGames({ query: 'Tal' })), { code: 'unsafe_url' });
    assert.equal(unsafe.calls.length, 1);
  }
});

test('catalogs distinguish full objects from names without silently paginating', async () => {
  for (const [full, names, field, path] of [
    ['publicPlayers', 'playerNames', 'name', '/api/v1/public/players/'],
    ['publicEvents', 'eventNames', 'name', '/api/v1/public/events/'],
    ['annotatedBooks', 'bookTitles', 'label', '/api/v1/annotated/books/'],
  ]) {
    const payload = { count: 3, results: ['Tal', 'Capablanca', 'Petrosian'].map((name, i) => ({ [field]: name, slug: String(i) })) };
    const { client, calls } = fake([payload, payload]);
    assert.deepEqual(await client[full](), payload);
    assert.deepEqual(await client[names](), ['Tal', 'Capablanca', 'Petrosian']);
    assert.equal(calls.length, 2);
    assert.equal(calls[0].url.pathname, path);
    assert.equal(new Headers(calls[0].headers).get('Accept'), 'application/json');
    assert.equal(calls[0].credentials, 'omit');
    assert.equal(calls[0].redirect, 'error');
  }
});

test('discovery, profile, nullable bio and curated order retain server data', async () => {
  const payloads = [
    { collections: { players: { url: '/api/v1/public/players/' } } },
    { player: { slug: 'Mikhail_Tal', name: 'Tal' } },
    { player: { slug: 'Mikhail_Tal' }, bio: null },
    { results: [{ position: 1, title: 'Second game', game: { token: 'second' } }, { position: 2, title: 'First game', game: { token: 'first' } }] },
  ];
  const { client, calls } = fake([...payloads]);
  assert.deepEqual(await client.discovery(), payloads[0]);
  assert.deepEqual(await client.publicPlayer('Mikhail_Tal'), payloads[1]);
  assert.deepEqual(await client.publicPlayerBio('Mikhail_Tal'), payloads[2]);
  assert.deepEqual(await client.publicNotableGames('Mikhail_Tal'), payloads[3]);
  assert.deepEqual(calls.map(call => call.url.pathname), ['/api/v1/', '/api/v1/public/players/Mikhail_Tal/', '/api/v1/public/players/Mikhail_Tal/bio/', '/api/v1/public/players/Mikhail_Tal/notable-games/']);
});

test('queries encode user text and public filters using API parameter names', async () => {
  const { client, calls } = fake([{}, {}]);
  await client.publicPlayers('Tal & Keres?');
  await client.publicGames({ query: 'B33 & wins', archivePlayer: 'Mikhail_Tal', archiveEvent: 'event', since: 1950, until: 1960, sort: 'desc', page: 2, pageSize: 3 });
  assert.equal(calls[0].url.searchParams.get('q'), 'Tal & Keres?');
  assert.deepEqual(Object.fromEntries(calls[1].url.searchParams), { page: '2', page_size: '3', q: 'B33 & wins', archive_player: 'Mikhail_Tal', archive_event: 'event', since: '1950', until: '1960', sort: 'desc' });
});

test('canonical and legacy public tokens retrieve detail and raw PGN', async () => {
  for (const token of ['game-slug', 'Mikhail_Tal/game-slug']) {
    const pgn = '[Event "Test"]\n\n1. e4 e5 *\n';
    const { client, calls } = fake([{ token }, new Response(pgn)]);
    assert.deepEqual(await client.publicGame(token), { token });
    assert.equal(await client.publicPgn(token), pgn);
    assert.equal(calls[1].url.pathname, `/api/v1/public/games/${token}/pgn/`);
  }
});

test('annotated books expose page, detail and per-game or whole-book PGN', async () => {
  const { client, calls } = fake([{}, {}, new Response('game pgn'), new Response('book pgn')]);
  await client.annotatedGames('book', { page: 2, pageSize: 10 });
  await client.annotatedGame('book', 'game');
  assert.equal(await client.annotatedPgn('book', 'game'), 'game pgn');
  assert.equal(await client.annotatedPgn('book'), 'book pgn');
  assert.deepEqual(calls.map(call => call.url.pathname), ['/api/v1/annotated/books/book/games/', '/api/v1/annotated/books/book/games/game/', '/api/v1/annotated/books/book/games/game/pgn/', '/api/v1/annotated/books/book/pgn/']);
  assert.equal(calls[0].url.searchParams.get('page_size'), '10');
});

test('export validates batch size and preserves canonical and legacy tokens', async () => {
  const { client, calls } = fake([new Response('pgn')]);
  assert.equal(await client.exportPublicGames({ tokens: ['one', 'Tal/two'] }), 'pgn');
  assert.equal(calls[0].url.searchParams.get('tokens'), 'one,Tal/two');
  for (const tokens of [[], Array(301).fill('game')]) assert.throws(() => client.exportPublicGames({ tokens }), { code: 'invalid_export' });
});

async function collect(iterator) { const rows = []; for await (const row of iterator) rows.push(row); return rows; }

test('both iterators follow all three pages lazily and stop on null', async () => {
  for (const annotated of [false, true]) {
    const path = annotated ? '/api/v1/annotated/books/book/games/' : '/api/v1/public/games/';
    const { client, calls } = fake([1, 2, 3].map(page => ({ results: [{ token: String(page) }], next: page < 3 ? `${path}?page=${page + 1}&page_size=1` : null })));
    const iterator = annotated ? client.iterateAnnotatedGames('book', { pageSize: 1 }) : client.iteratePublicGames({ pageSize: 1 });
    assert.equal(calls.length, 0);
    assert.deepEqual(await collect(iterator), [{ token: '1' }, { token: '2' }, { token: '3' }]);
    assert.equal(calls.length, 3);
  }
});

test('iteration respects limits, early break, zero limit and maxPages', async () => {
  for (const limit of [0, 1, 2]) {
    const { client, calls } = fake([{ results: [1, 2, 3], next: '/api/v1/public/games/?page=2' }]);
    assert.deepEqual(await collect(client.iteratePublicGames({}, { limit })), [1, 2].slice(0, limit));
    assert.equal(calls.length, limit === 0 ? 0 : 1);
  }
  const { client, calls } = fake([{ results: [1, 2], next: '/api/v1/public/games/?page=2' }]);
  for await (const value of client.iteratePublicGames()) { assert.equal(value, 1); break; }
  assert.equal(calls.length, 1);
  const capped = fake([{ results: [1], next: '/api/v1/public/games/?page=2' }]);
  await assert.rejects(collect(capped.client.iteratePublicGames({}, { maxPages: 1 })), { code: 'invalid_pagination' });
});

test('pagination rejects foreign origins, other resources and cycles before fetching them', async () => {
  for (const next of ['https://other.example/api/v1/public/games/', '//other.example/api/v1/public/games/', '/api/v1/account/me/', '/api/v1/public/players/', '/api/v1/public/games/']) {
    const { client, calls } = fake([{ results: [1], next }]);
    await assert.rejects(collect(client.iteratePublicGames()), error => ['unsafe_url', 'invalid_pagination'].includes(error.code));
    assert.equal(calls.length, 1);
  }
  for (const payload of [null, {}, { results: [], next: 3 }]) {
    const { client } = fake([payload]);
    await assert.rejects(collect(client.iteratePublicGames()), { code: 'invalid_response' });
  }
});

test('pagination resolves query-relative links and reports malformed URLs as ApiError', async () => {
  const { client, calls } = fake([{ results: [1], next: '?page=2' }, { results: [2], next: null }]);
  assert.deepEqual(await collect(client.iteratePublicGames()), [1, 2]);
  assert.equal(calls[1].url.pathname, '/api/v1/public/games/');
  const broken = fake([{ results: [], next: 'http://[' }]);
  await assert.rejects(collect(broken.client.iteratePublicGames()), error => error instanceof ApiError && error.code === 'unsafe_url');
});

test('identifiers and base URLs reject path injection and embedded credentials', () => {
  const { client, calls } = fake([]);
  for (const value of ['../x', '%2e%2e', 'x?format=txt', 'x#fragment', 'https://evil.example', 'a\\b', '', 'a/b/c', 'a\nb']) {
    assert.throws(() => client.publicPlayer(value), ApiError);
    assert.throws(() => client.publicPgn(value), ApiError);
    assert.throws(() => client.annotatedGame('book', value), ApiError);
  }
  assert.equal(calls.length, 0);
  for (const baseUrl of ['file:///etc', 'https://user:pass@example.org', 'https://example.org/path', 'https://example.org?token=x']) {
    assert.throws(() => new ClassicChessClient({ baseUrl }), { code: 'invalid_options' });
  }
  for (const page of [0, -1, 1.5, NaN]) assert.throws(() => client.publicGames({ page }), { code: 'invalid_pagination' });
  assert.throws(() => client.publicGames({ pageSize: 101 }), { code: 'invalid_pagination' });
});

test('structured errors retain status, API code and Retry-After, including proxy failures', async () => {
  for (const response of [
    Response.json({ error: { code: 'rate_limited', message: 'Slow down' } }, { status: 429, headers: { 'Retry-After': '900' } }),
    new Response('<html>Unavailable</html>', { status: 503 }),
    new Response('null', { status: 404 }),
  ]) {
    const { client } = fake([response]);
    await assert.rejects(client.publicPlayers(), error => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.status, response.status);
      assert.equal(error.code, response.status === 429 ? 'rate_limited' : 'http_error');
      assert.equal(error.retryAfter, response.status === 429 ? '900' : null);
      return true;
    });
  }
  const { client } = fake([new Response('bad json')]);
  await assert.rejects(client.publicPlayers(), { code: 'invalid_response' });
});

test('response byte limit counts UTF-8 bytes and cancels oversized streams', async () => {
  const { client } = fake([new Response('♜♞♝')], { maxResponseBytes: 8 });
  await assert.rejects(client.publicPgn('game'), { code: 'response_too_large' });
});

test('declared oversized responses are rejected before consuming the stream', async () => {
  const { client } = fake([new Response('{}', { headers: { 'Content-Length': '1000001' } })], { maxResponseBytes: 1_000_000 });
  await assert.rejects(client.annotatedBooks(), { code: 'response_too_large' });
});

test('real HTTP transport handles JSON, redirects, timeout, cancellation and body limits', async () => {
  let mode = 'json';
  let destinationRequests = 0;
  const server = createServer((request, response) => {
    if (request.url === '/redirect-target') destinationRequests++;
    if (mode === 'redirect') { response.writeHead(302, { Location: '/redirect-target' }); response.end(); }
    else if (mode === 'slow') { response.writeHead(200); response.write('{'); }
    else { response.setHeader('Content-Type', 'application/json'); response.end('{"results":[]}'); }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const client = new ClassicChessClient({ baseUrl, timeoutMs: 5_000 });
    assert.deepEqual(await client.publicPlayers(), { results: [] });
    mode = 'redirect';
    await assert.rejects(client.publicPlayers(), { code: 'network_error' });
    assert.equal(destinationRequests, 0);
    mode = 'slow';
    const timeoutClient = new ClassicChessClient({ baseUrl, timeoutMs: 100 });
    await assert.rejects(timeoutClient.publicPlayers(), { code: 'timeout' });
    const controller = new AbortController();
    const request = client.publicPlayers(undefined, { signal: controller.signal });
    controller.abort();
    await assert.rejects(request, { code: 'aborted' });
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});

test('CommonJS exposes the same client and structured error API', () => {
  const require = createRequire(import.meta.url);
  const cjs = require('../dist/cjs/index.js');
  assert.equal(new cjs.ClassicChessClient().baseUrl, new ClassicChessClient().baseUrl);
  assert.equal(new cjs.ApiError('failure', { code: 'test' }).code, 'test');
});
