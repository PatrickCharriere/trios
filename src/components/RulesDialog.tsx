"use client";

import { useI18n } from "@/i18n/I18nProvider";
import { Modal } from "./Modal";

export function RulesDialog({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  return (
    <Modal title={t.rulesText.title} onDismiss={onClose} className="rules">
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
    </Modal>
  );
}
