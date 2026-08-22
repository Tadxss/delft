"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

// Shown exactly once, right after a recovery key is generated (fresh vault setup, or a legacy
// vault's one-time migration) — this is the only moment the plaintext recovery key ever exists
// outside the user's own storage of it; nothing server-side can ever redisplay it. The "I've saved
// this" checkbox is a deliberate friction point, not just decoration: Continue stays disabled until
// it's checked, since skipping this step silently would leave someone with no way back in if they
// ever forget their passphrase.
export function RecoveryKeyDisplay({
  recoveryKey,
  onContinue,
  continuing,
}: {
  recoveryKey: string;
  onContinue: () => void;
  continuing: boolean;
}) {
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(recoveryKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex flex-1 items-center p-10">
      <div className="mx-auto w-full max-w-sm">
        <h2 className="text-sm font-medium text-ink-800">
          Save your recovery key
        </h2>
        <p className="mt-1 text-xs text-ink-500">
          If you ever forget this vault&apos;s passphrase, this recovery key is
          the only other way back in — it&apos;s never shown again, and nobody,
          including us, can retrieve it for you.
        </p>
        <div className="mt-4 flex items-center justify-between gap-2 rounded-md border border-paper-200 bg-paper-100 px-3 py-2">
          <code className="break-all text-sm text-ink-800">{recoveryKey}</code>
          <button
            type="button"
            onClick={handleCopy}
            aria-label="Copy recovery key"
            className="flex shrink-0 items-center gap-1 rounded px-2 py-1 text-xs text-ink-500 hover:bg-paper-50 hover:text-ink-800"
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <label className="mt-4 flex items-start gap-2 text-xs text-ink-500">
          <input
            type="checkbox"
            checked={saved}
            onChange={(e) => setSaved(e.target.checked)}
            className="mt-0.5"
          />
          I&apos;ve saved this recovery key somewhere safe.
        </label>
        <button
          type="button"
          disabled={!saved || continuing}
          onClick={onContinue}
          className="mt-3 w-full rounded-md bg-ink-800 px-3 py-2 text-sm font-medium text-paper-50 transition-colors hover:bg-ink-700 disabled:opacity-60"
        >
          {continuing ? "Saving…" : "Continue"}
        </button>
      </div>
    </div>
  );
}
