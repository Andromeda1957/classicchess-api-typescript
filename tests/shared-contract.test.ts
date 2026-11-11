import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { ApplicationClient, ClassicChessClient } from '../dist/esm/index.js';

/** The parts of the shared fixtures, also run by the Python and Kotlin SDKs, used here. */
interface ClientFixtures {
  page_sequences: Array<{ name: string; pages: unknown[]; expected_tokens: string[] }>;
  invalid_pages: Array<{ name: string; body: string; code: string }>;
  http_errors: Array<{ name: string; status: number; body: string; retry_after: string | null; code: string }>;
  stop_after_first: { items: number; requests: number };
  imported_game_usernames: {
    max_length: number;
    length_characters: string[];
    accepted: Array<{ username: string; path_segment: string }>;
    rejected: Array<{ username: string }>;
  };
}

const publicFixtures = new URL('../contracts/client-fixtures.json', import.meta.url);
const fixtures = JSON.parse(readFileSync(existsSync(publicFixtures) ? publicFixtures :
  new URL('../../../docs/api/client-fixtures.json', import.meta.url), 'utf8')) as ClientFixtures;

function wire(replies: Response[]) {
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
    const tokens: string[] = [];
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
  const { api, requests } = wire([Response.json(fixtures.page_sequences[0]!.pages[0])]);
  let count = 0;
  for await (const game of api.iterateMasterGames({ query: 'Tal' })) {
    assert.equal(game.token, fixtures.page_sequences[0]!.expected_tokens[0]);
    if (++count === fixtures.stop_after_first.items) break;
  }
  assert.equal(requests(), fixtures.stop_after_first.requests);
  const controller = new AbortController();
  let started!: () => void;
  const inFlight = new Promise<void>(resolve => { started = resolve; });
  const cancellable = new ClassicChessClient({ fetch: (_url, init) => new Promise((_resolve, reject) => {
    const { signal } = init!;
    signal!.addEventListener('abort', () => reject(signal!.reason), { once: true });
    started();
  }) });
  const request = cancellable.masterGames({ query: 'Tal' }, { signal: controller.signal });
  await inFlight;
  controller.abort();
  await assert.rejects(request, { code: 'aborted' });
});

/** The request paths of the three public imported-game reads for one username. */
async function importedGamePaths(username: string) {
  const paths: string[] = [];
  const record = (reply: () => Response) => async (url: string | URL | Request) => {
    paths.push(new URL(url as URL).pathname);
    return reply();
  };
  const api = new ClassicChessClient({ fetch: record(() => Response.json({})) });
  await api.publicImportedGame(username, 'g1');
  await api.publicImportedPgn(username, 'g1');
  const gif = record(() => new Response(new Uint8Array([71, 73, 70]), { headers: { 'Content-Type': 'image/gif' } }));
  await new ApplicationClient({ fetch: gif }).publicImportedGameGif(username, 'g1', 't');
  return paths;
}

test('shared imported-game usernames in any script reach their routes', async () => {
  const usernames = fixtures.imported_game_usernames;
  for (const { username, path_segment } of usernames.accepted) {
    const game = `/api/v1/public/imported-games/${path_segment}/g1/`;
    assert.deepEqual(await importedGamePaths(username), [game, `${game}pgn/`, `${game}gif/`], username);
  }
  for (const character of usernames.length_characters) {
    assert.equal((await importedGamePaths(character.repeat(usernames.max_length))).length, 3, character);
  }
});

test('shared names that are not one server username fail before any request', async () => {
  const usernames = fixtures.imported_game_usernames;
  let calls = 0;
  const fetch = async () => { calls++; return Response.json({}); };
  const api = new ClassicChessClient({ fetch }), application = new ApplicationClient({ fetch });
  const tooLong = usernames.length_characters.map(character => character.repeat(usernames.max_length + 1));
  for (const username of [...usernames.rejected.map(entry => entry.username), ...tooLong]) {
    for (const call of [() => api.publicImportedGame(username, 'g1'), () => api.publicImportedPgn(username, 'g1'),
      () => application.publicImportedGameGif(username, 'g1', 't')]) {
      await assert.rejects(async () => call(), { code: 'invalid_identifier' }, username);
    }
  }
  assert.equal(calls, 0);
});
