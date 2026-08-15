import { createCodeBlockConfig } from "@blocknote/core";
import { codeBlockOptions } from "@blocknote/code-block";

// Shared between `customCodeBlockSpec.tsx` (assembles the block spec) and `CodeBlockView.tsx`
// (needs the config's type for its render props) — split out to avoid those two importing
// each other.
export const codeBlockConfig = createCodeBlockConfig(codeBlockOptions);
