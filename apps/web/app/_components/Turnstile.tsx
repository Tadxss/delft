"use client";

import { useEffect, useRef, useState } from "react";

// Cloudflare Turnstile widget for the login page (Milestone C / item 15 — bot protection on the
// magic-link "signup" and password sign-in). Renders nothing when NEXT_PUBLIC_TURNSTILE_SITE_KEY
// is unset (local dev without a key, or if we ever disable it), in which case the parent passes
// no captchaToken and Supabase — with captcha disabled — accepts the request unchanged.
//
// `resetKey` — bump it in the parent after each auth attempt to force a fresh single-use token.

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
export const CAPTCHA_ENABLED = Boolean(SITE_KEY);
const SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

interface TurnstileApi {
  render: (
    el: HTMLElement,
    opts: {
      sitekey: string;
      callback: (token: string) => void;
      "expired-callback"?: () => void;
      "error-callback"?: () => void;
      theme?: "auto" | "light" | "dark";
      size?: "normal" | "flexible" | "compact";
    },
  ) => string;
  remove: (id: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptPromise: Promise<void> | null = null;
function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = SCRIPT_SRC;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("turnstile script failed to load"));
      document.head.appendChild(s);
    });
  }
  return scriptPromise;
}

export function Turnstile({
  onVerify,
  onExpire,
  resetKey,
}: {
  onVerify: (token: string) => void;
  onExpire: () => void;
  resetKey: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!SITE_KEY || !containerRef.current) return;
    const el = containerRef.current;
    let widgetId: string | undefined;
    let cancelled = false;
    setFailed(false);

    // If the widget never issues a token or errors within a generous window, tell the user
    // rather than leaving the sign-in button silently disabled forever.
    const stallTimer = setTimeout(() => {
      if (!cancelled) setFailed(true);
    }, 30_000);

    void loadScript()
      .then(() => {
        if (cancelled || !window.turnstile) return;
        el.innerHTML = "";
        widgetId = window.turnstile.render(el, {
          sitekey: SITE_KEY,
          callback: (token) => {
            clearTimeout(stallTimer);
            onVerify(token);
          },
          "expired-callback": onExpire,
          "error-callback": () => {
            clearTimeout(stallTimer);
            if (!cancelled) setFailed(true);
            onExpire();
          },
          theme: "auto",
        });
      })
      .catch(() => {
        clearTimeout(stallTimer);
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      clearTimeout(stallTimer);
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
    };
    // resetKey in deps: bumping it re-runs this effect → a fresh widget + token.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  if (!SITE_KEY) return null;
  return (
    <div className="flex flex-col items-center gap-1">
      <div ref={containerRef} />
      {failed && (
        <p className="text-xs text-red-700">
          Couldn&apos;t verify you&apos;re human.{" "}
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="underline"
          >
            Reload
          </button>{" "}
          and try again.
        </p>
      )}
    </div>
  );
}
