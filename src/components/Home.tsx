"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { MAX_PLAYERS, MIN_PLAYERS, createGame, type BotLevel, type PlayerSetup } from "@/engine";
import { useI18n } from "@/i18n/I18nProvider";
import { ApiFailure, api, loadName, saveName, saveSeat } from "@/lib/online/client";
import { MAX_NAME, extractGameId } from "@/lib/online/protocol";
import { loadLocal, saveLocal } from "@/lib/localGame";
import { useHydrated } from "@/lib/useHydrated";

const LEVELS: BotLevel[] = ["easy", "normal", "hard"];
const SIZES = Array.from({ length: MAX_PLAYERS - MIN_PLAYERS + 1 }, (_, i) => MIN_PLAYERS + i);

export function Home() {
  const { t } = useI18n();
  const hydrated = useHydrated();
  return (
    <div className="home">
      <section className="hero">
        <div className="hero-tiles" aria-hidden="true">
          <span className="token"><span className="value">7</span></span>
          <span className="token"><span className="value">2</span></span>
          <span className="token"><span className="value">6</span></span>
        </div>
        <h1>Trios</h1>
        <p className="lead">{t.tagline}</p>
      </section>
      {hydrated ? <Setup /> : <div className="loading" />}
    </div>
  );
}

function Segmented<T extends string | number>({
  label,
  options,
  value,
  onChange,
  format,
}: {
  label: string;
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
  format: (value: T) => string;
}) {
  return (
    <fieldset className="segmented">
      <legend>{label}</legend>
      <div>
        {options.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={option === value}
            className={option === value ? "on" : ""}
            onClick={() => onChange(option)}
          >
            {format(option)}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function Setup() {
  const { t } = useI18n();
  const router = useRouter();
  const [name, setName] = useState(() => loadName());
  const [hasSave] = useState(() => loadLocal()?.state.status === "playing");

  const [bots, setBots] = useState(1);
  const [level, setLevel] = useState<BotLevel>("normal");
  const [localCount, setLocalCount] = useState(2);
  const [localNames, setLocalNames] = useState<string[]>(["", "", "", ""]);
  const [seats, setSeats] = useState(2);
  const [code, setCode] = useState("");
  const [online, setOnline] = useState<boolean | null>(null);
  const [onlineError, setOnlineError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .config()
      .then((c) => !cancelled && setOnline(c.online))
      .catch(() => !cancelled && setOnline(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const myName = name.trim() || t.home.defaultName;

  const startLocal = (setup: PlayerSetup[]) => {
    if (name.trim()) saveName(name.trim());
    saveLocal({ setup, state: createGame(setup) });
    router.push("/play");
  };

  const startSolo = () =>
    startLocal([
      { name: myName, kind: "human" },
      ...Array.from({ length: bots }, (_, i) => ({ name: t.botName(i + 1), kind: "bot" as const, level })),
    ]);

  const startPassAndPlay = () =>
    startLocal(
      Array.from({ length: localCount }, (_, i) => ({
        name: localNames[i].trim() || (i === 0 ? myName : t.home.playerN(i + 1)),
        kind: "human" as const,
      })),
    );

  const createOnline = async () => {
    if (!name.trim()) {
      setOnlineError(t.errors.badName);
      return;
    }
    setBusy(true);
    setOnlineError(null);
    try {
      const grant = await api.create(name.trim(), seats);
      saveName(name.trim());
      saveSeat(grant.id, { token: grant.token, seat: grant.seat });
      router.push(`/g/${grant.id}`);
    } catch (error) {
      const code = error instanceof ApiFailure ? error.code : "network";
      setOnlineError(code in t.errors ? t.errors[code as keyof typeof t.errors] : t.errors.network);
      setBusy(false);
    }
  };

  const join = (e: React.FormEvent) => {
    e.preventDefault();
    const id = extractGameId(code);
    if (id) router.push(`/g/${id}`);
  };

  return (
    <div className="setup">
      {hasSave && (
        <button type="button" className="btn primary resume" onClick={() => router.push("/play")}>
          {t.home.resume}
        </button>
      )}

      <label className="field name-field">
        <span>{t.home.yourName}</span>
        <input
          value={name}
          maxLength={MAX_NAME}
          placeholder={t.home.defaultName}
          onChange={(e) => setName(e.target.value)}
          autoComplete="nickname"
        />
      </label>

      <div className="modes">
        <section className="card mode">
          <h2>{t.home.solo}</h2>
          <p className="muted">{t.home.soloDesc}</p>
          <Segmented label={t.home.opponents} options={[1, 2, 3]} value={bots} onChange={setBots} format={String} />
          <Segmented label={t.home.level} options={LEVELS} value={level} onChange={setLevel} format={(l) => t.levels[l]} />
          <button type="button" className="btn primary" onClick={startSolo}>
            {t.home.start}
          </button>
        </section>

        <section className="card mode">
          <h2>{t.home.local}</h2>
          <p className="muted">{t.home.localDesc}</p>
          <Segmented label={t.home.players} options={SIZES} value={localCount} onChange={setLocalCount} format={String} />
          <div className="names">
            {Array.from({ length: localCount }, (_, i) => (
              <input
                key={i}
                aria-label={t.home.playerN(i + 1)}
                placeholder={i === 0 ? myName : t.home.playerN(i + 1)}
                maxLength={MAX_NAME}
                value={localNames[i]}
                onChange={(e) => setLocalNames(localNames.map((n, k) => (k === i ? e.target.value : n)))}
              />
            ))}
          </div>
          <button type="button" className="btn primary" onClick={startPassAndPlay}>
            {t.home.start}
          </button>
        </section>

        <section className="card mode">
          <h2>{t.home.online}</h2>
          <p className="muted">{t.home.onlineDesc}</p>
          {online === false ? (
            <p className="notice">{t.home.onlineUnavailable}</p>
          ) : (
            <>
              <Segmented label={t.home.players} options={SIZES} value={seats} onChange={setSeats} format={String} />
              <button type="button" className="btn primary" disabled={busy || online === null} onClick={createOnline}>
                {t.home.create}
              </button>
              {onlineError && <p className="notice">{onlineError}</p>}
              <form className="join" onSubmit={join}>
                <label className="field">
                  <span>{t.home.joinCode}</span>
                  <span className="inline">
                    <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="abc234" />
                    <button type="submit" className="btn" disabled={!extractGameId(code)}>
                      {t.home.join}
                    </button>
                  </span>
                </label>
              </form>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
