import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ClassicChessClient } from '../dist/esm/index.js';
import { ApplicationClient } from '../dist/esm/application.js';

test('public capabilities include stats, resolver, explorer and both export formats', async () => {
  const calls: Array<{ url: URL; input: RequestInit | undefined }> = [];
  const api = new ClassicChessClient({ fetch: async (url, input) => {
    calls.push({ url: new URL(url as URL), input });
    return new Response((url as URL).pathname.includes('/export/') ? 'exported' : '{"ok":true}');
  } });
  assert.deepEqual(await api.masterStats({ query: 'Tal & Keres' }), { ok: true });
  await api.players('Tal & Keres', { limit: 7 });
  await api.explorer({ play: 'e2e4,e7e5', topGames: 3 });
  await api.explorerSources();
  assert.equal(await api.exportMasterGames({ query: 'Tal', format: 'ndjson', pgnInJson: false }), 'exported');
  assert.equal(await api.exportPublicGames({ archivePlayer: 'Tal', format: 'ndjson', pgnInJson: false }), 'exported');
  assert.deepEqual(calls.map(c => c.url.pathname), ['/api/v1/stats/', '/api/v1/players/',
    '/api/v1/opening-explorer/', '/api/v1/opening-explorer/sources/', '/api/v1/games/export/', '/api/v1/public/games/export/']);
  assert.equal(calls[0]!.url.searchParams.get('q'), 'Tal & Keres');
  assert.equal(calls[1]!.url.searchParams.get('limit'), '7');
  assert.equal(calls[2]!.url.searchParams.get('topGames'), '3');
  for (const call of calls.slice(4)) {
    assert.equal(call.url.searchParams.get('format'), 'ndjson');
    assert.equal(call.url.searchParams.get('pgnInJson'), 'false');
  }
  assert.ok(calls.every(c => !new Headers(c.input!.headers).has('Authorization')));
});

test('account helpers send explicit credentials and preserve request bodies', async () => {
  const calls: Array<RequestInit & { path: string }> = [];
  const api = new ApplicationClient({ fetch: async (url, input) => {
    calls.push({ path: new URL(url as URL).pathname, ...input });
    return Response.json({ ok: true });
  } });
  await api.accountMe('fixture');
  await api.accountCollections('fixture');
  await api.accountCreateCollection('Tal archive', 'fixture');
  await api.accountImportPublicPlayerGames({ name: 'Tal archive', archivePlayer: 'Tal', since: 1960 }, 'fixture');
  assert.deepEqual(calls.map(c => c.path), ['/api/v1/account/me/', '/api/v1/account/collections/',
    '/api/v1/account/collections/', '/api/v1/account/collections/import/']);
  assert.deepEqual(JSON.parse(calls[2]!.body as string), { name: 'Tal archive' });
  assert.equal(JSON.parse(calls[3]!.body as string).archive_player, 'Tal');
  assert.ok(calls.every(c => new Headers(c.headers).get('Authorization') === 'Bearer fixture'));
});

test('scanner sends bounded JPEG multipart bytes and does not send invalid images', async () => {
  const calls: Array<{ url: unknown; input: RequestInit | undefined }> = [];
  const api = new ApplicationClient({ fetch: async (url, input) => {
    calls.push({ url, input });
    return Response.json({ ok: true });
  } });
  const jpeg = new Uint8Array([255, 216, 0, 127, 255, 217]);
  await api.scanPosition(jpeg, 'fixture');
  assert.equal(new URL(calls[0]!.url as URL).pathname, '/api/v1/mobile/position-scan/');
  const headers = new Headers(calls[0]!.input!.headers);
  assert.equal(headers.get('Authorization'), 'Bearer fixture');
  const form = await new Response(calls[0]!.input!.body, { headers }).formData();
  const file = form.get('image') as File;
  assert.equal(file.name, 'diagram.jpg');
  assert.equal(file.type, 'image/jpeg');
  assert.deepEqual(new Uint8Array(await file.arrayBuffer()), jpeg);
  for (const image of [new Uint8Array(), new Uint8Array(850001)]) {
    await assert.rejects(() => api.scanPosition(image, 'fixture'), { code: 'invalid_upload' });
  }
  assert.equal(calls.length, 1);
});

test('PGN bundles preserve order and reject links outside the configured public API', async () => {
  const calls: string[] = [];
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

test('site page reads use versioned public routes without credentials', async () => {
  const calls: Array<{ url: URL; input: RequestInit | undefined }> = [];
  const api = new ClassicChessClient({ fetch: async (url, input) => {
    calls.push({ url: new URL(url as URL), input });
    return Response.json({ source: 'public' });
  } });
  await api.gallery({ query: 'tal', page: 2, pageSize: 12 });
  await api.galleryPhoto('67217590');
  await api.beginnerGames();
  await api.dailyGame();
  await api.eventOfTheDay();
  await api.todaysPicks();
  await api.publicEvent('wcc-1972');
  await api.publicEventAbout('wcc-1972');
  await api.siteSearch('fischer spassky');
  await api.siteSearch('tal', 'games', 2);
  await api.tablebase('8/8/8/8/8/2k5/2P5/2K5 w - - 0 1');
  await api.lichessExplorer();
  await api.lichessExplorer({ fen: '8/8/8/8/8/2k5/2P5/2K5 w - - 0 1', player: 'DrNykterstein', color: 'white', result: 'win' });
  assert.deepEqual(calls.map(c => c.url.pathname + c.url.search), [
    '/api/v1/public/gallery/?page=2&page_size=12&q=tal', '/api/v1/public/gallery/67217590/',
    '/api/v1/public/beginner-games/', '/api/v1/public/daily/', '/api/v1/public/event-of-the-day/',
    '/api/v1/public/todays-picks/', '/api/v1/public/events/wcc-1972/',
    '/api/v1/public/events/wcc-1972/about/', '/api/v1/public/search/?q=fischer+spassky',
    '/api/v1/public/search/?q=tal&kind=games&page=2',
    '/api/v1/tablebase/?fen=8%2F8%2F8%2F8%2F8%2F2k5%2F2P5%2F2K5+w+-+-+0+1',
    '/api/v1/opening-explorer/lichess/',
    '/api/v1/opening-explorer/lichess/?fen=8%2F8%2F8%2F8%2F8%2F2k5%2F2P5%2F2K5+w+-+-+0+1&player=DrNykterstein&color=white&result=win',
  ]);
  assert.ok(calls.every(c => !new Headers(c.input!.headers).has('Authorization')));
  // Values cast `as never` are ones a JavaScript caller can pass despite the
  // TypeScript signatures; the SDK must still reject them at runtime.
  for (const call of [() => api.publicEvent('../account/me'), () => api.galleryPhoto('x?y'), () => api.siteSearch(''),
    () => api.siteSearch('x'.repeat(121)), () => api.siteSearch('tal', 'users' as never), () => api.siteSearch('tal', 'games', 0),
    () => api.tablebase(''), () => api.tablebase('k'.repeat(201)), () => api.gallery({ pageSize: 500 }),
    () => api.lichessExplorer({ player: 'a' }), () => api.lichessExplorer({ player: 'x/../me' }),
    () => api.lichessExplorer({ result: 'win' }), () => api.lichessExplorer({ player: 'abc', color: 'red' as never }),
    () => api.lichessExplorer({ fen: 'k'.repeat(101) })]) {
    assert.throws(call);
  }
  assert.equal(calls.length, 13);
});

test('api-gaps public reads send exact paths and wire filter names without credentials', async () => {
  const calls: Array<{ url: URL; input: RequestInit | undefined }> = [];
  const api = new ClassicChessClient({ fetch: async (url, input) => {
    calls.push({ url: new URL(url as URL), input });
    return Response.json({ ok: true });
  } });
  await api.chessToday();
  await api.chessTodayOnDate(2, 29);
  await api.studyThemes();
  await api.siteUpdates({ page: 2, pageSize: 5 });
  await api.siteUpdate('2026-11-01-new-explorer');
  await api.sharedGymGame('7.abc_DEF-1');
  await api.siteSearch('tal', 'site', 2);
  await api.playerExplorer({ player: 'Tal' });
  await api.playerExplorer({ player: 'Tal', color: 'white', result: 'win', page: 2, since: 1960, until: 1970 });
  await api.lichessExplorerGame('AbCd1234');
  await api.explorer({ play: 'e2e4', since: 1950, until: 1960 });
  await api.lichessExplorer({ player: 'DrNykterstein', since: 2015, until: 2020 });
  await api.publicGames({ theme: 'sacrifice,attack', eco: 'B9', result: '1/2-1/2', annotationQ: 'novelty',
    annotationAuthor: 'Tal', annotationBook: 'Life' });
  await api.annotatedGames('my-system', { page: 2, query: 'zwischenzug', headerQuery: 'Tal', author: 'Nimzowitsch', sort: 'desc' });
  assert.deepEqual(calls.map(c => c.url.pathname + c.url.search), [
    '/api/v1/public/chess-today/', '/api/v1/public/chess-today/2/29/', '/api/v1/public/themes/',
    '/api/v1/public/site-updates/?page=2&page_size=5', '/api/v1/public/site-updates/2026-11-01-new-explorer/',
    '/api/v1/public/gym/games/7.abc_DEF-1/', '/api/v1/public/search/?q=tal&kind=site&page=2',
    '/api/v1/opening-explorer/player/?player=Tal&color=both&result=all',
    '/api/v1/opening-explorer/player/?player=Tal&color=white&result=win&page=2&since=1960&until=1970',
    '/api/v1/opening-explorer/lichess/games/AbCd1234/', '/api/v1/opening-explorer/?play=e2e4&moves=12&since=1950&until=1960',
    '/api/v1/opening-explorer/lichess/?player=DrNykterstein&color=both&result=all&since=2015&until=2020',
    '/api/v1/public/games/?theme=sacrifice%2Cattack&eco=B9&result=1%2F2-1%2F2&annotation_q=novelty&annotation_author=Tal&annotation_book=Life',
    '/api/v1/annotated/books/my-system/games/?page=2&q=zwischenzug&header_q=Tal&author=Nimzowitsch&sort=desc',
  ]);
  assert.ok(calls.every(c => !new Headers(c.input!.headers).has('Authorization')));
});

test('by-token exports and the game-link loader POST their bodies; the API book package negotiates CCNB', async () => {
  const calls: Array<{ url: URL; input: RequestInit | undefined }> = [];
  const api = new ClassicChessClient({ fetch: async (url, input) => {
    const parsed = new URL(url as URL);
    calls.push({ url: parsed, input });
    if (parsed.pathname.endsWith('/ccnb/')) {
      return new Response(new Uint8Array([1, 2]), { headers: { 'Content-Type': 'application/vnd.classicchess.notebook' } });
    }
    return parsed.pathname.includes('/export/') ? new Response('exported') : Response.json({ pgn: '1. e4 *', orientation: 'black' });
  } });
  assert.equal(await api.exportMasterGamesByToken(['g1a2-0123456789ab', 'gz-0123456789ab'], { format: 'ndjson' }), 'exported');
  assert.equal(await api.exportPublicGamesByToken(['tal-vs-larsen', 'ann/g1'], { theme: 'sacrifice' }), 'exported');
  assert.deepEqual(await api.resolveGameLink('https://lichess.org/abcdefgh/black'), { pgn: '1. e4 *', orientation: 'black' });
  assert.deepEqual(await api.annotatedBookCcnb('my-system', { ccnbFormat: 3 }), new Uint8Array([1, 2]));
  const sent = calls.map(c => [c.input!.method, c.url.pathname + c.url.search, c.input!.body,
    new Headers(c.input!.headers).get('Content-Type')]);
  assert.deepEqual(sent, [
    ['POST', '/api/v1/games/export/?format=ndjson&pgnInJson=true', 'g1a2-0123456789ab\ngz-0123456789ab', 'text/plain; charset=utf-8'],
    ['POST', '/api/v1/public/games/export/?theme=sacrifice&format=pgn', 'tal-vs-larsen\nann/g1', 'text/plain; charset=utf-8'],
    ['POST', '/api/v1/analysis/game-link/', JSON.stringify({ url: 'https://lichess.org/abcdefgh/black' }), 'application/json; charset=utf-8'],
    ['GET', '/api/v1/annotated/books/my-system/ccnb/', undefined, null],
  ]);
  assert.equal(new Headers(calls[3]!.input!.headers).get('CCNB-Format'), '3');
  assert.ok(calls.every(c => !new Headers(c.input!.headers).has('Authorization')));
});

test('api-gaps public helpers reject invalid arguments before network I/O', async () => {
  let calls = 0;
  const api = new ClassicChessClient({ fetch: async () => { calls++; return Response.json({}); } });
  const invalid = [
    () => api.chessTodayOnDate(13, 1), () => api.chessTodayOnDate(2, 0), () => api.siteUpdate('../me'),
    () => api.sharedGymGame('7.abc/../x'), () => api.sharedGymGame('abc'), () => api.siteSearch('tal', 'site', 0),
    () => api.playerExplorer({ player: '' }), () => api.playerExplorer({ player: 'x'.repeat(81) }),
    () => api.playerExplorer({ player: 'Tal', color: 'red' as never }), () => api.lichessExplorerGame('../me123'),
    () => api.resolveGameLink(''), () => api.resolveGameLink('x'.repeat(501)), () => api.exportMasterGamesByToken([]),
    () => api.exportMasterGamesByToken(new Array(301).fill('g1-0123456789ab')), () => api.exportMasterGamesByToken(['../me']),
    () => api.exportPublicGamesByToken(['a/b/c']), () => api.publicGames({ result: '2-0' as never }),
    () => api.annotatedGames('my-system', { sort: 'newest' as never }), () => api.annotatedBookCcnb('../x'),
  ];
  for (const call of invalid) await assert.rejects(async () => call());
  assert.equal(calls, 0);
});

test('an explorer error string becomes the ApiError message', async () => {
  const api = new ClassicChessClient({ fetch: async () => Response.json({ error: 'No player matches Nobody.' }, { status: 404 }) });
  await assert.rejects(async () => api.playerExplorer({ player: 'Nobody' }),
    { name: 'ApiError', message: 'No player matches Nobody.', status: 404, code: 'http_error' });
});

test('library helpers send exact methods, paths and bodies with explicit credentials', async () => {
  const calls: Array<{ method: string | undefined; path: string; body: RequestInit['body']; headers: RequestInit['headers'] }> = [];
  const api = new ApplicationClient({ fetch: async (url, input) => {
    const parsed = new URL(url as URL);
    calls.push({ method: input!.method, path: parsed.pathname + parsed.search, body: input!.body, headers: input!.headers });
    return Response.json({ changed: true });
  } });
  assert.equal((await api.accountAddCollectionGame(7, 'tal-vs-larsen', 'fixture')).data.changed, true);
  await api.accountStarredPlayers('fixture', 2, 10);
  await api.accountStarPlayer('mikhail-tal', 'fixture');
  await api.accountUnstarPlayer('mikhail-tal', 'fixture');
  await api.accountStarredGames('fixture');
  await api.accountStarGame('g1', 'fixture');
  await api.accountUnstarGame('g1', 'fixture');
  await api.accountSetImportedGameVisibility('mine', 'public', 'fixture');
  await api.accountDeleteImportedGame('mine', 'fixture');
  assert.deepEqual(calls.map(c => `${c.method} ${c.path}`), [
    'POST /api/v1/account/collections/7/items/', 'GET /api/v1/account/starred/players/?page=2&page_size=10',
    'PUT /api/v1/account/starred/players/mikhail-tal/', 'DELETE /api/v1/account/starred/players/mikhail-tal/',
    'GET /api/v1/account/starred/games/?page=1&page_size=50', 'PUT /api/v1/account/starred/games/g1/',
    'DELETE /api/v1/account/starred/games/g1/', 'PATCH /api/v1/account/imported-games/mine/',
    'DELETE /api/v1/account/imported-games/mine/',
  ]);
  assert.deepEqual(JSON.parse(calls[0]!.body as string), { game: 'tal-vs-larsen' });
  assert.deepEqual(JSON.parse(calls[7]!.body as string), { visibility: 'public' });
  assert.ok(calls.every(c => new Headers(c.headers).get('Authorization') === 'Bearer fixture'));
  for (const call of [() => api.accountAddCollectionGame(0, 'g', 't'), () => api.accountAddCollectionGame(7, '../me', 't'),
    () => api.accountStarPlayer('a/b', 't'), () => api.accountUnstarGame('', 't'), () => api.accountStarredGames('t', 1, 500),
    () => api.accountSetImportedGameVisibility('mine', 'PUBLIC' as never, 't'), () => api.accountDeleteImportedGame('x?y', 't')]) {
    assert.throws(call);
  }
  assert.equal(calls.length, 9);
});
