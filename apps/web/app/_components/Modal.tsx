"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

// First modal primitive in this codebase — kept deliberately minimal (backdrop + panel, a real
// dialog role, a self-contained focus trap) rather than pulling in a dialog library, matching how
// little UI infrastructure the rest of the app has needed so far.
export function Modal({
  open,
  onClose,
  children,
  widthClassName = "max-w-lg",
  heightClassName = "",
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  widthClassName?: string;
  // Content-driven height (the default) is fine for short, simple dialogs — but a modal whose
  // content varies a lot between states (loading / empty / populated) should pass a fixed height
  // here, or it'll visibly shrink-wrap to whichever state currently has the least content.
  heightClassName?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape" && e.key !== "Tab") return;
      // Guards against a nested modal (MoveCredentialFolderModal inside CredentialsModal): every
      // open Modal instance adds its own `window`-level listener, so without this check, one
      // Escape press would close *both* the inner and outer modal at once (their listeners both
      // fire — `window.addEventListener` has no concept of nesting), and Tab-wrapping in the inner
      // modal would also run the outer modal's wrap logic. Only the instance whose panel actually
      // contains focus should react.
      const panel = panelRef.current;
      if (!panel || !panel.contains(document.activeElement)) return;

      if (e.key === "Escape") {
        onClose();
        return;
      }
      const focusable = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)];
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  // Move focus into the panel on open, and back to whatever triggered it on close.
  useEffect(() => {
    if (open) {
      previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
      const panel = panelRef.current;
      const firstFocusable = panel?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      (firstFocusable ?? panel)?.focus();
    } else {
      previouslyFocusedRef.current?.focus();
      previouslyFocusedRef.current = null;
    }
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- onClick here only stops the backdrop's onClose from firing on clicks inside the panel, it isn't an interactive control of its own */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className={`flex max-h-[85vh] w-full ${widthClassName} ${heightClassName} flex-col overflow-hidden rounded-lg border border-paper-200 bg-paper-50 shadow-lg outline-none [animation:modal-panel-in_150ms_ease-out]`}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
