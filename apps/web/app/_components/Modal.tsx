"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";

// First modal primitive in this codebase — kept deliberately minimal (backdrop + panel, Escape
// and backdrop-click to close, no focus trap) rather than pulling in a dialog library, matching
// how little UI infrastructure the rest of the app has needed so far.
export function Modal({
  open,
  onClose,
  children,
  widthClassName = "max-w-lg",
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  widthClassName?: string;
}) {
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        role="presentation"
        onClick={(e) => e.stopPropagation()}
        className={`flex max-h-[85vh] w-full ${widthClassName} flex-col overflow-hidden rounded-lg border border-paper-200 bg-paper-50 shadow-lg`}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
