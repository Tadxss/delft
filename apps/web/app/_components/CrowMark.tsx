// Shared vector mark: a simple, angular bird-in-flight silhouette (sharp wing tips rather than
// soft/rounded, to read as corvid rather than dove-like). One flat fill via `currentColor` so it
// inherits Tailwind text-color classes like every other icon in the app (`lucide-react`'s
// `KeyRound`/`Settings` in TopBar). Kept simple enough to stay legible at 16px (favicon size), not
// just at hero/OG scale — a literal detailed crow (beak, feather texture) turns to mud that small.
export const CROW_MARK_PATH =
  "M2,38 C18,10 32,10 50,26 C68,10 82,10 98,38 C82,30 68,34 58,44 C54,48 46,48 42,44 C32,34 18,30 2,38 Z";
export const CROW_MARK_VIEWBOX = "0 0 100 60";

export function CrowMark({
  size = 20,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={(size * 60) / 100}
      viewBox={CROW_MARK_VIEWBOX}
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d={CROW_MARK_PATH} />
    </svg>
  );
}
