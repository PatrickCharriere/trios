"use client";

import { useEffect, useRef } from "react";
import { useI18n } from "@/i18n/I18nProvider";

export function RulesDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="dialog rules"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="dialog-body">
        <h2>{t.rulesText.title}</h2>
        <p className="lead">{t.rulesText.goal}</p>
        <ol>
          {t.rulesText.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ol>
        <p className="muted small">{t.rulesText.note}</p>
        <div className="actions">
          <button type="button" className="btn primary" onClick={onClose}>
            {t.close}
          </button>
        </div>
      </div>
    </dialog>
  );
}
