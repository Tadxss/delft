"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuthUser, useSetPassword } from "@delft/shared";
import { AuthGate } from "../_components/AuthGate";

const MIN_PASSWORD_LENGTH = 8;

function SetPasswordForm() {
  const { user } = useAuthUser();
  const setPassword = useSetPassword();
  const [password, setPasswordValue] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saved, setSaved] = useState(false);
  const [mismatch, setMismatch] = useState(false);

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

  return (
    <div className="w-full max-w-sm rounded-lg border border-paper-200 bg-paper-100 p-6 shadow-sm">
      <h2 className="text-sm font-medium text-ink-800">Set a password</h2>
      <p className="mt-1 text-xs text-ink-500">
        Sign in with a password instead of waiting on a magic-link email each time, for{" "}
        <span className="font-medium text-ink-700">{user?.email}</span>.
      </p>
      <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3">
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
  );
}

export default function AccountPage() {
  return (
    <AuthGate>
      <main className="flex min-h-screen flex-col items-center gap-6 px-6 pt-20">
        <div className="flex w-full max-w-sm items-center justify-between">
          <h1 className="text-xl font-semibold tracking-tight text-ink-800">Account</h1>
          <Link href="/workspace" className="text-sm text-ink-500 hover:text-ink-800">
            Back
          </Link>
        </div>
        <SetPasswordForm />
      </main>
    </AuthGate>
  );
}
