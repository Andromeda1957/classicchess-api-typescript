const players = document.querySelector('#players');
const status = document.querySelector('#status');
const bio = document.querySelector('#bio');
const notable = document.querySelector('#notable');
const pgn = document.querySelector('#pgn');
let revision = 0;
let pgnRevision = 0;

function unwrap(result) {
  if (!result.ok) throw new Error(result.error.message);
  return result.data;
}

async function selectPlayer() {
  const selectedRevision = ++revision;
  ++pgnRevision;
  status.textContent = 'Loading player…';
  bio.textContent = '';
  notable.replaceChildren();
  pgn.textContent = '';
  try {
    const biography = unwrap(await window.archive.bio(players.value));
    const games = unwrap(await window.archive.notable(players.value));
    if (selectedRevision !== revision) return;
    bio.textContent = biography.bio?.lede || 'Biography unavailable';
    for (const entry of games.results) {
      const item = document.createElement('li');
      const button = document.createElement('button');
      button.textContent = `${entry.position}. ${entry.title} — show PGN`;
      button.addEventListener('click', async () => {
        const selectedPgnRevision = ++pgnRevision;
        try {
          const text = unwrap(await window.archive.pgn(entry.game.token));
          if (selectedRevision === revision && selectedPgnRevision === pgnRevision) pgn.textContent = text;
        } catch (error) {
          if (selectedRevision === revision && selectedPgnRevision === pgnRevision) status.textContent = error.message;
        }
      });
      item.append(button, document.createTextNode(` ${entry.annotation}`));
      notable.append(item);
    }
    status.textContent = games.count ? `${games.count} notable games` : 'No notable games curated yet';
  } catch (error) { if (selectedRevision === revision) status.textContent = error.message; }
}

players.addEventListener('change', selectPlayer);
window.archive.players().then(unwrap).then(catalog => {
  players.replaceChildren();
  for (const player of catalog.results) players.add(new Option(player.name, player.slug));
  players.disabled = !catalog.count;
  if (catalog.count) return selectPlayer();
  status.textContent = 'No curated players available';
}).catch(error => { status.textContent = error.message; });
