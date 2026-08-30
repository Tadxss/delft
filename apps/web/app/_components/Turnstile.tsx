"use client";

import { useEffect, useRef } from "react";

// Cloudflare Turnstile widget for the login page (Milestone C / item 15 — bot protection on the
// magic-link "signup" and password sign-in). Renders nothing when NEXT_PUBLIC_TURNSTILE_SITE_KEY
// is unset (local dev without a key, or if we ever disable it), in which case the parent passes
// no captchaToken and Supabase — with captcha disabled — accepts the request unchanged.
//
// `resetKey` — bump it in the parent after each auth attempt to force a fresh single-use token.

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
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

  useEffect(() => {
    if (!SITE_KEY || !containerRef.current) return;
    const el = containerRef.current;
    let widgetId: string | undefined;
    let cancelled = false;

    void loadScript()
      .then(() => {
        if (cancelled || !window.turnstile) return;
        el.innerHTML = "";
        widgetId = window.turnstile.render(el, {
          sitekey: SITE_KEY,
          callback: onVerify,
          "expired-callback": onExpire,
          "error-callback": onExpire,
          theme: "auto",
        });
      })
      .catch(() => {
        // Script blocked / offline — the parent will just not get a token. If captcha is
        // required server-side the sign-in attempt fails with a clear Supabase error.
      });

    return () => {
      cancelled = true;
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
    };
    // resetKey in deps: bumping it re-runs this effect → a fresh widget + token.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  if (!SITE_KEY) return null;
  return <div ref={containerRef} className="flex justify-center" />;
}
