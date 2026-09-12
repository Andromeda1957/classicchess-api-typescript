# Classic Chess API client

Public archive and application API clients for Node.js 22+ and Electron's main process.
Read chess games, player biographies, tournaments and annotated books from
[Classic Chess](https://classicchess.com/), search its larger MasterDB game
database, retrieve opening statistics, and call account and application APIs.
No runtime dependencies; public reads need no API key. Supports ES modules and
CommonJS. The package name is `@classicchess/api`; install it from GitHub using
the commands below while npm registry publication is pending.

MIT licensed; see [LICENSE](LICENSE).
For Android, use the [Kotlin SDK](https://github.com/Andromeda1957/classicchess-api-kotlin).
See the [Python SDK](https://github.com/Andromeda1957/classicchess-api-python)
and [API reference and client comparison](https://classicchess.com/api/#sdk-clients).

## Install and run your first example

Install [Node.js 22 or newer](https://nodejs.org/) and [Git](https://git-scm.com/).
Node.js includes npm, the package installer. Open a terminal and run:

```sh
mkdir classicchess-example
cd classicchess-example
npm init -y
npm install git+https://github.com/Andromeda1957/classicchess-api-typescript.git
```

This installs `@classicchess/api` directly from this public repository and builds
it automatically. It has not been published to the npm registry yet.

Create a file named `example.mjs` in that same directory with:

```js
import { ClassicChessClient } from '@classicchess/api';

const api = new ClassicChessClient();
const names = await api.playerNames();
console.log(names.slice(0, 10));
```

Run it with `node example.mjs`. You should see up to ten names from the curated
player archive. This is a public read and requires no account or API token.
The `.mjs` extension tells Node.js that the file uses ES modules. TypeScript
projects can use the same imports with the included type definitions.

For an existing Node.js or Electron app, run the `npm install` command above
from the directory containing that app's `package.json`.

## See what is available

Replace the contents of `example.mjs` with this complete catalog example and
run `node example.mjs` again:

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

The later public API snippets use this `api` client. To try one, keep the import
and client initialization above, then replace the rest of the file with that
snippet. This avoids duplicate variable declarations between examples.

If your app uses CommonJS (`.cjs` files), replace the import line with:

```js
const { ClassicChessClient } = require('@classicchess/api');
```

If you run your own Classic Chess development server on port 8000, replace the
client initialization with:

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
| `pgnTextForGames(pgnUrls)` | Combine returned `api_pgn` URLs into one PGN string, preserving their order |
| `exportPublicGames(filters?)`, `exportMasterGames(filters)` | PGN or NDJSON bundle, **at most 300 games**; `format: "ndjson"` selects JSON lines |
| `masterGames(filters)`, `iterateMasterGames(filters)` | MasterDB page / async iterator |
| `masterGame(token)`, `masterPgn(token)` | MasterDB detail / PGN |
| `players(query, { limit })`, `masterStats({ query })` | Player resolver and full statistics |
| `explorer({ play, fen, moves, topGames, sourceType, sourceKey })`, `explorerSources()` | Opening statistics and available sources |
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
package and Electron. From a fresh terminal:

```sh
git clone https://github.com/Andromeda1957/classicchess-api-typescript.git
cd classicchess-api-typescript/examples/electron
npm install electron git+https://github.com/Andromeda1957/classicchess-api-typescript.git
npx electron main.cjs
```

## Application APIs and images

`ApplicationClient` calls account, notebook, scanner, Desktop Remote and Cast
APIs. Pass a credential explicitly per request. Create a personal API token in
your signed-in Classic Chess profile settings with the scopes described in the
[account API reference](https://classicchess.com/api/#account-api), then set the
`CLASSICCHESS_API_TOKEN` environment variable to that token.

This complete `account.mjs` example reads your account without changing it:

```js
import { ApplicationClient } from '@classicchess/api';

const token = process.env.CLASSICCHESS_API_TOKEN;
if (!token) throw new Error('Set CLASSICCHESS_API_TOKEN to your personal API token first');
const api = new ApplicationClient();
const response = await api.accountMe(token);
console.log(response.status, response.data);
```

Run `node account.mjs` in the same app directory. Device session credentials
and personal tokens have different permissions; use the credential required by
the endpoint. Keep tokens in the trusted Node.js or Electron main process.

| Application operation | Method |
| --- | --- |
| Read account and collections | `accountMe(token)`, `accountCollections(token)` |
| Create a collection | `accountCreateCollection(name, token)` |
| Import public player games | `accountImportPublicPlayerGames({ archivePlayer, name, collectionId, since, until }, token)` |
| Scan JPEG bytes | `scanPosition(imageBytes, token)`; `imageBytes` is a `Uint8Array` of up to 850,000 bytes |
| Call other account, Notebook, Remote or Cast APIs | `request({ path, method, body, contentType, token })` |

`request` accepts a relative `/api/v1/` or `/cast/api/mobile/` path. JSON text
and binary `Uint8Array` bodies preserve their content type and bytes. Responses
contain `{ ok, status, data, retryAfter }`, including HTTP errors such as
conflicts. Empty responses decode as `{}`. Network errors, invalid JSON,
cancellation and response limits throw `ApiError`.

The body limit is 128 MiB, and per-request deadlines can extend to ten minutes.
Cookies and redirects are disabled; bearers are accepted only on private API
paths over HTTPS or loopback development. Neither client retries writes
automatically. Use `ClassicChessClient` for public archive and statistics reads.

Portrait URLs already live in `player.portrait.thumbnail` and `.image`. Download
those files through an image loader with memory/disk caching; empty URLs mean no
portrait. Use your app's file-download handling for large files instead of the JSON
application client. The versioned player-opening endpoint
`/api/v1/opening-explorer/player/` returns rows without website HTML fragments.
`eventSeries()` uses `/api/v1/public/event-series/`; `publicGames` with
`archiveEvent` and `sort: 'event'` preserves curated round order and `event_round`.
Cross-origin browser access is not enabled; browser apps should call their backend.

## Build and test this repository

These commands are for contributors working on the SDK itself. They are not
required to use it in an application. Python 3 with PyYAML is needed only for
checking the generated response types.

```sh
git clone https://github.com/Andromeda1957/classicchess-api-typescript.git
cd classicchess-api-typescript
python3 -m venv .venv
source .venv/bin/activate
python3 -m pip install PyYAML==6.0.3
npm ci
npm test
```

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
