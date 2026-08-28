import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// iOS home-screen icon convention (apple-touch-icon), auto-picked-up by Next.js the same way as
// icon.tsx — same embedded logo, just rendered larger (iOS applies its own rounding mask on top).
export default function AppleIcon() {
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
        {/* Satori's <img> — see eslint.config.js for why no-img-element is off in metadata routes */}
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
