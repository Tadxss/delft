import { ImageResponse } from "next/og";
import { CROW_MARK_PATH, CROW_MARK_VIEWBOX } from "./_components/CrowMark";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Link-preview card (OG + Twitter, since layout.tsx sets twitter.card without a dedicated image —
// Next.js falls back to this file for both). Auto-picked-up by file convention, no metadata.images
// wiring needed. Same mark/colors as icon.tsx/apple-icon.tsx, just laid out with the wordmark.
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 28,
          background: "#111318",
        }}
      >
        <svg
          width="160"
          height="96"
          viewBox={CROW_MARK_VIEWBOX}
          fill="#8b5cf6"
        >
          <path d={CROW_MARK_PATH} />
        </svg>
        <div
          style={{
            fontSize: 72,
            fontWeight: 700,
            color: "#f8fafc",
            fontFamily: "sans-serif",
          }}
        >
          CrowScribe
        </div>
        <div
          style={{
            fontSize: 28,
            color: "#a0a8b8",
            fontFamily: "sans-serif",
          }}
        >
          Where ideas take flight.
        </div>
      </div>
    ),
    { ...size },
  );
}
