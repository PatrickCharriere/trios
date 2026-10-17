"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { applyMove, chooseMove, viewFor, type Move } from "@/engine";
import { useI18n } from "@/i18n/I18nProvider";
import { createLocalGame, loadLocalGame, saveLocalGame, type LocalGame as SavedGame } from "@/lib/history";
import { useHydrated } from "@/lib/useHydrated";
import { GameTable } from "./GameTable";
import { Modal } from "./Modal";

const BOT_DELAY_MS = 750;

export function LocalGame() {
  const { id } = useParams<{ id: string }>();
  // Saved games live in localStorage, so render nothing until in the browser.
  // Keyed by id so opening another game starts from fresh state.
  return useHydrated() ? <LocalGameLoaded key={id} id={id} /> : <div className="loading" />;
}

function LocalGameLoaded({ id }: { id: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [game, setGame] = useState<SavedGame | null>(() => loadLocalGame(id));
  const [revealed, setRevealed] = useState<number | null>(null);

  const commit = (next: SavedGame) => {
    saveLocalGame(next);
    setGame(next);
  };

  const state = game?.state;
  const current = state?.current ?? 0;
  const botTurn = state?.status === "playing" && state.players[current].kind === "bot";

  useEffect(() => {
    if (!game || !botTurn) return;
    const timer = window.setTimeout(() => {
      const player = game.state.players[game.state.current];
      const move = chooseMove(game.state, game.state.current, player.level ?? "normal");
      const result = applyMove(game.state, game.state.current, move);
      if (!result.ok) return;
      const next = { ...game, state: result.state };
      saveLocalGame(next);
      setGame(next);
    }, BOT_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [game, botTurn]);

  if (!game || !state) {
    return (
      <div className="centre-card card">
        <p>{t.errors.notFound}</p>
        <Link className="btn primary" href="/">
          {t.over.newGame}
        </Link>
      </div>
    );
  }

  const humans = state.players.flatMap((p, i) => (p.kind === "human" ? [i] : []));
  const hotSeat = humans.length > 1;
  const humanTurn = state.status === "playing" && !botTurn;
  // Whose rack is on screen: the player to move, or the last human between bot turns.
  const seat = humanTurn ? current : hotSeat ? (revealed ?? humans[0]) : humans[0];
  const needsHandoff = hotSeat && humanTurn && revealed !== current;

  const onMove = (move: Move) => {
    const result = applyMove(state, seat, move);
    if (!result.ok) return result.error;
    commit({ ...game, state: result.state });
    return null;
  };

  // A rematch is a new game, so the finished one stays in the history.
  const rematch = () => router.push(`/play/${createLocalGame(game.mode, game.setup)}`);
  const newGame = () => router.push("/");

  return (
    <>
      <GameTable
        view={viewFor(state, seat)}
        canAct={humanTurn && !needsHandoff}
        liveHelp
        waiting={botTurn ? <span className="thinking">{t.game.thinking(state.players[current].name)}</span> : undefined}
        onMove={onMove}
        overActions={
          <>
            <button type="button" className="btn primary" onClick={rematch}>
              {t.over.rematch}
            </button>
            <button type="button" className="btn" onClick={newGame}>
              {t.over.newGame}
            </button>
          </>
        }
      />
      {needsHandoff && (
        // Keyed by player so each hand-off is a fresh modal; it can't be dismissed, only confirmed.
        <Modal key={current} title={t.handoff.title(state.players[current].name)} className="handoff">
          <p className="muted">{t.handoff.body}</p>
          <div className="actions">
            <button type="button" className="btn primary" onClick={() => setRevealed(current)} autoFocus>
              {t.handoff.ready}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
