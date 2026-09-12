# Classic Chess API client

Public archive and application API clients for Node.js 22+ and Electron's main process.
No runtime dependencies; public reads need no API key. Supports ES modules and CommonJS. This package is
prepared locally as `@classicchess/api`; it has not been published to npm.

MIT licensed; see [LICENSE](LICENSE).
For Android, use the [Kotlin SDK](https://github.com/Andromeda1957/classicchess-api-kotlin).
See the [Python SDK](https://github.com/Andromeda1957/classicchess-api-python)
and [API reference and client comparison](https://classicchess.com/api/#sdk-clients).

## Install the local package

From this directory in the repository:

```sh
python3 -m pip install PyYAML==6.0.3
npm ci
npm test
mkdir -p artifacts
npm pack --pack-destination artifacts
```

In your app, install the resulting file (use its actual absolute path):

```sh
npm install /path/to/classicchess-api-0.1.0.tgz
```

## See what is available

```js
import { ClassicChessClient } from '@classicchess/api';

const api = new ClassicChessClient({ userAgent: 'my-chess-app/1.0' });
console.log(await api.playerNames()); // all curated player names
console.log(await api.eventNames());  // all tournament and match names
console.log(await api.bookTitles());  // all annotated book titles

const { results: players } = await api.publicPlayers();
const { results: events } = await api.publicEvents();
const { results: books } = await api.annotatedBooks();
// These catalogs are complete, unpaginated lists with slugs and metadata.
```

CommonJS uses the same API:

```js
const { ClassicChessClient } = require('@classicchess/api');
```

For a development server:

```js
const api = new ClassicChessClient({ baseUrl: 'http://127.0.0.1:8000' });
```

## Profiles, biographies, notable games and PGN

Always use the exact returned slug; do not derive it from a player's name.

```js
const { results } = await api.publicPlayers('Tal');
const player = results.find(player => player.name === 'Mikhail Tal');
if (player) {
  const profile = await api.publicPlayer(player.slug);
  const { bio } = await api.publicPlayerBio(player.slug);
  console.log(profile.player.name, bio?.lede ?? 'Biography unavailable');
  const notable = await api.publicNotableGames(player.slug);
  for (const entry of notable.results) {
    console.log(entry.position, entry.title, entry.annotation);
    const pgn = await api.publicPgn(entry.game.token);
    console.log(pgn);
  }
}
```

`bio` is null when unavailable. Notable games are a complete list in curated
order, and can be empty. Biography and annotation prose is text, not trusted
HTML. Retain sources and annotation license metadata in your app.

## Retrieve games without truncating an archive

`publicGames()` and `annotatedGames()` return **one page**. The async iterators
fetch pages sequentially as consumed. They stop when `next` is null. Break out
of the loop or supply `limit` to stop early without fetching another page.

```js
const catalog = await api.publicPlayers();
const player = catalog.results[0];
if (!player) throw new Error('No curated players available');
const books = (await api.annotatedBooks()).results;
const page = await api.publicGames({ archivePlayer: player.slug, pageSize: 20 });
console.log(page.count, page.next, page.results);

for await (const game of api.iteratePublicGames({ archivePlayer: player.slug })) {
  console.log(game.token, game.white, game.black);
}

if (books[0]) {
  for await (const game of api.iterateAnnotatedGames(books[0].slug, {}, { limit: 10 })) {
    console.log(game.book.label, game.annotation.license_name);
  }
}
```

| Method | Result |
| --- | --- |
| `discovery()` | API documentation and collection links |
| `publicPlayers(query?)`, `playerNames(query?)` | Complete curated player catalog / names |
| `eventSeries(query?, series?)` | Complete series cards, search results, or series members |
| `publicEvents(query?)`, `eventNames(query?)` | Complete event catalog / names |
| `annotatedBooks()`, `bookTitles()` | Complete annotated book catalog / titles |
| `publicPlayer(slug)` | Full profile in `player` |
| `publicPlayerBio(slug)` | Approved `bio` or null, plus player identity |
| `publicNotableGames(slug)` | Ordered `results` with titles, context and games |
| `publicGames(filters?)`, `iteratePublicGames(filters?, options?)` | One page / async game iterator |
| `publicGame(token)`, `publicPgn(token)` | Game detail / raw PGN text |
| `exportPublicGames(filters?)` | PGN bundle, **at most 300 games** |
| `annotatedGames(bookSlug, page?)`, `iterateAnnotatedGames(bookSlug, page?, options?)` | One book page / async game iterator |
| `annotatedGame(bookSlug, gameSlug)` | Game detail with annotation notes |
| `annotatedPgn(bookSlug, gameSlug?)` | One game's PGN, or the complete book when gameSlug is omitted |

Public filters: `query`, `archivePlayer`, `archiveEvent`, `since`, `until`,
`sort` (`asc`, `desc`, or `event` with `archiveEvent`), `page`, `pageSize` (1–100). Tokens accept canonical
game slugs and legacy `playerSlug/gameSlug` values. Pass tokens, not URLs.
For a complete PGN archive, iterate games and fetch each PGN, or export their
tokens in batches of at most 300. Query exports return only the first 300 matches.

## Search MasterDB

MasterDB is the broader game database, separate from the curated public archives.
Use the opaque MasterDB token returned by search to open a game:

```js
const page = await api.masterGames({ query: 'karpov', page: 1, pageSize: 25 });
console.log(page.count, page.count_is_exact, page.hit_result_limit);
if (page.results[0]) {
  const game = await api.masterGame(page.results[0].token); // includes PGN and mainline
  console.log(game.opening, game.pgn);
  console.log(await api.masterPgn(game.token)); // raw PGN
}
for await (const game of api.iterateMasterGames({ query: 'Kasparov Karpov' }, { limit: 50 })) {
  console.log(game.white, game.black, game.opening);
}
```

Queries require 1–120 characters and page sizes are 1–100. Search results use
lower-bound counts until `count_is_exact` is true; `page_count` can grow as you
page. Iteration follows `next` until null, including when the server's search
result limit is reached. Inspect `hit_result_limit` and refine the query to
reach other matches; iteration does not bypass the server cap.

## Errors and cancellation

Public archive methods accept a final options object with `signal`. Requests time out
after 30 seconds; configure `timeoutMs` and `maxResponseBytes` on the client.
The response limit defaults to 32 MiB and counts decoded UTF-8 bytes.

```js
import { ApiError } from '@classicchess/api';

const controller = new AbortController();
try {
  await api.publicPlayers(undefined, { signal: controller.signal });
} catch (error) {
  if (error instanceof ApiError) {
    console.error(error.status, error.code, error.message, error.retryAfter);
  } else {
    throw error;
  }
}
```

HTTP errors retain the API code and `Retry-After` header (seconds or HTTP date).
Proxy HTML responses also produce structured errors. Transport codes include
`timeout`, `aborted`, `network_error`, `response_too_large`, `invalid_response`
and `unsafe_url`. There are no automatic retries. Honor rate limits and retry
reads with bounded backoff in your application. Iterators reject repeated
pages, links outside the configured collection, and more than `maxPages`
(default 100,000) with an explicit error rather than returning a partial list
as complete.

## Electron

Use the client in the main process, with narrow operations exposed by a
context-isolated preload. [examples/electron](examples/electron) is a runnable
example with sender validation, input validation and serializable API errors.
It uses this same npm package and does not expose generic IPC or arbitrary
network requests to the renderer. Run in that directory after installing this
package's tarball and Electron:

```sh
npm install electron /path/to/classicchess-api-0.1.0.tgz
npx electron main.cjs
```

ClassicChess Notebook bundles this package's source directly into its Electron
main process. Its existing IPC allowlist routes MasterDB search and game detail
through these methods, and its annotated-book catalog uses `annotatedBooks()`.
No SDK runtime or account credentials are exposed to the renderer. The Desktop
SBOM records the bundled client; a separate npm installation is not needed to run
Notebook.

## Application APIs and images

`ApplicationClient` shares the bounded SDK transport and exposes the remaining
JSON APIs: account/login, notebooks, openings, mobile home/release metadata,
Desktop Remote and mobile Cast. Its `request` accepts a relative `/api/v1/` or
`/cast/api/mobile/` path, an optional method/body and an explicit per-request bearer.
Keep credential ownership in the main process; this API is not a renderer bridge.

```js
import { ApplicationClient } from '@classicchess/api';
const appApi = new ApplicationClient();
const opening = await appApi.request({ path: '/api/v1/opening-explorer/?play=e2e4' });
const notebooks = await appApi.request({
  path: '/api/v1/desktop/notebooks/', token: deviceToken,
});
// { ok, status, data, retryAfter }; HTTP errors retain the entire JSON payload.
```

Login, notebook sync, openings and remote operations in ClassicChess Notebook
now use this client through the existing `ApiClient` wrapper. JSON and binary
notebook POST bodies retain their content type and bytes. Empty responses decode
as `{}`. Network errors, invalid JSON, cancellation and response limits throw
`ApiError`; HTTP JSON error responses remain available as `data`.
The body limit is 128 MiB, and individual request deadlines can extend to ten
minutes. Cookies and redirects are disabled; bearers are accepted only on private
API paths over HTTPS (or loopback development). Public archive requests remain
credential-free. Neither client retries mutations automatically.

Portrait URLs already live in `player.portrait.thumbnail` and `.image`. Download
those files through an image loader with memory/disk caching; empty URLs mean no
portrait. Keep resumable APK, CCNB, PDF and media downloads in their existing
bounded download handlers. Encoding image bytes in JSON would duplicate transfer
and cache work. The versioned player-opening endpoint
`/api/v1/opening-explorer/player/` returns rows without website HTML fragments.
`eventSeries()` uses `/api/v1/public/event-series/`; `publicGames` with
`archiveEvent` and `sort: 'event'` preserves curated round order and `event_round`.
These new server features must be deployed before clients that call them.
Cross-origin browser access is not enabled; browser apps should call their backend.

## Maintaining the contract

Response types are generated from the same OpenAPI schemas validated by the
Python/Django API tests. From the repository environment (with PyYAML):

```sh
python3 scripts/generate_types.py
npm run check:contract
npm test
```

The generation check fails if the checked-in types drift. TypeScript types
describe the server contract; ordinary responses are not schema-validated at
runtime. Pagination structure and transport boundaries are checked at runtime.
The package build and tests require only the pinned TypeScript/esbuild tools;
installed apps have no runtime dependencies.

The private development monorepo also runs a Playwright journey for the Electron
example renderer. The public package's `npm test` runs its transport, type and
Electron IPC tests without a browser installation.
