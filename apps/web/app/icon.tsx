import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

// Next.js's file-based icon convention — generated at request time via `next/og`'s built-in
// ImageResponse (zero-cost, no external service), embedding the real logo (public/logo.png) as a
// base64 data URI rather than redrawing it. Letting ImageResponse/Satori downscale it to 32x32
// here means this route serves a small PNG, not the ~1MB source master. The source image already
// has its own dark rounded-square card baked into the pixels, so no extra background is added.
export default function Icon() {
  const logo = readFileSync(join(process.cwd(), "public", "logo.png")).toString("base64");
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- ImageResponse (Satori) requires a plain <img>, not next/image */}
        <img
          src={`data:image/png;base64,${logo}`}
          width={size.width}
          height={size.height}
          alt=""
        />
      </div>
    ),
    { ...size },
  );
}
