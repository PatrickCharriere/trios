import type { GameState } from "@/engine";
import { MESSAGES, type Lang, type Messages } from "@/i18n/messages";
import type { OnlineRecord } from "@/lib/online/store";
import type { PushMessage, PushTarget } from "./protocol";

/** One notification to send: to whom, for which game, and what it says. */
export interface Notice {
  gameId: string;
  target: PushTarget;
  message: PushMessage;
}

/**
 * The notifications an action in an online game calls for: "your turn" to the
 * player whose turn it now is, or the result to everyone when the game has
 * just ended. Never to the player who acted (`actor`), who is looking at the
 * game, and only to players who turned notifications on.
 */
export function noticesAfter(record: OnlineRecord, actor: number): Notice[] {
  const state = record.state;
  if (!state) return [];
  const notices: Notice[] = [];
  record.members.forEach((member, seat) => {
    if (seat === actor || !member.push) return;
    const { lang } = member.push;
    const t = MESSAGES[lang];
    const text =
      state.status === "over"
        ? { title: t.notify.overTitle, body: result(t, lang, state, seat) }
        : state.current === seat
          ? { title: t.notify.yourTurn, body: lastMove(t, lang, state, seat) }
          : null;
    if (text) {
      notices.push({ gameId: record.id, target: member.push, message: { ...text, url: `/g/${record.id}`, tag: `trios-${record.id}` } });
    }
  });
  return notices;
}

const list = (lang: Lang, names: string[]) => new Intl.ListFormat(lang, { type: "conjunction" }).format(names);

/** What the previous player did, or who the game is against when it has just started. */
function lastMove(t: Messages, lang: Lang, state: GameState, seat: number): string {
  const last = state.log[state.log.length - 1];
  if (!last) return t.notify.started(list(lang, state.players.flatMap((p, i) => (i === seat ? [] : [p.name]))));
  const name = state.players[last.player].name;
  if (last.type === "place") return t.notify.scored(name, last.score);
  if (last.type === "exchange") return t.notify.exchanged(name, last.count);
  return t.notify.passed(name);
}

function result(t: Messages, lang: Lang, state: GameState, seat: number): string {
  const winners = state.winners ?? [];
  if (winners.length === 0) return t.over.title;
  const points = state.players[winners[0]].score;
  if (winners.length > 1) return t.notify.tie(list(lang, winners.map((i) => (i === seat ? t.notify.you : state.players[i].name))), points);
  return winners[0] === seat ? t.notify.youWon(points) : t.notify.won(state.players[winners[0]].name, points);
}

/** The notification sent from the settings to check that everything works. */
export function testMessage(lang: Lang): PushMessage {
  const t = MESSAGES[lang];
  return { title: t.notify.testTitle, body: t.notify.testBody, url: "/", tag: "trios-test" };
}
