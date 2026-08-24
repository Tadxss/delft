import { ImageResponse } from "next/og";
import { CROW_MARK_PATH, CROW_MARK_VIEWBOX } from "./_components/CrowMark";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// iOS home-screen icon convention (apple-touch-icon), auto-picked-up by Next.js the same way as
// icon.tsx — same mark/colors, just larger and without rounded corners (iOS applies its own mask).
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#111318",
        }}
      >
        <svg
          width="124"
          height="74.4"
          viewBox={CROW_MARK_VIEWBOX}
          fill="#f8fafc"
        >
          <path d={CROW_MARK_PATH} />
        </svg>
      </div>
    ),
    { ...size },
  );
}
