const rtf = new Intl.RelativeTimeFormat(undefined, {
  numeric: "auto",
  style: "narrow",
});

// Notion-style "edited" timestamp: "just now" → "40m ago" → "3h ago" → "2d ago", then an absolute
// date ("May 9", or "May 9, 2024" once the year differs) past a week. Built-in Intl only — no date
// library (matches the repo's deliberately-lean dependency set).
export function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const sec = Math.round((Date.now() - then) / 1000);
  if (sec < 45) return "just now";
  const min = Math.round(sec / 60);
  if (min < 60) return rtf.format(-min, "minute");
  const hr = Math.round(min / 60);
  if (hr < 24) return rtf.format(-hr, "hour");
  const day = Math.round(hr / 24);
  if (day < 7) return rtf.format(-day, "day");
  const d = new Date(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}
