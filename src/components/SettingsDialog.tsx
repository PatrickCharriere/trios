"use client";

import { useState } from "react";
import { useI18n } from "@/i18n/I18nProvider";
import type { Lang } from "@/i18n/messages";
import { loadName, saveName } from "@/lib/online/client";
import { MAX_NAME } from "@/lib/online/protocol";
import type { Theme, Volume } from "@/lib/settings";
import { playSound } from "@/lib/sound";
import { useSettings } from "@/lib/useSettings";
import { useTeaching } from "@/lib/teaching";
import { Modal } from "./Modal";

/** A set of choices shown as joined buttons, backed by radio buttons for keyboards and screen readers. */
function Choice<T extends string>({
  name,
  value,
  options,
  onChange,
  disabled = false,
}: {
  name: string;
  value: T;
  options: readonly (readonly [T, string])[];
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className={`choice${disabled ? " disabled" : ""}`}>
      {options.map(([option, label]) => (
        <label key={option} className={value === option ? "on" : undefined}>
          <input
            type="radio"
            name={name}
            value={option}
            checked={value === option}
            disabled={disabled}
            onChange={() => onChange(option)}
          />
          {label}
        </label>
      ))}
    </div>
  );
}

/**
 * The settings: the player's name, sounds, appearance, how the game looks
 * after a move, teaching mode, language and the rules. New preferences belong here.
 */
export function SettingsDialog({ onClose, onRules }: { onClose: () => void; onRules: () => void }) {
  const { lang, t, setLang } = useI18n();
  const [settings, update] = useSettings();
  const [teaching, setTeaching] = useTeaching();
  const [name, setName] = useState(() => loadName());
  const s = t.settings;

  const rename = (next: string) => {
    setName(next);
    if (next.trim()) saveName(next.trim());
  };

  return (
    <Modal title={s.title} onDismiss={onClose} className="settings" focusDialog>
      <label className="field">
        <span>{s.name}</span>
        <input
          value={name}
          maxLength={MAX_NAME}
          autoComplete="nickname"
          placeholder={t.home.defaultName}
          onChange={(e) => rename(e.target.value)}
        />
        <span className="muted small">{s.nameHint}</span>
      </label>

      <fieldset className="setting">
        <legend>{s.sound}</legend>
        <label className="check">
          <input type="checkbox" checked={settings.sound} onChange={(e) => update({ sound: e.target.checked })} />
          {s.soundOn}
        </label>
        <div className="setting-row">
          <Choice<Volume>
            name="volume"
            value={settings.volume}
            disabled={!settings.sound}
            options={[
              ["low", s.volumeLow],
              ["medium", s.volumeMedium],
              ["high", s.volumeHigh],
            ]}
            onChange={(volume) => update({ volume })}
          />
          <button type="button" className="btn small-btn" onClick={() => playSound("turn", { force: true })}>
            {s.test}
          </button>
        </div>
      </fieldset>

      <fieldset className="setting">
        <legend>{s.theme}</legend>
        <Choice<Theme>
          name="theme"
          value={settings.theme}
          options={[
            ["auto", s.themeAuto],
            ["light", s.themeLight],
            ["dark", s.themeDark],
          ]}
          onChange={(theme) => update({ theme })}
        />
      </fieldset>

      <fieldset className="setting">
        <legend>{s.game}</legend>
        <label className="check">
          <input type="checkbox" checked={settings.blink} onChange={(e) => update({ blink: e.target.checked })} />
          {s.blink}
        </label>
        <label className="check">
          <input type="checkbox" checked={teaching} onChange={(e) => setTeaching(e.target.checked)} />
          {t.teach.turnOn}
        </label>
      </fieldset>

      <fieldset className="setting">
        <legend>{s.language}</legend>
        <Choice<Lang>
          name="lang"
          value={lang}
          options={[
            ["fr", "Français"],
            ["en", "English"],
          ]}
          onChange={setLang}
        />
      </fieldset>

      <div className="actions">
        <button type="button" className="btn" onClick={onRules}>
          {s.rules}
        </button>
        <button type="button" className="btn primary" onClick={onClose}>
          {t.close}
        </button>
      </div>
    </Modal>
  );
}
