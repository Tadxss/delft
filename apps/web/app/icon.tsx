import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

// Next.js's file-based icon convention — no static asset needed, generated at request time via
// `next/og`'s built-in ImageResponse (zero-cost, no external service). A simple monogram matching
// the app's ink-800/paper-50 palette rather than a designed logo, since there isn't one yet.
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#28251f",
          color: "#faf9f7",
          fontSize: 20,
          fontWeight: 700,
          fontFamily: "sans-serif",
        }}
      >
        D
      </div>
    ),
    { ...size },
  );
}
