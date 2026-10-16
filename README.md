# Trios

A number tile game where every line of three must add up to exactly 15. It's a web version of Triolet, the French classic that plays like Scrabble with numbers. The interface is in French, with an English toggle.

*Un jeu de chiffres où chaque ligne de trois jetons doit faire exactement 15, inspiré de Triolet. Interface en français, avec bascule vers l’anglais.*

## Ways to play

- **Against the computer:** one to three bots, easy, medium or hard.
- **Pass and play:** two to four people on one device, with a hand-off screen so nobody sees the next player's tiles.
- **Online with friends:** create a game, send the link, and play from separate devices. This needs a free Upstash Redis store (see below); the other two modes work without it.

Each section of the home page lists its games, in progress and finished, with their status (your turn, someone else's turn, won, lost, waiting for players), the scores and when they were last played. Tap a game to pick it up again, or remove it from the list. Games against the computer and pass-and-play games are stored in the browser: every game in progress, plus the 40 most recent finished ones. Online games are listed for the browser that created or joined them, and their status is refreshed from the server when the home page opens.

The look follows the physical game: a blue board with silver lines (the palette from the `triolets` project), yellow ×2, red ×3 and orange play again squares as in the official rules, and square wooden tiles that show, like the real ones, how many tiles of that value the box holds.

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

**Free tier headroom.** Upstash's free plan allows 500,000 commands a month. While a game is on, the player waiting checks for moves every 1.5 seconds and the player to move every 8 seconds, and hidden tabs stop checking. That works out to roughly 175 hours of two-player online play a month. Games expire 14 days after their last move.

## Development

```bash
npm install
npm run dev        # http://localhost:3000, online play uses an in-memory store
npm test           # engine, online service and Upstash adapter tests
npm run lint
npm run typecheck
npm run build
```

Running a production build locally (`npm run build && npm start`) disables online play unless you either connect Upstash variables in `.env.local` or set `TRIOS_MEMORY_STORE=1`.

## How it's built

- **Next.js 16, React 19 and TypeScript.** The only other runtime dependency is the Upstash client.
- `src/engine/`: the game itself, pure TypeScript with no React: rules and scoring (`rules.ts`), game flow (`game.ts`), move generation (`movegen.ts`) and the computer opponent (`ai.ts`). The tests play whole bot games and check the board is legal after every move.
- `src/components/`: the board, rack and game screens, shared by local and online play, and the home page lists.
- `src/lib/history.ts`: the games stored in the browser and the summaries shown in the home page lists.
- `src/lib/online/`: the online service. The server holds the full game; each player only receives their own rack. Moves are validated on the server, under a short lock so simultaneous requests can't clash.
- `src/app/api/`: route handlers for creating, joining, polling and playing online games.
- `src/i18n/`: French and English text.

Triolet is a game by André and John Perriolat, published by Gigamic. Trios is an unofficial fan implementation and isn't affiliated with them.
