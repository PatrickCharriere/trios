# Trios

A number tile game where every line of three must add up to exactly 15. It's a web version of Triolet, the French classic that plays like Scrabble with numbers. The interface is in French, with an English toggle.

*Un jeu de chiffres où chaque ligne de trois jetons doit faire exactement 15, inspiré de Triolet. Interface en français, avec bascule vers l’anglais.*

## Ways to play

- **Against the computer:** one to three bots, easy, medium or hard.
- **Pass and play:** two to four people on one device, with a hand-off screen so nobody sees the next player's tiles.
- **Online with friends:** create a game, send the link, and play from separate devices. This needs a free Upstash Redis store (see below); the other two modes work without it.

Each section of the home page lists its games, in progress and finished, with their status (your turn, someone else's turn, won, lost, waiting for players), the scores and when they were last played. Tap a game to pick it up again, or remove it from the list. Removing an online game also tells the server you've left it: it stops notifying you, and once every player has removed it the game is deleted rather than left to expire. Games against the computer and pass-and-play games are stored in the browser: every game in progress, plus the 40 most recent finished ones. Online games are listed for the browser that created or joined them, and their status is refreshed from the server when the home page opens.

Every move of a game is kept. The **Moves played / Coups joués** list shows the latest eight, opens up to the whole game, and tapping a move outlines its tiles on the board. Above your rack, a short recap shows what the others played since your last turn, and their tiles are ringed on the board and keep glowing until the next move.

## Teaching mode

Turn on **Mode apprentissage / Teaching mode** under the rack or in the settings; the browser remembers the choice. It adds:

- **Reading a square.** With no tile selected, tap an empty square to see what it needs: "1 + 4 = 5 : il faut un 10 pour faire 15", what a trio there would score, and which of your tiles fit.
- **What fits (Voir les possibilités).** Every open square shows the value a trio needs there, the most a pair allows (≤11), or ✕ when nothing can ever go there. A green outline marks the squares one of your tiles fits.
- **Danger zones (Zones à risque).** Red badges on the squares where the next player could score big, showing the most they could make there; the deeper the red, the likelier it is. The map follows your draft, so you see what a move would open up before you play it. It is worked out from 24 racks the opponent might hold, drawn from the tiles you can't see.
- **Ideas (Une idée ?).** The coach's two best moves, each with its points, roughly what the next player can score in reply, and why it beats the move that scores most. **Montrer** puts it on the board as a draft to play or take back.
- **Review.** After each of your moves: a verdict (excellent, good, not bad, much better was possible), the coach's alternative with its reasons, and the position before your move with either move drawn on it.
- **The 27 trios of 15.** Every set of three values that makes 15, from 0 + 0 + 15 to 5 + 5 + 5. The values you hold are in bold, the trios where you hold two of the three (one tile on the board finishes them) are highlighted, and ★ marks a trio you could make from your rack alone.

On wide screens (1200 px and up), teaching mode puts the learning panel on the left of the board and the scores, rack and move history on the right, both always in view.

In online games the ideas, the square reading, what fits and the danger zones are off, so a game between people stays fair; the review after each move and the list of trios remain. Games against the computer and pass and play games get everything.

**How the coach decides.** It lists every legal move and gives each a quick score, then takes the most promising five, plus the top scorer and the move being reviewed, for a closer look. For each of those it works out the next player's best reply to 16 racks drawn from the tiles you can't see (the bag, the other racks and the tiles set aside), since you can't know which they hold. A move is then worth its points, minus the average reply, plus a point for each square it leaves open to play (minus one for each it closes), minus 6 for each square of four tiles it forms, plus 20 for a play again square, and minus 12 for spending a wild on fewer than 40 points. These weights are a first guess and live at the top of `src/engine/coach.ts`. Playing its top idea against the hard computer player, the coach won 37 of 60 games over two runs, by 55 to 80 points on average: stronger, but not by much yet. To measure it again after changing the weights, run `COACH_GAMES=40 npx vitest run coach.selfplay --silent=false` (skipped in the normal test run, as each game takes several seconds).

The look follows the physical game: a blue board with silver lines (the palette from the `triolets` project), yellow ×2, red ×3 and orange play again squares as in the official rules, and square wooden tiles that show, like the real ones, how many tiles of that value the box holds. Behind the pages, a faint grid of dots with soft washes of the board's yellow, blue and orange.

## Settings

The **⚙ Réglages / Settings** button at the top of every page opens them; the browser remembers each choice.

- **Your name**, suggested when you start or join a game.
- **Sounds**, on by default, at three volumes, with a button to hear them: a soft knock as you place a tile, a short tune when a game ends and, in online games, two rising notes when it becomes your turn, including as the game starts. If the game is in a background tab at that moment, the tab's title changes to "● À vous de jouer" until you come back to it. Against the computer or when sharing one device you're already watching the game, so that chime stays quiet there. The sounds are made in the browser with the Web Audio API, so there are no files to load; browsers only allow them after your first tap or key press on the page.
- **Notifications** (online games): "your turn", even with the browser closed or the phone locked, plus the result when a game ends. Each device turns them on for itself, and a **Try it** button sends a test. On iPhone and iPad, Safari only allows them once Trios is on the Home Screen (Share, then Add to Home Screen) and opened from its icon; the setting says so there. The server needs its keys first (see Deploying).
- **Appearance**: automatic (follows the device), light or dark. The choice applies before the page is drawn, so it never flashes the other theme first.
- **Game**: whether the last move keeps glowing until the next one (on by default; off, it pulses three times), and teaching mode.
- **Language** and a link to the **rules**.

## Rules

The full rules are in the app (the **Règles / Rules** button). In short:

- 81 tiles numbered 0 to 15 (nine 0s down to one 15) plus 2 wilds. Three tiles are set aside unseen and never played (Trios reveals them on the end screen); everyone holds 3.
- Place 1 to 3 tiles in one row or column, no gaps, touching the tiles already down. The first move covers the centre star, which counts double.
- Two neighbouring tiles total 15 at most, three in a row total exactly 15, and four in a row is never allowed.
- No square of four tiles (a 2 × 2 block) at the start of the game: not during the first round, and not with the first four tiles. And never a 3 × 3 block, which nothing could ever touch again.
- Each group of 2 or 3 you create or complete scores its sum. A trio scores 15 plus a 15 bonus, so 30. A single opening tile scores its own value.
- A wild takes the value you choose for the rest of the game but scores nothing: in a pair only the other tile counts, and a trio with a wild is still worth 30.
- Yellow ×2 and red ×3 squares multiply the tile you place on them. If that tile completes a trio, the whole trio is multiplied, bonus included (a trio on a ×3 is worth 90). Each square works once: if its tile was placed on an earlier turn, a trio completed later through it isn't multiplied. The centre star counts as a ×2.
- A **Triolet** (all 3 rack tiles placed at once as a trio) earns 50 more points, never multiplied, and not with a wild.
- A **play again** square gives you another turn.
- The game ends when the bag is empty and someone plays their last tile. They collect the value of the tiles left on the other racks.

### Where the rules needed a call

The official rulebook PDFs weren't reachable while building this, so some details come from secondary sources or are house rules. Each is easy to change in `src/engine/`.

| Point | What Trios does | Why |
| --- | --- | --- |
| Special square positions | 8 ×2 plus the centre, 8 ×3 and 8 play again squares (`board.ts`) | Taken from the physical board as listed in the `triolets` project's `Board.py`; a test checks every square. |
| Wild value | Counts its chosen value towards 15 but scores 0, so a pair with a wild scores only the other tile; a trio is still worth 30 | Gigamic's French rules say *"La valeur d'un Joker est nulle pour le comptage des points"* and *"Un Trio vaut donc toujours 30 points"*; the English rules agree that a trio with a wild is still 30. |
| Exchanges | Allowed while at least 5 tiles remain in the bag | *"Cette action est autorisée tant qu'il reste au moins cinq jetons dans le sac"*. |
| No square at the start | No move may create a 2 × 2 block until every player has had a turn (a play again turn doesn't end the round), nor while fewer than four tiles are down | Gigamic's rules say *"Lors du premier tour, il est interdit de former un carré avec les premiers jetons"*; the Mind Sports Olympiad tournament rules say "a 2x2 square is not permitted with the first 4 tiles". Trios applies both. |
| No 3 × 3 square | No move may fill a 3 × 3 block, at any point in the game | Gigamic's rules: *"Ensuite il est interdit de former un carré de 3 par 3 qui bloquerait la partie"*. Another version only forbids it when the game couldn't continue; Trios applies the stricter Gigamic wording. |
| Stuck games | The game ends when the bag is empty and nobody can play, when no tile of any value fits anywhere, or after two full rounds with no tile placed | Only the first is in the sources found. Without the other two, simulated games could loop forever on exchanges. |
| Leftover tiles | Only the player who goes out gains anything: the value of the tiles left on the other racks. Nobody loses points for their own leftover tiles | Gigamic's current rules. An older edition and the tournament rules subtract each player's leftover tiles instead. |

## Deploying to Vercel

1. In Vercel, **Add New → Project** and import this repository. `vercel.json` pins the framework to Next.js; leave **Root Directory** empty (the repository root).
2. Vercel deploys the repository's default branch (`develop`) to production, and every other branch as a preview. Merge this work into `develop` for the production site.
3. To switch on online play: in the Vercel project, open **Storage**, create an **Upstash Redis** database on the free plan and connect it to the project, then redeploy. Vercel adds the credentials as environment variables. Trios reads `KV_REST_API_URL` and `KV_REST_API_TOKEN`, `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`, or the same names with a custom prefix.

Until a store is connected, the home page says online play isn't switched on, and the other modes work as normal.

4. To switch on notifications: run `npm run vapid-keys` (on any computer with Node) and add the two lines it prints, `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`, under **Settings → Environment Variables** for Production (and Preview, to try them on preview deployments), then redeploy. Keep the private key secret, and keep the same pair afterwards: browsers subscribe to the public key, so a new pair means everyone turns notifications on again. `VAPID_SUBJECT` is optional (a `mailto:` or `https:` contact for the push services; it defaults to the site's address). Without the keys, the setting says notifications aren't set up.

**How notifications work.** Turning them on registers a small service worker (`public/sw.js`) and a push subscription in the browser, which every online game this browser plays in then keeps with the player's seat, along with the player's language. After a move, the server works out who to tell (the player whose turn it is, or everyone when the game ends; never the player who just moved) and, once its response has gone out, encrypts each message for its browser and sends it to that browser's push service (Google, Apple, Mozilla or Microsoft), signed with the VAPID key. It uses Node's crypto rather than a library; the tests check the encryption against the reference implementation. The server only ever sends to those push services, and forgets subscriptions they report as gone. When the game is already on screen, the service worker removes the notification at once, since the page has chimed.

**Free tier headroom.** Upstash's free plan allows 500,000 commands a month. While a game is on, the player waiting checks for moves every 1.5 seconds and the player to move every 8 seconds. A tab in the background checks only while waiting, so the your-turn chime still arrives: every 6 seconds, then once a minute after ten minutes, stopping after two hours so a forgotten tab can't use up the quota. With both players looking at the game, that works out to roughly 175 hours of two-player online play a month. Games expire 14 days after their last move.

## Development

```bash
npm install
npm run dev        # http://localhost:3000, online play uses an in-memory store
npm test           # engine, online service and Upstash adapter tests
npm run lint
npm run typecheck
npm run build
```

GitHub Actions runs the same lint, typecheck, test and build steps on every pull request and every push to `develop` (`.github/workflows/ci.yml`).

Running a production build locally (`npm run build && npm start`) disables online play unless you either connect Upstash variables in `.env.local` or set `TRIOS_MEMORY_STORE=1`.

## How it's built

- **Next.js 16, React 19 and TypeScript.** The only other runtime dependency is the Upstash client.
- `src/engine/`: the game itself, pure TypeScript with no React: rules and scoring (`rules.ts`), game flow (`game.ts`), move generation (`movegen.ts`), the computer opponent (`ai.ts`) and the teaching coach (`coach.ts`). The tests play whole bot games and check the board is legal after every move.
- `src/lib/coach/`: runs the coach in the page in short slices, so the game stays responsive while it looks ahead. (Turbopack doesn't bundle web workers, so it shares the main thread politely instead.)
- `src/components/`: the board, rack and game screens, shared by local and online play, and the home page lists.
- `src/lib/history.ts`: the games stored in the browser and the summaries shown in the home page lists.
- `src/lib/settings.ts` and `src/lib/sound.ts`: the settings this browser remembers, and the game's sounds, synthesised with the Web Audio API.
- `src/lib/push/` and `public/sw.js`: notifications. `webpush.ts` encrypts and signs (RFC 8291 and 8292), `notices.ts` decides who is told what, `client.ts` subscribes the browser, and the service worker shows them.
- `src/lib/online/`: the online service. The server holds the full game; each player only receives their own rack. Moves are validated on the server, under a short lock so simultaneous requests can't clash.
- `src/app/api/`: route handlers for creating, joining, polling, playing and leaving online games, notification subscriptions, and a test notification.
- `src/i18n/`: French and English text.

Triolet is a game by André and John Perriolat, published by Gigamic. Trios is an unofficial fan implementation and isn't affiliated with them.
