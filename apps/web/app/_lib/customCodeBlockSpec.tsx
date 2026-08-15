import {
  parsePreCode,
  parsePreCodeContent,
  plainContentToString,
} from "@blocknote/core";
import {
  createReactBlockSpec,
  type ReactCustomBlockRenderProps,
} from "@blocknote/react";
import { codeBlockOptions } from "@blocknote/code-block";
import { codeBlockConfig } from "./codeBlockConfig";
import { codeBlockKeyboardShortcuts } from "./codeBlockKeyboardShortcuts";
import { CodeBlockView } from "./CodeBlockView";

// React block specs' `toExternalHTML` is a component (unlike the vanilla `{dom, contentDOM}` shape
// `@blocknote/core`'s `createPreCode` returns) — mirrors the same `<pre><code class="language-x"
// data-language="x">` structure so copy-pasting a code block out of the editor still produces
// clean HTML, without dragging the interactive toolbar along with it.
function CodeBlockExternalHTML({
  block,
}: ReactCustomBlockRenderProps<typeof codeBlockConfig> & {
  context: { nestingLevel: number };
}) {
  return (
    <pre>
      <code
        className={`language-${block.props.language}`}
        data-language={block.props.language}
      >
        {plainContentToString(block.content)}
      </code>
    </pre>
  );
}

// A from-scratch `codeBlock` spec, standing in for @blocknote/code-block's
// `createCodeBlockSpec(codeBlockOptions)`. Reuses everything from `@blocknote/core` that's
// actually public (the config/content model, HTML parse/export helpers) and only replaces what
// needed replacing: the rendered UI (a Notion-style language search + copy toolbar instead of the
// bare native <select>) and the keyboard shortcuts (ported locally in
// `codeBlockKeyboardShortcuts.ts`, since that extension isn't part of the public API and there's
// no supported way to override just its `Enter` handling otherwise). `codeBlockOptions`
// (language list) and the `syntaxHighlighter` extension registered in the editor are still the
// same ones from `@blocknote/code-block` — highlighting is keyed off this spec's
// `content: "plain"` + `meta.highlight`, not the concrete implementation, so it keeps working
// unmodified.
export const customCodeBlockSpec = createReactBlockSpec(
  codeBlockConfig,
  {
    meta: {
      code: true,
      defining: true,
      isolating: false,
      highlight: (block) => block.props.language,
    },
    parse: (el) => parsePreCode(el),
    parseContent: (opts) => parsePreCodeContent(opts, "codeBlock"),
    toExternalHTML: CodeBlockExternalHTML,
    render: CodeBlockView,
  },
  [
    codeBlockKeyboardShortcuts(codeBlockOptions)(
      "code-block-keyboard-shortcuts",
      "codeBlock",
    ),
  ],
);
