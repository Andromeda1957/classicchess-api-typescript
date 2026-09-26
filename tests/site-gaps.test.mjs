import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ApplicationClient, ClassicChessClient } from '../dist/esm/index.js';

const NOTEBOOK = '0f8fad5b-d9cb-469f-a165-70867728950e';
const GIF = new Uint8Array([71, 73, 70, 56, 57, 97, 0, 255]);

function recorder(reply) {
  const calls = [];
  const fetch = async (url, init) => { calls.push({ url: new URL(url), ...init }); return reply(); };
  return { calls, fetch };
}

test('GIF downloads send the bearer and return exact bytes and the filename', async () => {
  const wire = recorder(() => new Response(GIF, { headers: {
    'Content-Type': 'image/gif', 'Content-Disposition': 'attachment; filename="game.gif"' } }));
  const client = new ApplicationClient({ fetch: wire.fetch });
  const cases = [
    [() => client.masterGameGif('g1a2-0123456789ab', 't'), '/api/v1/games/g1a2-0123456789ab/gif/'],
    [() => client.publicGameGif('tal-vs-larsen', 't', 'black'), '/api/v1/public/games/tal-vs-larsen/gif/?orientation=black'],
    [() => client.annotatedGameGif('my-system', 'game-1', 't'), '/api/v1/annotated/books/my-system/games/game-1/gif/'],
    [() => client.publicImportedGameGif('ann.lee+1', 'g1', 't'), '/api/v1/public/imported-games/ann.lee+1/g1/gif/'],
    [() => client.accountImportedGameGif('mine', 't'), '/api/v1/account/imported-games/mine/gif/'],
  ];
  for (const [call, path] of cases) {
    const result = await call();
    const sent = wire.calls.at(-1);
    assert.equal(sent.url.pathname + sent.url.search, path);
    assert.equal(new Headers(sent.headers).get('Authorization'), 'Bearer t');
    assert.equal(new Headers(sent.headers).get('Accept'), 'image/gif');
    assert.equal(result.ok, true);
    assert.deepEqual(result.bytes, GIF);
    assert.equal(result.contentType, 'image/gif');
    assert.equal(result.filename, 'game.gif');
  }
});

test('a failed download returns the JSON error and Retry-After without bytes', async () => {
  const error = { error: { code: 'rate_limited', message: 'Slow down.' } };
  const client = new ApplicationClient({ fetch: async () => Response.json(error, { status: 429, headers: { 'Retry-After': '60' } }) });
  const result = await client.publicGameGif('g1', 't');
  assert.equal(result.ok, false);
  assert.equal(result.status, 429);
  assert.equal(result.retryAfter, '60');
  assert.equal(result.bytes.byteLength, 0);
  assert.deepEqual(result.error, error);
});

test('notification and notebook calls use exact methods, paths and bodies', async () => {
  const wire = recorder(() => Response.json({ ok: true }));
  const client = new ApplicationClient({ fetch: wire.fetch });
  const cases = [
    [() => client.accountNotifications('t', 2, 20), 'GET', '/api/v1/account/notifications/?page=2' + String.fromCharCode(38) + 'page_size=20', undefined],
    [() => client.accountMarkNotificationRead(5, 't'), 'POST', '/api/v1/account/notifications/5/read/', undefined],
    [() => client.accountMarkAllNotificationsRead('t'), 'POST', '/api/v1/account/notifications/read-all/', undefined],
    [() => client.accountDismissNotification(5, 't'), 'DELETE', '/api/v1/account/notifications/5/', undefined],
    [() => client.accountNotificationPreferences('t'), 'GET', '/api/v1/account/notifications/preferences/', undefined],
    [() => client.accountUpdateNotificationPreferences({ topics: { new_games: false }, soundEnabled: true }, 't'),
      'PATCH', '/api/v1/account/notifications/preferences/', { topics: { new_games: false }, sound_enabled: true }],
    [() => client.accountNotebooks('t'), 'GET', '/api/v1/account/notebooks/', undefined],
    [() => client.accountNotebook(NOTEBOOK.toUpperCase(), 't'), 'GET', `/api/v1/account/notebooks/${NOTEBOOK}/`, undefined],
  ];
  for (const [call, method, path, body] of cases) {
    assert.equal((await call()).data.ok, true);
    const sent = wire.calls.at(-1);
    assert.equal(sent.method, method);
    assert.equal(sent.url.pathname + sent.url.search, path);
    assert.equal(new Headers(sent.headers).get('Authorization'), 'Bearer t');
    assert.deepEqual(sent.body === undefined ? undefined : JSON.parse(sent.body), body);
  }
});

test('notebook exports download chapter PGN and optionally encrypted files', async () => {
  const wire = recorder(() => new Response('1. e4 *', { headers: {
    'Content-Type': 'application/x-chess-pgn', 'Content-Disposition': 'attachment; filename="line.pgn"' } }));
  const client = new ApplicationClient({ fetch: wire.fetch });
  const chapter = await client.accountNotebookChapterPgn(NOTEBOOK, 9, 't');
  assert.equal(wire.calls.at(-1).url.pathname, `/api/v1/account/notebooks/${NOTEBOOK}/chapters/9/pgn/`);
  assert.equal(new TextDecoder().decode(chapter.bytes), '1. e4 *');
  assert.equal(chapter.filename, 'line.pgn');
  await client.accountNotebookFile(NOTEBOOK, 't');
  assert.equal(wire.calls.at(-1).method, 'GET');
  await client.accountNotebookFile(NOTEBOOK, 't', 'secret');
  const sent = wire.calls.at(-1);
  assert.equal(sent.method, 'POST');
  assert.equal(sent.url.pathname, `/api/v1/account/notebooks/${NOTEBOOK}/file/`);
  assert.deepEqual(JSON.parse(sent.body), { password: 'secret' });
});

test('bearers reach only GIF routes among public paths, and unsafe arguments never send', async () => {
  let calls = 0;
  const client = new ApplicationClient({ fetch: async () => { calls++; return Response.json({}); } });
  for (const path of ['/api/v1/public/games/g1/', '/api/v1/public/games/g1/pgn/', '/api/v1/public/games/g1/gif/extra/',
    '/api/v1/public/imported-games/ann/g1/']) {
    await assert.rejects(async () => client.download({ path, token: 't' }), { code: 'unsafe_credentials' });
  }
  const unsafe = [
    () => client.publicGameGif('../me', 't'), () => client.publicGameGif('g1', 't', 'left'),
    () => client.publicImportedGameGif('..', 'g1', 't'), () => client.publicImportedGameGif('a/b', 'g1', 't'),
    () => client.accountMarkNotificationRead(0, 't'), () => client.accountDismissNotification('5', 't'),
    () => client.accountUpdateNotificationPreferences({}, 't'),
    () => client.accountUpdateNotificationPreferences({ topics: { new_games: 'no' } }, 't'),
    () => client.accountNotebook('not-a-uuid', 't'), () => client.accountNotebookChapterPgn(NOTEBOOK, 0, 't'),
    () => client.accountNotebookFile(NOTEBOOK, 't', ''),
  ];
  for (const call of unsafe) await assert.rejects(async () => call());
  assert.equal(calls, 0);
});

test('public imported games are public reads by username and slug', async () => {
  const wire = recorder(() => Response.json({ token: 'g1', username: 'ann.lee+1' }));
  const client = new ClassicChessClient({ fetch: wire.fetch });
  assert.equal((await client.publicImportedGame('ann.lee+1', 'g1')).username, 'ann.lee+1');
  assert.equal(wire.calls.at(-1).url.pathname, '/api/v1/public/imported-games/ann.lee+1/g1/');
  assert.equal(new Headers(wire.calls.at(-1).headers).has('Authorization'), false);
  await client.publicImportedPgn('ann', 'g1');
  assert.equal(wire.calls.at(-1).url.pathname, '/api/v1/public/imported-games/ann/g1/pgn/');
  assert.throws(() => client.publicImportedGame('..', 'g1'), { code: 'invalid_identifier' });
  assert.throws(() => client.publicImportedPgn('ann', '../me'), { code: 'invalid_identifier' });
});

test('Gym requests use exact methods, paths and bodies', async () => {
  const wire = recorder(() => Response.json({ ok: true }));
  const client = new ApplicationClient({ fetch: wire.fetch });
  const game = '/api/v1/account/gym/games/7/';
  const newGame = '/api/v1/account/gym/bots/morphy/games/';
  const cases = [
    [() => client.accountGym('t'), 'GET', '/api/v1/account/gym/?page_size=20', undefined],
    [() => client.accountGymGames('t', 2, 10), 'GET', '/api/v1/account/gym/games/?page=2&page_size=10', undefined],
    [() => client.accountGymGames('t', 1, 20, 'others'), 'GET', '/api/v1/account/gym/games/?page=1&page_size=20&player=others', undefined],
    [() => client.accountGymNewGame('morphy', 't'), 'POST', newGame, { color: 'white', time: 'unlimited' }],
    [() => client.accountGymNewGame('morphy', 't', { color: 'random', time: '3+0' }), 'POST', newGame, { color: 'random', time: '3+0' }],
    [() => client.accountGymNewGame('morphy', 't', { time: 'custom', minutes: 2, increment: 1 }), 'POST', newGame,
      { color: 'white', time: 'custom', minutes: 2, increment: 1 }],
    [() => client.accountGymGame(7, 't'), 'GET', game, undefined],
    [() => client.accountGymDeleteGame(7, 't'), 'DELETE', game, undefined],
    [() => client.accountGymMove(7, 'e7e8q', 0, 't'), 'POST', `${game}move/`, { move: 'e7e8q', ply: 0 }],
    [() => client.accountGymBotMove(7, 1, 't'), 'POST', `${game}bot-move/`, { ply: 1 }],
    [() => client.accountGymResign(7, 't'), 'POST', `${game}resign/`, undefined],
    [() => client.accountGymTakeBack(7, 't'), 'POST', `${game}takeback/`, undefined],
    [() => client.accountGymClock(7, 't'), 'POST', `${game}clock/`, undefined],
    [() => client.accountGymAbort(7, 't'), 'POST', `${game}abort/`, undefined],
  ];
  for (const [call, method, path, body] of cases) {
    assert.equal((await call()).data.ok, true);
    const sent = wire.calls.at(-1);
    assert.equal(sent.method, method);
    assert.equal(sent.url.pathname + sent.url.search, path);
    assert.equal(new Headers(sent.headers).get('Authorization'), 'Bearer t');
    assert.deepEqual(sent.body === undefined || sent.body === null ? undefined : JSON.parse(sent.body), body);
  }
});

test('Gym PGN downloads, and a busy engine keeps its Retry-After without an automatic retry', async () => {
  const pgn = recorder(() => new Response('1. e4 *', { headers: {
    'Content-Type': 'application/x-chess-pgn', 'Content-Disposition': 'attachment; filename="gym.pgn"' } }));
  const download = await new ApplicationClient({ fetch: pgn.fetch }).accountGymGamePgn(7, 't');
  assert.equal(pgn.calls.at(-1).url.pathname, '/api/v1/account/gym/games/7/pgn/');
  assert.equal(new TextDecoder().decode(download.bytes), '1. e4 *');
  assert.equal(download.filename, 'gym.pgn');
  const busy = recorder(() => Response.json({ error: { code: 'capacity_exhausted', message: 'Busy.' } },
    { status: 429, headers: { 'Retry-After': '1' } }));
  const reply = await new ApplicationClient({ fetch: busy.fetch }).accountGymBotMove(7, 1, 't');
  assert.equal(busy.calls.length, 1);
  assert.equal(reply.status, 429);
  assert.equal(reply.retryAfter, '1');
  assert.equal(reply.data.error.code, 'capacity_exhausted');
});

test('Gym helpers reject invalid arguments before sending', async () => {
  let calls = 0;
  const client = new ApplicationClient({ fetch: async () => { calls++; return Response.json({}); } });
  const invalid = [
    () => client.accountGym('t', 101), () => client.accountGymGames('t', 1, 20, 'everyone'),
    () => client.accountGymGames('t', 0), () => client.accountGymNewGame('../me', 't'),
    () => client.accountGymNewGame('morphy', 't', { color: 'green' }), () => client.accountGymNewGame('morphy', 't', { time: '' }),
    () => client.accountGymNewGame('morphy', 't', { time: 'custom', minutes: 0, increment: 0 }),
    () => client.accountGymNewGame('morphy', 't', { time: 'custom', minutes: 1.5, increment: 0 }),
    () => client.accountGymNewGame('morphy', 't', { time: '3+0', minutes: 3 }),
    () => client.accountGymGame(0, 't'), () => client.accountGymGame('7', 't'),
    () => client.accountGymMove(7, 'e2-e4', 0, 't'), () => client.accountGymMove(7, 'e2e4', -1, 't'),
    () => client.accountGymBotMove(7, true, 't'), () => client.accountGymAbort(-3, 't'),
  ];
  for (const call of invalid) await assert.rejects(async () => call());
  assert.equal(calls, 0);
});
