import { nextJsConfig } from "@crowscribe/eslint-config/next-js";

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...nextJsConfig,
  // Node-executed tool config, not application source — needs Node globals (`process`) the shared
  // browser/React-focused config doesn't provide.
  { ignores: ["postcss.config.cjs", "tailwind.config.cjs", "next.config.js"] },
  {
    // next/og's ImageResponse (Satori) only accepts a plain <img>, so no-img-element has to be
    // off for the metadata route files. @next/next/no-img-element 16.3.0 has its own skip for
    // these, but it misfires on Windows paths (a non-global `path.sep` replace), so `pnpm lint`
    // passes locally while flagging the inline disables as "unused directive" on Linux CI — turn
    // the rule off here explicitly instead of relying on inline disables.
    files: [
      "app/**/icon.tsx",
      "app/**/apple-icon.tsx",
      "app/**/opengraph-image.tsx",
      "app/**/twitter-image.tsx",
    ],
    rules: { "@next/next/no-img-element": "off" },
  },
];
