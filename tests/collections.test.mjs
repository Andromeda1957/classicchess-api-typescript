import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ApplicationClient } from '../dist/esm/index.js';

test('collection helpers encode names and retain batch controls, errors and credentials', async () => {
  const calls = [];
  const payload = { matched: 2, added: 1, has_more: true, next_after_game_id: 87 };
  const api = new ApplicationClient({ fetch: async (url, init) => {
    calls.push({ url: new URL(url), init }); return Response.json(payload);
  } });
  assert.deepEqual((await api.accountFindCollection('  1920 & café?  ', 'fixture')).data, payload);
  assert.equal(calls.at(-1).url.searchParams.get('name'), '1920 & café?');
  await api.accountDeleteCollection(12, 'fixture');
  assert.equal(calls.at(-1).url.pathname, '/api/v1/account/collections/12/');
  assert.equal(calls.at(-1).init.method, 'DELETE');
  const filters = [{ players: ['alekhine'], since: 1920, until: 1920 }, { notable: false, annotationAuthor: 'Réti' }];
  for (const [afterGameId, dryRun] of [[0, true], [87, false]]) {
    const response = await api.accountAddCuratedGames({ collectionId: 12, filters,
      exclude: [{ events: ['london-1922'] }], batchSize: 1, afterGameId, dryRun }, 'fixture');
    assert.deepEqual(response.data, payload);
    const { url, init } = calls.at(-1);
    assert.equal(url.pathname, '/api/v1/account/collections/import/');
    assert.equal(new Headers(init.headers).get('Authorization'), 'Bearer fixture');
    assert.deepEqual(JSON.parse(init.body), { source: 'curated_games', collection_id: 12,
      filters: [filters[0], { notable: false, annotation_author: 'Réti' }],
      exclude: [{ events: ['london-1922'] }], batch_size: 1, after_game_id: afterGameId, dry_run: dryRun });
  }
  assert.equal(calls.length, 4);
  for (const id of [0, -1, 1.5, NaN]) assert.throws(() => api.accountDeleteCollection(id, 'fixture'), { code: 'invalid_request' });
  for (const name of [' ', 'x'.repeat(121)]) assert.throws(() => api.accountFindCollection(name, 'fixture'), { code: 'invalid_request' });
  for (const controls of [{ batchSize: 0 }, { batchSize: 1001 }, { afterGameId: -1 }, { dryRun: 'false' }]) {
    assert.throws(() => api.accountAddCuratedGames({ collectionId: 12, filters, ...controls }, 'fixture'), { code: 'invalid_request' });
  }
  assert.equal(calls.length, 4);
  // JavaScript callers can misspell filter keys despite the TypeScript interface.
  // Never discard such a key and send a broader selection to the server.
  assert.throws(() => api.accountAddCuratedGames({ collectionId: 12,
    filters: [{ since: 1920, annotation_author: 'Réti' }] }, 'fixture'), { code: 'invalid_request' });
  for (const controls of [{ exlude: [{ notable: true }] }, { dryRun: null }, { exclude: null }]) {
    assert.throws(() => api.accountAddCuratedGames({ collectionId: 12, filters, ...controls }, 'fixture'), { code: 'invalid_request' });
  }
  assert.equal(calls.length, 4);
  const denied = new ApplicationClient({ fetch: async () => Response.json({ error: { code: 'insufficient_scope' } }, { status: 403 }) });
  assert.equal((await denied.accountDeleteCollection(12, 'fixture')).status, 403);
});
