import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ApplicationClient } from '../dist/esm/index.js';
import type { ApplicationResponse } from '../dist/esm/index.js';

const NOTEBOOK = '0f8fad5b-d9cb-469f-a165-70867728950e';
const NB = `/api/v1/account/notebooks/${NOTEBOOK}/`;

// Arguments cast `as never` are ones a JavaScript caller can pass despite the
// TypeScript signatures; the SDK must still reject them before network I/O.

function recorder(reply: () => Response) {
  const calls: Array<RequestInit & { url: URL }> = [];
  const fetch = async (url: string | URL | Request, init?: RequestInit) => { calls.push({ url: new URL(url as URL), ...init }); return reply(); };
  return { calls, fetch };
}

// The fake server answers every request with `{"ok": true}`, whatever the route's schema.
type RequestCase = [() => Promise<ApplicationResponse<unknown>>, string, string, unknown];

async function assertRequests(wire: ReturnType<typeof recorder>, cases: RequestCase[]) {
  for (const [call, method, path, body] of cases) {
    assert.equal(((await call()).data as { ok: unknown }).ok, true);
    const sent = wire.calls.at(-1)!;
    assert.equal(`${sent.method} ${sent.url.pathname + sent.url.search}`, `${method} ${path}`);
    assert.equal(new Headers(sent.headers).get('Authorization'), 'Bearer t');
    assert.deepEqual(sent.body === undefined || sent.body === null ? undefined : JSON.parse(sent.body as string), body);
  }
}

test('preference, library, import and device-session calls use exact methods, paths and wire bodies', async () => {
  const wire = recorder(() => Response.json({ ok: true }));
  const client = new ApplicationClient({ fetch: wire.fetch });
  const collection = '/api/v1/account/collections/7/';
  await assertRequests(wire, [
    [() => client.accountPreferences('t'), 'GET', '/api/v1/account/preferences/', undefined],
    [() => client.accountUpdatePreferences({ board_theme: 'green', engine_lines: 3, piece_set: undefined }, 't'),
      'PATCH', '/api/v1/account/preferences/', { board_theme: 'green', engine_lines: 3 }],
    [() => client.accountGameLibrary('tal-vs-larsen', 't'), 'GET', '/api/v1/account/games/tal-vs-larsen/library/', undefined],
    [() => client.accountTogglePlayerBookmark('mikhail-tal', 't'), 'POST', '/api/v1/account/players/mikhail-tal/bookmark/', undefined],
    [() => client.accountImportedGames('t'), 'GET', '/api/v1/account/imported-games/?page=1&page_size=50', undefined],
    [() => client.accountImportedGames('t', { query: 'Tal Larsen', source: 'lichess', sort: 'date_asc', page: 2, pageSize: 10 }),
      'GET', '/api/v1/account/imported-games/?page=2&page_size=10&q=Tal+Larsen&source=lichess&sort=date_asc', undefined],
    [() => client.accountImportedGame('mine', 't'), 'GET', '/api/v1/account/imported-games/mine/', undefined],
    [() => client.accountImportGame({ pgn: '1. e4 *', visibility: 'public' }, 't'), 'POST', '/api/v1/account/imported-games/',
      { pgn: '1. e4 *', visibility: 'public' }],
    [() => client.accountImportGame({ source: 'lichess', remoteUrl: 'https://lichess.org/abcdefgh' }, 't'), 'POST',
      '/api/v1/account/imported-games/', { source: 'lichess', remote_url: 'https://lichess.org/abcdefgh' }],
    [() => client.accountCollectionGames(7, 't', { sort: 'manual', query: 'Tal', page: 2, pageSize: 25 }), 'GET',
      `${collection}?page=2&page_size=25&sort=manual&q=Tal`, undefined],
    [() => client.accountUpdateCollection(7, { name: 'Plan', isPlan: true }, 't'), 'PATCH', collection, { name: 'Plan', is_plan: true }],
    [() => client.accountUpdateCollectionItem(7, 3, { note: 'Why', studied: true }, 't'), 'PATCH', `${collection}items/3/`,
      { note: 'Why', studied: true }],
    [() => client.accountRemoveCollectionItem(7, 3, 't'), 'DELETE', `${collection}items/3/`, undefined],
    [() => client.accountRemoveCollectionGame(7, 'tal-vs-larsen', 't'), 'DELETE', `${collection}games/tal-vs-larsen/`, undefined],
    [() => client.accountCreatePlan({ name: 'Tal', idempotencyKey: 'k1', items: [{ game: 'g1', note: 'n' }, { game: 'g2' }] }, 't'),
      'POST', '/api/v1/account/plans/', { name: 'Tal', idempotency_key: 'k1', items: [{ game: 'g1', note: 'n' }, { game: 'g2' }] }],
    [() => client.accountReorderCollection(7, [3, 1, 2], 't'), 'PUT', `${collection}reorder/`, { item_ids: [3, 1, 2] }],
    [() => client.accountPlanProgress(7, 't'), 'GET', `${collection}progress/?page=1&page_size=100`, undefined],
    [() => client.mobileSignOut('t'), 'POST', '/api/v1/account/mobile/logout/', undefined],
    [() => client.mobileSessions('t'), 'GET', '/api/v1/account/mobile/sessions/', undefined],
    [() => client.mobileRevokeSession(4, 't'), 'POST', '/api/v1/account/mobile/sessions/4/revoke/', undefined],
    [() => client.mobileRevokeAllSessions('t'), 'POST', '/api/v1/account/mobile/sessions/revoke-all/', undefined],
    [() => client.mobileSettings('t'), 'GET', '/api/v1/account/mobile/settings/', undefined],
    [() => client.mobileUpdateSettings({ cast_cc_emails: ['coach@example.test'] }, 't'), 'POST', '/api/v1/account/mobile/settings/',
      { cast_cc_emails: ['coach@example.test'] }],
    [() => client.accountGymNewGame('morphy', 't', { version: 'v4' }), 'POST', '/api/v1/account/gym/bots/morphy/games/',
      { color: 'white', time: 'unlimited', version: 'v4' }],
  ]);
});

test('Notebook write and manage calls use exact methods, paths and wire bodies', async () => {
  const wire = recorder(() => Response.json({ ok: true }));
  const client = new ApplicationClient({ fetch: wire.fetch });
  const fen = '8/8/8/8/8/2k5/2P5/2K5 w - - 0 1';
  await assertRequests(wire, [
    [() => client.accountCreateNotebook({ title: 'Najdorf', visibility: 'unlisted', chapterTitle: 'Main', game: 'tal-vs-larsen' }, 't'),
      'POST', '/api/v1/account/notebooks/', { title: 'Najdorf', visibility: 'unlisted', chapter_title: 'Main', game: 'tal-vs-larsen' }],
    [() => client.accountRenameNotebook(NOTEBOOK.toUpperCase(), 'New', 't'), 'PATCH', NB, { title: 'New' }],
    [() => client.accountDeleteNotebook(NOTEBOOK, 't'), 'DELETE', NB, undefined],
    [() => client.accountNotebookSettings(NOTEBOOK, 't'), 'GET', `${NB}settings/`, undefined],
    [() => client.accountUpdateNotebookSettings(NOTEBOOK, { allowPublicExports: false, description: '' }, 't'), 'PATCH',
      `${NB}settings/`, { allow_public_exports: false, description: '' }],
    [() => client.accountSetNotebookCollaborator(NOTEBOOK, { username: 'ann', role: 'editor', canPresentLive: true }, 't'), 'POST',
      `${NB}collaborators/`, { username: 'ann', role: 'editor', can_present_live: true }],
    [() => client.accountRemoveNotebookCollaborator(NOTEBOOK, 5, 't'), 'DELETE', `${NB}collaborators/5/`, undefined],
    [() => client.accountLeaveNotebook(NOTEBOOK, 't'), 'DELETE', `${NB}membership/`, undefined],
    [() => client.accountNotebookShare(NOTEBOOK, 't'), 'GET', `${NB}share/`, undefined],
    [() => client.accountCreateNotebookShare(NOTEBOOK, 't'), 'PUT', `${NB}share/`, undefined],
    [() => client.accountRevokeNotebookShare(NOTEBOOK, 't'), 'DELETE', `${NB}share/`, undefined],
    [() => client.accountCreateNotebookSection(NOTEBOOK, { title: 'Ideas', parentId: 2 }, 't'), 'POST', `${NB}sections/`,
      { title: 'Ideas', parent_id: 2 }],
    [() => client.accountRenameNotebookSection(NOTEBOOK, 2, 'Plans', 't'), 'PATCH', `${NB}sections/2/`, { title: 'Plans' }],
    [() => client.accountDeleteNotebookSection(NOTEBOOK, 2, 't'), 'DELETE', `${NB}sections/2/`, undefined],
    [() => client.accountMoveNotebookSection(NOTEBOOK, 2, { parentId: null, beforeSectionId: 4 }, 't'), 'POST', `${NB}sections/2/move/`,
      { parent_id: null, before_section_id: 4 }],
    [() => client.accountCreateNotebookChapter(NOTEBOOK, { sectionId: 2, initialPosition: fen }, 't'), 'POST', `${NB}chapters/`,
      { section_id: 2, initial_position: fen }],
    [() => client.accountNotebookChapter(NOTEBOOK, 9, 't'), 'GET', `${NB}chapters/9/`, undefined],
    [() => client.accountSaveNotebookChapter(NOTEBOOK, 9, { pgn: '1. e4 *', contentVersion: 3 }, 't'), 'PUT', `${NB}chapters/9/`,
      { pgn: '1. e4 *', content_version: 3 }],
    [() => client.accountRenameNotebookChapter(NOTEBOOK, 9, 'Line', 't'), 'PATCH', `${NB}chapters/9/`, { title: 'Line' }],
    [() => client.accountDeleteNotebookChapter(NOTEBOOK, 9, 't'), 'DELETE', `${NB}chapters/9/`, undefined],
    [() => client.accountMoveNotebookChapter(NOTEBOOK, 9, { sectionId: 2 }, 't'), 'POST', `${NB}chapters/9/move/`, { section_id: 2 }],
    [() => client.accountNotebookChapterShare(NOTEBOOK, 9, 't'), 'GET', `${NB}chapters/9/share/`, undefined],
    [() => client.accountCreateNotebookChapterShare(NOTEBOOK, 9, 't'), 'PUT', `${NB}chapters/9/share/`, undefined],
    [() => client.accountRevokeNotebookChapterShare(NOTEBOOK, 9, 't'), 'DELETE', `${NB}chapters/9/share/`, undefined],
  ]);
});

test('a chapter save marks only a 409 chapter_conflict as a conflict and never retries it', async () => {
  const replies = [
    Response.json({ chapter: { id: 9, content_version: 4 }, pgn: '1. e4 *' }),
    Response.json({ error: { code: 'chapter_conflict', message: 'The chapter changed.' } }, { status: 409 }),
    Response.json({ error: { code: 'invalid_request', message: 'Bad PGN.' } }, { status: 400 }),
  ];
  const wire = recorder(() => replies.shift()!);
  const client = new ApplicationClient({ fetch: wire.fetch });
  const edit = { pgn: '1. e4 *', contentVersion: 3 };
  const saved = await client.accountSaveNotebookChapter(NOTEBOOK, 9, edit, 't');
  assert.deepEqual([saved.ok, saved.status, saved.conflict, saved.data.chapter.content_version], [true, 200, false, 4]);
  const conflict = await client.accountSaveNotebookChapter(NOTEBOOK, 9, edit, 't');
  assert.deepEqual([conflict.ok, conflict.status, conflict.conflict], [false, 409, true]);
  const refused = await client.accountSaveNotebookChapter(NOTEBOOK, 9, edit, 't');
  assert.deepEqual([refused.ok, refused.status, refused.conflict], [false, 400, false]);
  assert.equal(wire.calls.length, 3);
});

test('device sign-in sends the password only over HTTPS or loopback, and public device reads carry no bearer', async () => {
  const wire = recorder(() => Response.json({ ok: true }, { status: 201 }));
  const secure = new ApplicationClient({ fetch: wire.fetch });
  const login = { username: 'ann', password: 'test-only-password', twoFactorCode: '123456', deviceName: 'Pixel' };
  assert.equal((await secure.mobileSignIn(login)).status, 201);
  await new ApplicationClient({ baseUrl: 'http://127.0.0.1:8123', fetch: wire.fetch }).mobileSignIn(login);
  await secure.mobileHome();
  await secure.mobileAndroidRelease();
  assert.deepEqual(wire.calls.map(c => `${c.method ?? 'GET'} ${c.url.href}`), [
    'POST https://classicchess.com/api/v1/account/mobile/login/', 'POST http://127.0.0.1:8123/api/v1/account/mobile/login/',
    'GET https://classicchess.com/api/v1/mobile/home/', 'GET https://classicchess.com/api/v1/mobile/android/release/',
  ]);
  assert.deepEqual(JSON.parse(wire.calls[0]!.body as string),
    { username: 'ann', password: 'test-only-password', two_factor_code: '123456', device_name: 'Pixel' });
  assert.ok(wire.calls.every(c => !new Headers(c.headers).has('Authorization')));
  const plain = new ApplicationClient({ baseUrl: 'http://classicchess.example', fetch: wire.fetch });
  await assert.rejects(async () => plain.mobileSignIn(login), { code: 'unsafe_credentials' });
  assert.equal(wire.calls.length, 4);
});

test('account, device and Notebook helpers reject invalid arguments before network I/O', async () => {
  let calls = 0;
  const client = new ApplicationClient({ fetch: async () => { calls++; return Response.json({}); } });
  const invalid = [
    () => client.accountImportedGames('t', { source: 'github' as never }), () => client.accountImportedGames('t', { query: 'x'.repeat(121) }),
    () => client.accountImportedGames('t', { pageSize: 101 }), () => client.accountImportGame({}, 't'),
    () => client.accountImportGame({ source: 'lichess' }, 't'),
    () => client.accountImportGame({ pgn: '1. e4 *', remote_url: 'https://lichess.org/abcdefgh' } as never, 't'),
    () => client.accountUpdatePreferences({}, 't'), () => client.accountUpdatePreferences({ board_theme: undefined }, 't'),
    () => client.accountGameLibrary('../me', 't'), () => client.accountTogglePlayerBookmark('a/b', 't'),
    () => client.accountCollectionGames(7, 't', { sort: 'random' as never }), () => client.accountUpdateCollection(7, {}, 't'),
    () => client.accountUpdateCollection(7, { name: 'Plan', is_plan: true } as never, 't'),
    () => client.accountUpdateCollectionItem(7, 0, { studied: true }, 't'),
    () => client.accountUpdateCollectionItem(7, 3, { note: 'x'.repeat(2001) }, 't'),
    () => client.accountRemoveCollectionGame(7, '../me', 't'),
    () => client.accountCreatePlan({ name: 'P', idempotencyKey: 'k', items: [] }, 't'),
    () => client.accountCreatePlan({ name: 'P', idempotencyKey: 'k', items: [{ note: 'n' }] } as never, 't'),
    () => client.accountCreatePlan({ name: 'P', items: [{ game: 'g' }] } as never, 't'),
    () => client.accountReorderCollection(7, [1, 0], 't'), () => client.mobileRevokeSession(0, 't'),
    () => client.mobileUpdateSettings({}, 't'), () => client.mobileSignIn({ username: 'ann' } as never),
    () => client.accountGymNewGame('morphy', 't', { version: '' }),
    () => client.accountRenameNotebook('not-a-uuid', 'x', 't'), () => client.accountRenameNotebook(NOTEBOOK, '', 't'),
    () => client.accountRenameNotebook(NOTEBOOK, 'x'.repeat(161), 't'),
    () => client.accountCreateNotebook({ title: 'x', initialPosition: '8/8', game: 'g' }, 't'),
    () => client.accountCreateNotebook({} as never, 't'),
    () => client.accountUpdateNotebookSettings(NOTEBOOK, { visibility: 'secret' as never }, 't'),
    () => client.accountUpdateNotebookSettings(NOTEBOOK, {}, 't'),
    () => client.accountSetNotebookCollaborator(NOTEBOOK, { username: 'ann', role: 'owner' as never }, 't'),
    () => client.accountMoveNotebookSection(NOTEBOOK, 2, { parentId: 0 }, 't'),
    () => client.accountMoveNotebookChapter(NOTEBOOK, 9, { beforeChapterId: '4' as never }, 't'),
    () => client.accountSaveNotebookChapter(NOTEBOOK, 9, { pgn: '1. e4 *', contentVersion: 0 }, 't'),
    () => client.accountSaveNotebookChapter(NOTEBOOK, 0, { pgn: '1. e4 *', contentVersion: 1 }, 't'),
    () => client.accountNotebookChapterShare(NOTEBOOK, -1, 't'),
  ];
  for (const call of invalid) await assert.rejects(async () => call());
  assert.equal(calls, 0);
});
