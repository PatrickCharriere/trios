"use client";

import Link from "next/link";
import { useState } from "react";
import { useI18n } from "@/i18n/I18nProvider";
import { RulesDialog } from "./RulesDialog";

export function Header() {
  const { lang, t, setLang } = useI18n();
  const [rulesOpen, setRulesOpen] = useState(false);

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
        <button type="button" className="btn ghost" onClick={() => setRulesOpen(true)}>
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
      </nav>
      <RulesDialog open={rulesOpen} onClose={() => setRulesOpen(false)} />
    </header>
  );
}
