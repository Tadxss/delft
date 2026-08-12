import { darkDefaultTheme, lightDefaultTheme, type Theme } from "@blocknote/mantine";

// Notion's own font — no webfont file, just each OS's native UI font. Matches the `sans` stack in
// tailwind.config.cjs; kept as a literal string here too since BlockNote's Theme type wants a CSS
// font-family value directly, not a Tailwind class.
const NOTION_FONT_STACK =
  'ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, "Apple Color Emoji", Arial, sans-serif, "Segoe UI Emoji", "Segoe UI Symbol"';

// BlockNote's literal `theme="dark"`/`"light"` strings use its own hardcoded palette
// (`darkDefaultTheme.colors.editor.background` is `#1F1F1F`), entirely independent of this app's
// `--paper-50` CSS variable — two different dark grays, which is what made the editor look like a
// separate boxed component instead of blending into the page. Spreading BlockNote's own default
// theme (so menus/tooltips/selection colors still look like a real BlockNote theme) but overriding
// the editor's own background/text to transparent/`var(--foreground)`, and its font (BlockNote
// defaults to an Inter-first stack) to the same system stack as the rest of the app, lets the
// editor blend straight into the page instead of reading as a separate, differently-branded widget.
export function resolveBlockNoteTheme(resolvedTheme: string | undefined): Theme {
  const base = resolvedTheme === "dark" ? darkDefaultTheme : lightDefaultTheme;
  return {
    ...base,
    colors: {
      ...base.colors,
      editor: { text: "var(--foreground)", background: "transparent" },
    },
    fontFamily: NOTION_FONT_STACK,
  };
}
