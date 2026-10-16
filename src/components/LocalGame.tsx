"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { applyMove, chooseMove, createGame, viewFor, type Move } from "@/engine";
import { useI18n } from "@/i18n/I18nProvider";
import { clearLocal, loadLocal, saveLocal, type LocalSave } from "@/lib/localGame";
import { useHydrated } from "@/lib/useHydrated";
import { GameTable } from "./GameTable";

const BOT_DELAY_MS = 750;

export function LocalGame() {
  // The saved game lives in localStorage, so render nothing until in the browser.
  return useHydrated() ? <LocalGameLoaded /> : <div className="loading" />;
}

function LocalGameLoaded() {
  const { t } = useI18n();
  const router = useRouter();
  const [game, setGame] = useState<LocalSave | null>(() => loadLocal());
  const [revealed, setRevealed] = useState<number | null>(null);

  const commit = (next: LocalSave) => {
    saveLocal(next);
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
      saveLocal(next);
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

  const rematch = () => {
    commit({ ...game, state: createGame(game.setup) });
    setRevealed(null);
  };

  const newGame = () => {
    clearLocal();
    router.push("/");
  };

  return (
    <>
      <GameTable
        view={viewFor(state, seat)}
        canAct={humanTurn && !needsHandoff}
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
        <div className="overlay handoff" role="dialog" aria-modal="true" aria-labelledby="handoff-title">
          <div className="dialog-body card">
            <h2 id="handoff-title">{t.handoff.title(state.players[current].name)}</h2>
            <p className="muted">{t.handoff.body}</p>
            <div className="actions">
              <button type="button" className="btn primary" onClick={() => setRevealed(current)} autoFocus>
                {t.handoff.ready}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
