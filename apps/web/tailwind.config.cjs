// `darkMode: "class"` (toggled by next-themes) + every color below resolving to a CSS custom
// property (defined per-shade in globals.css, light values under :root, dark values under .dark)
// means every existing `text-ink-800` / `bg-paper-50` / etc. utility class across the app keeps
// working unchanged — only the variable each one resolves to flips with the theme, so the redesign
// didn't require touching class names in any component.
/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: {
          50: "var(--paper-50)",
          100: "var(--paper-100)",
          200: "var(--paper-200)",
          300: "var(--paper-300)",
        },
        ink: {
          400: "var(--ink-400)",
          500: "var(--ink-500)",
          600: "var(--ink-600)",
          700: "var(--ink-700)",
          800: "var(--ink-800)",
          900: "var(--ink-900)",
        },
        accent: {
          500: "var(--accent-500)",
          600: "var(--accent-600)",
        },
      },
      fontFamily: {
        // Notion's actual default stack — no webfont file at all, just each OS's native UI font
        // (San Francisco on Mac, Segoe UI on Windows, Roboto on Chrome OS/Android). Free by
        // definition (nothing to load), and it's what makes Notion's UI feel "native" rather than
        // branded/designed — matching that exactly rather than approximating it with Inter.
        sans: [
          "ui-sans-serif",
          "-apple-system",
          "BlinkMacSystemFont",
          '"Segoe UI"',
          "Helvetica",
          '"Apple Color Emoji"',
          "Arial",
          "sans-serif",
          '"Segoe UI Emoji"',
          '"Segoe UI Symbol"',
        ],
      },
    },
  },
  plugins: [],
};
