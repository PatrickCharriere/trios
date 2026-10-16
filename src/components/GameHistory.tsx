"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { useI18n } from "@/i18n/I18nProvider";
import type { Messages } from "@/i18n/messages";
import {
  gameHref,
  getHistory,
  getServerHistory,
  removeGame,
  subscribeHistory,
  visibleGames,
  type GameMode,
  type GameSummary,
} from "@/lib/history";

const SHOWN = 4;

// A clock that ticks once a minute, for "5 minutes ago" labels.
let minute = Math.floor(Date.now() / 60_000);
const subscribeClock = (onTick: () => void) => {
  const timer = window.setInterval(() => {
    minute = Math.floor(Date.now() / 60_000);
    onTick();
  }, 30_000);
  return () => window.clearInterval(timer);
};
const useMinute = () =>
  useSyncExternalStore(
    subscribeClock,
    () => minute,
    () => minute,
  );

function ago(lang: string, t: Messages, then: number, nowMinute: number) {
  const minutes = Math.max(0, nowMinute - Math.floor(then / 60_000));
  if (minutes < 1) return t.history.justNow;
  const format = new Intl.RelativeTimeFormat(lang, { numeric: "auto" });
  if (minutes < 60) return format.format(-minutes, "minute");
  if (minutes < 60 * 24) return format.format(-Math.floor(minutes / 60), "hour");
  return format.format(-Math.floor(minutes / (60 * 24)), "day");
}

/** The badge text and tone for a game, from the point of view of this browser's player. */
function status(t: Messages, g: GameSummary): { text: string; tone: "turn" | "on" | "won" | "lost" | "off" } {
  // In a game against bots the person is the human seat; online it is the seat this browser holds.
  const me = g.mode === "online" ? g.seat : g.mode === "solo" ? g.players.findIndex((p) => !p.bot) : null;
  switch (g.status) {
    case "lobby":
      return { text: t.history.waiting(g.players.length, g.seats), tone: "on" };
    case "expired":
      return { text: t.history.expired, tone: "off" };
    case "playing": {
      if (g.current !== null && g.current === me) return { text: t.history.yourTurn, tone: "turn" };
      const name = g.current !== null ? g.players[g.current]?.name : "";
      return { text: t.history.turnOf(name ?? ""), tone: "on" };
    }
    default: {
      if (g.winners.length > 1) return { text: t.history.tie, tone: "off" };
      if (me !== null) return g.winners.includes(me) ? { text: t.history.won, tone: "won" } : { text: t.history.lost, tone: "lost" };
      return { text: t.history.winner(g.players[g.winners[0]]?.name ?? ""), tone: "won" };
    }
  }
}

export function GameHistory({ mode }: { mode: GameMode }) {
  const { lang, t } = useI18n();
  const all = useSyncExternalStore(subscribeHistory, getHistory, getServerHistory);
  const games = visibleGames(all).filter((g) => g.mode === mode);
  const nowMinute = useMinute();
  const [expanded, setExpanded] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);

  if (games.length === 0) return <p className="history-empty muted small">{t.history.empty}</p>;

  const remove = (g: GameSummary) => {
    removeGame(g.id);
    setConfirming(null);
  };

  return (
    <section className="history" aria-label={t.history.title}>
      <h3>
        {t.history.title} <span className="muted">({games.length})</span>
      </h3>
      <ul>
        {(expanded ? games : games.slice(0, SHOWN)).map((g) => {
          const badge = status(t, g);
          const body = (
            <>
              <span className={`badge ${badge.tone}`}>{badge.text}</span>
              <span className="history-players">
                {g.players.map((p, i) => (
                  <span key={i}>
                    {p.name} <strong>{p.score}</strong>
                  </span>
                ))}
              </span>
              <span className="history-when muted small">{ago(lang, t, g.updatedAt, nowMinute)}</span>
            </>
          );
          return (
            <li key={g.id} className="history-row">
              {confirming === g.id ? (
                <div className="history-confirm">
                  <span>{t.history.confirm}</span>
                  <button type="button" className="btn small-btn danger" onClick={() => remove(g)}>
                    {t.history.yes}
                  </button>
                  <button type="button" className="btn small-btn" onClick={() => setConfirming(null)} autoFocus>
                    {t.history.no}
                  </button>
                </div>
              ) : (
                <>
                  {g.status === "expired" ? (
                    <div className="history-main">{body}</div>
                  ) : (
                    <Link className="history-main" href={gameHref(g)}>
                      {body}
                    </Link>
                  )}
                  <button
                    type="button"
                    className="history-remove"
                    aria-label={t.history.remove}
                    title={t.history.remove}
                    onClick={() => setConfirming(g.id)}
                  >
                    ×
                  </button>
                </>
              )}
            </li>
          );
        })}
      </ul>
      {games.length > SHOWN && (
        <button type="button" className="link-btn" onClick={() => setExpanded(!expanded)}>
          {expanded ? t.history.showLess : t.history.showAll(games.length)}
        </button>
      )}
    </section>
  );
}
