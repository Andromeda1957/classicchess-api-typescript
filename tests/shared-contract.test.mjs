import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { ClassicChessClient } from '../dist/esm/index.js';

const publicFixtures = new URL('../contracts/client-fixtures.json', import.meta.url);
const fixtures = JSON.parse(readFileSync(existsSync(publicFixtures) ? publicFixtures :
  new URL('../../../docs/api/client-fixtures.json', import.meta.url), 'utf8'));

function wire(replies) {
  let requests = 0;
  const api = new ClassicChessClient({ fetch: async () => {
    const reply = replies[requests++];
    assert.ok(reply, 'Client requested an unexpected page');
    return reply;
  } });
  return { api, requests: () => requests };
}

test('shared growing pagination sequences reach every page', async () => {
  for (const entry of fixtures.page_sequences) {
    const { api, requests } = wire(entry.pages.map(page => Response.json(page)));
    const tokens = [];
    for await (const game of api.iterateMasterGames({ query: 'Tal', pageSize: 1 })) tokens.push(game.token);
    assert.deepEqual(tokens, entry.expected_tokens, entry.name);
    assert.equal(requests(), entry.pages.length);
  }
});

test('shared missing data and malformed success responses fail consistently', async () => {
  for (const entry of fixtures.invalid_pages) {
    const { api } = wire([new Response(entry.body)]);
    await assert.rejects(async () => {
      for await (const game of api.iterateMasterGames({ query: 'Tal' })) assert.fail(`Unexpected game ${game.token}`);
    }, { code: entry.code });
  }
});

test('shared HTTP errors retain status and Retry-After', async () => {
  for (const entry of fixtures.http_errors) {
    const { api } = wire([new Response(entry.body, { status: entry.status,
      headers: entry.retry_after === null ? {} : { 'Retry-After': entry.retry_after } })]);
    await assert.rejects(api.masterGames({ query: 'Tal' }), {
      code: entry.code, status: entry.status, retryAfter: entry.retry_after,
    });
  }
});

test('stopping or cancelling prevents the next page', async () => {
  const { api, requests } = wire([Response.json(fixtures.page_sequences[0].pages[0])]);
  let count = 0;
  for await (const game of api.iterateMasterGames({ query: 'Tal' })) {
    assert.equal(game.token, fixtures.page_sequences[0].expected_tokens[0]);
    if (++count === fixtures.stop_after_first.items) break;
  }
  assert.equal(requests(), fixtures.stop_after_first.requests);
  const controller = new AbortController();
  let started;
  const inFlight = new Promise(resolve => { started = resolve; });
  const cancellable = new ClassicChessClient({ fetch: (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    started();
  }) });
  const request = cancellable.masterGames({ query: 'Tal' }, { signal: controller.signal });
  await inFlight;
  controller.abort();
  await assert.rejects(request, { code: 'aborted' });
});
