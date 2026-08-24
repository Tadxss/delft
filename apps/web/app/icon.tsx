import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

// Next.js's file-based icon convention — no static asset needed, generated at request time via
// `next/og`'s built-in ImageResponse (zero-cost, no external service). A simple monogram matching
// the app's dark-mode paper-50/light-mode paper-50 palette (a fixed dark square regardless of the
// viewer's theme, since a favicon can't respond to prefers-color-scheme) rather than a designed
// logo, since there isn't one yet.
export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#111318",
        color: "#f8fafc",
        fontSize: 20,
        fontWeight: 700,
        fontFamily: "sans-serif",
      }}
    >
      C
    </div>,
    { ...size },
  );
}
