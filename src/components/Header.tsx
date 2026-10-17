"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useI18n } from "@/i18n/I18nProvider";
import { followThemeFromOtherTabs } from "@/lib/settings";
import { unlockAudioOnFirstGesture } from "@/lib/sound";
import { RulesDialog } from "./RulesDialog";
import { SettingsDialog } from "./SettingsDialog";

export function Header() {
  const { lang, t, setLang } = useI18n();
  const [open, setOpen] = useState<"rules" | "settings" | null>(null);

  // The header is on every page, so it is where sounds get ready on the first tap
  // and where a theme picked in another tab is picked up.
  useEffect(() => unlockAudioOnFirstGesture(), []);
  useEffect(() => followThemeFromOtherTabs(), []);

  return (
    <header className="site-header">
      <Link href="/" className="brand" aria-label="Trios">
        <span className="brand-tiles" aria-hidden="true">
          <span>4</span>
          <span>5</span>
          <span>6</span>
        </span>
        <span className="brand-name">Trios</span>
      </Link>
      <nav className="header-actions">
        <button type="button" className="btn ghost" onClick={() => setOpen("rules")}>
          {t.rules}
        </button>
        <button
          type="button"
          className="btn ghost lang"
          onClick={() => setLang(lang === "fr" ? "en" : "fr")}
          aria-label={t.switchTo}
          title={t.switchTo}
        >
          {t.switchToShort}
        </button>
        <button
          type="button"
          className="btn ghost settings-btn"
          onClick={() => setOpen("settings")}
          aria-label={t.settings.title}
          title={t.settings.title}
        >
          <span aria-hidden="true">⚙</span>
          <span className="settings-label">{t.settings.title}</span>
        </button>
      </nav>
      {open === "rules" && <RulesDialog onClose={() => setOpen(null)} />}
      {open === "settings" && <SettingsDialog onClose={() => setOpen(null)} onRules={() => setOpen("rules")} />}
    </header>
  );
}
