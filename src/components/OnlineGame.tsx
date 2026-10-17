"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { Move, RuleError } from "@/engine";
import { useI18n } from "@/i18n/I18nProvider";
import { errorMessage } from "@/i18n/messages";
import { markOnlineExpired, recordOnlineGame } from "@/lib/history";
import { ApiFailure, api, loadName, loadSeat, pollDelay, saveName, saveSeat, type SavedSeat } from "@/lib/online/client";
import { MAX_NAME, type Snapshot } from "@/lib/online/protocol";
import { useTurnAlert } from "@/lib/useGameAlerts";
import { useHydrated } from "@/lib/useHydrated";
import { GameTable } from "./GameTable";

type Fatal = "notFound" | "unavailable";

export function OnlineGame() {
  const { id } = useParams<{ id: string }>();
  return useHydrated() ? <OnlineGameLoaded key={id} id={id} /> : <div className="loading" />;
}


function OnlineGameLoaded({ id }: { id: string }) {
  const { t } = useI18n();
  const [seat, setSeat] = useState<SavedSeat | null>(() => loadSeat(id));
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [fatal, setFatal] = useState<Fatal | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [rematching, setRematching] = useState(false);
  const rev = useRef<number | undefined>(undefined);
  const token = seat?.token ?? null;

  const apply = (next: Snapshot) => {
    rev.current = next.rev;
    setSnap(next);
    setNotice(null);
    recordOnlineGame(next);
  };

  const view = snap?.view ?? null;
  const myTurn = !!view && view.status === "playing" && view.current === snap?.seat;
  // Nothing changes on the server while it's our move, so poll gently then.
  const pollFast = !myTurn && view?.status !== "over";

  // The others play elsewhere, so a chime tells the player their turn has come.
  // Local games go without: the player is already watching.
  useTurnAlert(snap, myTurn, t.game.yourTurnTitle);

  useEffect(() => {
    let stopped = false;
    let timer: number | undefined;
    let hiddenSince = document.hidden ? Date.now() : null;
    const tick = async () => {
      window.clearTimeout(timer);
      if (stopped) return;
      const delay = pollDelay(pollFast, hiddenSince === null ? null : Date.now() - hiddenSince);
      // In the background on our own turn, or for a long while: wait for the player to come back.
      if (delay === null) return;
      try {
        const result = await api.poll(id, token, rev.current);
        if (stopped) return;
        if (!result.unchanged) {
          rev.current = result.snapshot.rev;
          setSnap(result.snapshot);
          recordOnlineGame(result.snapshot);
        }
        setNotice(null);
      } catch (error) {
        if (stopped) return;
        if (error instanceof ApiFailure && (error.code === "notFound" || error.code === "unavailable")) {
          if (error.code === "notFound") markOnlineExpired(id);
          setFatal(error.code);
          return;
        }
        setNotice("network");
      }
      timer = window.setTimeout(tick, delay);
    };
    tick();
    const onVisibility = () => {
      if (document.hidden) {
        hiddenSince ??= Date.now();
      } else {
        hiddenSince = null;
        tick();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
    // Restarting on a speed change means our own move is followed by fast polling at once.
  }, [id, token, pollFast]);

  if (fatal) {
    return (
      <div className="centre-card card">
        <p>{t.errors[fatal]}</p>
        <Link className="btn primary" href="/">
          {t.over.newGame}
        </Link>
      </div>
    );
  }
  if (!snap) return <div className="loading" />;

  const noticeText = notice ? errorMessage(t, notice) : null;

  if (!snap.started) {
    return snap.seat === null ? (
      <JoinForm
        snap={snap}
        onJoined={(grant) => {
          saveSeat(id, grant);
          setSeat(grant);
          apply(grant.snapshot);
        }}
      />
    ) : (
      <Lobby snap={snap} token={token!} onUpdate={apply} notice={noticeText} />
    );
  }

  const onMove = async (move: Move): Promise<RuleError | null> => {
    try {
      apply(await api.move(id, token!, move));
      return null;
    } catch (error) {
      if (error instanceof ApiFailure && error.status === 422) return error.code as RuleError;
      setNotice(error instanceof ApiFailure ? error.code : "network");
      return null;
    }
  };

  const rematch = async () => {
    setRematching(true);
    try {
      apply(await api.rematch(id, token!));
    } catch (error) {
      // Someone else may have started the rematch already; the next poll shows it.
      const code = error instanceof ApiFailure ? error.code : "network";
      setNotice(code === "notOver" ? null : code);
    } finally {
      setRematching(false);
    }
  };

  return (
    <GameTable
      view={view!}
      canAct={myTurn}
      notice={noticeText}
      onMove={onMove}
      overActions={
        <>
          {snap.seat !== null && (
            <button type="button" className="btn primary" onClick={rematch} disabled={rematching}>
              {t.over.rematch}
            </button>
          )}
          <Link className="btn" href="/">
            {t.over.newGame}
          </Link>
        </>
      }
    />
  );
}

function Lobby({
  snap,
  token,
  onUpdate,
  notice,
}: {
  snap: Snapshot;
  token: string;
  onUpdate: (snap: Snapshot) => void;
  notice: string | null;
}) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const link = `${window.location.origin}/g/${snap.id}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked: the link is still selectable.
    }
  };

  const start = async () => {
    try {
      onUpdate(await api.start(snap.id, token));
    } catch (e) {
      setError(errorMessage(t, e instanceof ApiFailure ? e.code : "network"));
    }
  };

  return (
    <div className="centre-card card lobby">
      <h1>{t.lobby.title}</h1>
      <p>{t.lobby.share}</p>
      <div className="share">
        <input readOnly value={link} onFocus={(e) => e.currentTarget.select()} aria-label={t.lobby.share} />
        <button type="button" className="btn" onClick={copy}>
          {copied ? t.lobby.copied : t.lobby.copy}
        </button>
      </div>
      <p className="code">
        <span className="muted">Code</span> <strong>{snap.id}</strong>
      </p>
      <h2>{t.lobby.waiting(snap.names.length, snap.seats)}</h2>
      <ol className="seats">
        {Array.from({ length: snap.seats }, (_, i) => (
          <li key={i} className={snap.names[i] ? "" : "empty"}>
            {snap.names[i] ?? "…"}
            {i === snap.seat && <span className="muted"> ({t.game.you})</span>}
          </li>
        ))}
      </ol>
      <p className="muted small">{t.lobby.hostStarts}</p>
      {snap.seat === 0 && snap.names.length >= 2 && (
        <button type="button" className="btn primary" onClick={start}>
          {t.lobby.startNow}
        </button>
      )}
      {(error || notice) && <p className="notice">{error ?? notice}</p>}
    </div>
  );
}

function JoinForm({ snap, onJoined }: { snap: Snapshot; onJoined: (grant: SavedSeat & { snapshot: Snapshot }) => void }) {
  const { t } = useI18n();
  const [name, setName] = useState(() => loadName());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const full = snap.names.length >= snap.seats;

  const join = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const grant = await api.join(snap.id, name);
      saveName(name.trim());
      onJoined(grant);
    } catch (err) {
      setError(errorMessage(t, err instanceof ApiFailure ? err.code : "network"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="centre-card card" onSubmit={join}>
      <h1>{t.lobby.joinTitle}</h1>
      <p className="muted">{t.lobby.waitingList(snap.names.length, snap.seats, snap.names.join(", "))}</p>
      {full ? (
        <p className="notice">{t.errors.full}</p>
      ) : (
        <>
          <label className="field">
            <span>{t.home.yourName}</span>
            <input value={name} maxLength={MAX_NAME} required onChange={(e) => setName(e.target.value)} autoFocus />
          </label>
          <button type="submit" className="btn primary" disabled={busy || !name.trim()}>
            {t.home.join}
          </button>
        </>
      )}
      {error && <p className="notice">{error}</p>}
    </form>
  );
}
