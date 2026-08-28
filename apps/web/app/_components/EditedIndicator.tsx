"use client";

import { useEffect, useState } from "react";
import { formatRelativeTime } from "../_lib/formatRelativeTime";

// Low-key "Edited 40m ago" line (see PageEditor's top bar). Ticks itself once a minute so idle
// relative time stays fresh; the timestamp prop itself refreshes on every autosave via the
// ["page", id] query cache.
export function EditedIndicator({ timestamp }: { timestamp: string }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const rel = formatRelativeTime(timestamp);
  if (!rel) return null;
  return (
    <span className="whitespace-nowrap text-xs text-ink-400">Edited {rel}</span>
  );
}
