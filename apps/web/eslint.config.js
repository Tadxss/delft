import { nextJsConfig } from "@delft/eslint-config/next-js";

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...nextJsConfig,
  // Node-executed tool config, not application source — needs Node globals (`process`) the shared
  // browser/React-focused config doesn't provide.
  { ignores: ["postcss.config.cjs", "tailwind.config.cjs", "next.config.js"] },
];
