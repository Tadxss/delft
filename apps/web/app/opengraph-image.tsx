import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Link-preview card (OG + Twitter, since layout.tsx sets twitter.card without a dedicated image —
// Next.js falls back to this file for both). Auto-picked-up by file convention, no metadata.images
// wiring needed. Same embedded logo as icon.tsx/apple-icon.tsx, laid out with the wordmark.
export default function OpengraphImage() {
  const logo = readFileSync(join(process.cwd(), "public", "logo.png")).toString("base64");
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
        {/* eslint-disable-next-line @next/next/no-img-element -- ImageResponse (Satori) requires a plain <img>, not next/image */}
        <img
          src={`data:image/png;base64,${logo}`}
          width={140}
          height={140}
          alt=""
        />
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
