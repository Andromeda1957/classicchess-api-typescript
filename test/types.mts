import { ClassicChessClient, ApiError, type PublicGame } from '@classicchess/api';

const api = new ClassicChessClient();
const search = await api.masterGames({ query: 'karpov', page: 1, pageSize: 25 });
const exactCount: boolean = search.count_is_exact;
const master = search.results[0];
if (master) {
  const opening: string = master.opening;
  const pgn: string = (await api.masterGame(master.token)).pgn;
  const raw: string = await api.masterPgn(master.token);
  void [opening, pgn, raw];
}
for await (const game of api.iterateMasterGames({ query: 'Tal' }, { limit: 25 })) {
  const token: string = game.token;
  void token;
}
// @ts-expect-error MasterDB searches require a query.
api.masterGames({ page: 1 });
// @ts-expect-error MasterDB uses camelCase pagination options.
api.masterGames({ query: 'Tal', page_size: 25 });
void exactCount;
const names: string[] = await api.playerNames();
const books = await api.annotatedBooks();
const firstBook = books.results[0];
if (firstBook) {
  for await (const game of api.iterateAnnotatedGames(firstBook.slug)) {
    const label: string = game.book.label;
    const license: string = game.annotation.license_name;
    void [label, license];
  }
}
const biography = await api.publicPlayerBio('Tal');
// @ts-expect-error A biography is nullable; consumers must handle absence.
const missingNullCheck: string = biography.bio.lede;
const lede: string | undefined = biography.bio?.lede;
for await (const game of api.iteratePublicGames({ archivePlayer: 'Tal' })) {
  const typed: PublicGame = game;
  const pgn: string = await api.publicPgn(typed.token);
  void pgn;
}
// @ts-expect-error Client options use the documented camelCase parameters.
api.publicGames({ archive_player: 'Tal' });
// @ts-expect-error Request queries are strings, not arbitrary objects.
api.publicPlayers({ query: 'Tal' });
const error = new ApiError('failure', { code: 'rate_limited', status: 429 });
const status: number | undefined = error.status;
void [names, lede, status, missingNullCheck];
