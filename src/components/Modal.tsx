"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

interface ModalProps {
  title: ReactNode;
  children: ReactNode;
  /** Called on Escape or a click outside. Omit to make the modal stay until an action is taken. */
  onDismiss?: () => void;
  className?: string;
}

/**
 * A native modal <dialog>: the browser traps focus inside it, closes it on
 * Escape and hands focus back afterwards. It opens when mounted.
 */
export function Modal({ title, children, onDismiss, className = "" }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => dialog?.close();
  }, []);

  return (
    <dialog
      ref={ref}
      className={`dialog ${className}`}
      aria-labelledby={titleId}
      onCancel={(e) => {
        // Escape: let the parent decide, so React state stays the source of truth.
        e.preventDefault();
        onDismiss?.();
      }}
      onClick={(e) => {
        // The dialog element itself only receives clicks on its backdrop.
        if (e.target === e.currentTarget) onDismiss?.();
      }}
    >
      <div className="dialog-body">
        <h2 id={titleId}>{title}</h2>
        {children}
      </div>
    </dialog>
  );
}
