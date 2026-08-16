"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, LogOut, X } from "lucide-react";
import { useAuthUser, useSetPassword, useSignOut } from "@delft/shared";
import { Modal } from "./Modal";

const MIN_PASSWORD_LENGTH = 8;

type View = "list" | "password";

export function AccountModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useAuthUser();
  const router = useRouter();
  const signOut = useSignOut();
  const setPassword = useSetPassword();
  const [view, setView] = useState<View>("list");
  const [password, setPasswordValue] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saved, setSaved] = useState(false);
  const [mismatch, setMismatch] = useState(false);

  // Never resume mid-drill-down on reopen — same reset-on-close pattern CredentialsModal uses.
  useEffect(() => {
    if (!open) setView("list");
  }, [open]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaved(false);
    if (password !== confirm) {
      setMismatch(true);
      return;
    }
    setMismatch(false);
    setPassword.mutate(
      { password },
      {
        onSuccess: () => {
          setSaved(true);
          setPasswordValue("");
          setConfirm("");
        },
      },
    );
  }

  function handleSignOut() {
    signOut.mutate(undefined, {
      onSuccess: () => {
        onClose();
        router.replace("/");
      },
    });
  }

  return (
    <Modal open={open} onClose={onClose} widthClassName="max-w-sm">
      <div className="flex shrink-0 items-center justify-between border-b border-paper-200 px-4 py-2">
        {view === "list" ? (
          <span className="text-sm font-medium text-ink-800">Account</span>
        ) : (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setView("list")}
              aria-label="Back"
              className="rounded px-1 py-1 text-ink-500 hover:bg-paper-100 hover:text-ink-800"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-sm font-medium text-ink-800">Password</span>
          </div>
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="rounded px-2 py-1 text-ink-500 hover:bg-paper-100 hover:text-ink-800"
        >
          <X size={16} />
        </button>
      </div>

      {view === "list" ? (
        <div className="flex flex-col gap-4 overflow-y-auto p-4">
          <p className="text-xs text-ink-500">
            Signed in as <span className="font-medium text-ink-700">{user?.email}</span>
          </p>

          <button
            type="button"
            onClick={() => setView("password")}
            className="flex w-full items-center justify-between rounded-md border border-paper-200 bg-paper-100 px-4 py-3 text-left text-sm text-ink-800 hover:bg-paper-200"
          >
            Password
            <ChevronRight size={14} className="text-ink-400" />
          </button>

          <button
            type="button"
            onClick={handleSignOut}
            className="flex items-center justify-center gap-2 rounded-md border border-paper-200 px-3 py-2 text-sm text-ink-600 hover:bg-paper-100 hover:text-ink-800"
          >
            <LogOut size={14} />
            Sign out
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2 overflow-y-auto p-4">
          <p className="text-xs text-ink-500">
            Sign in with a password instead of waiting on a magic-link email each time.
          </p>
          <form onSubmit={handleSubmit} className="mt-1 flex flex-col gap-2">
            <label htmlFor="password" className="text-xs font-medium uppercase tracking-wide text-ink-500">
              New password
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={MIN_PASSWORD_LENGTH}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPasswordValue(e.target.value)}
              className="rounded-md border border-paper-200 bg-paper-50 px-3 py-2 text-sm text-ink-800 outline-none focus:border-accent-500"
            />
            <label htmlFor="confirm" className="text-xs font-medium uppercase tracking-wide text-ink-500">
              Confirm password
            </label>
            <input
              id="confirm"
              type="password"
              required
              minLength={MIN_PASSWORD_LENGTH}
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="rounded-md border border-paper-200 bg-paper-50 px-3 py-2 text-sm text-ink-800 outline-none focus:border-accent-500"
            />
            <button
              type="submit"
              disabled={setPassword.isPending}
              className="mt-1 rounded-md bg-ink-800 px-3 py-2 text-sm font-medium text-paper-50 transition-colors hover:bg-ink-700 disabled:opacity-60"
            >
              {setPassword.isPending ? "Saving…" : "Save password"}
            </button>
            {mismatch && <p className="text-xs text-red-700">Passwords don&apos;t match.</p>}
            {setPassword.isError && <p className="text-xs text-red-700">{setPassword.error.message}</p>}
            {saved && <p className="text-xs text-emerald-700">Password saved.</p>}
          </form>
        </div>
      )}
    </Modal>
  );
}
