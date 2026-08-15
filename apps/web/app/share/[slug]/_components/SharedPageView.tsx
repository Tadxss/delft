"use client";

import { useTheme } from "next-themes";
import { BlockNoteView } from "@blocknote/mantine";
import { useCreateBlockNote } from "@blocknote/react";
import type { PartialBlock } from "@blocknote/core";
import { syntaxHighlighter } from "@blocknote/code-block";
import "@blocknote/mantine/style.css";
import { resolveBlockNoteTheme } from "../../../_lib/blocknoteTheme";
import { restrictedBlockSchema } from "../../../_lib/blocknoteSchema";

// Mounting BlockNote itself in read-only mode (rather than a server-side blocks->HTML export) —
// @blocknote/server-util's ServerBlockNoteEditor pulls in @blocknote/react's client-only
// react-dom/client APIs at module scope, which breaks under Next's Turbopack RSC bundling
// ("createContext is not a function") when imported from a Server Component. A read-only client
// view sidesteps that entirely and is still exactly what the plan asked for: no editor chrome, no
// drag handles, no toolbar — every one of BlockNote's default UI pieces is explicitly disabled
// below, leaving just the rendered content.
function toInitialContent(content: unknown): PartialBlock[] | undefined {
  return Array.isArray(content) && content.length > 0
    ? (content as PartialBlock[])
    : undefined;
}

export function SharedPageView({ content }: { content: unknown }) {
  const { resolvedTheme } = useTheme();
  const editor = useCreateBlockNote({
    schema: restrictedBlockSchema,
    extensions: [syntaxHighlighter],
    initialContent: toInitialContent(content),
  });

  return (
    <BlockNoteView
      editor={editor}
      editable={false}
      theme={resolveBlockNoteTheme(resolvedTheme)}
      formattingToolbar={false}
      linkToolbar={false}
      sideMenu={false}
      slashMenu={false}
      filePanel={false}
      tableHandles={false}
      emojiPicker={false}
      comments={false}
    />
  );
}
