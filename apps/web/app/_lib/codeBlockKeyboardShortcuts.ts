import { createExtension, type CodeBlockOptions } from "@blocknote/core";
import { TextSelection } from "prosemirror-state";

// A local port of @blocknote/core's own (internal, not publicly exported) code block keyboard
// shortcuts, since there's no supported way to override just the `Enter` handling of
// `createCodeBlockSpec` otherwise. One deliberate change from the original: `Enter` no longer has
// an "exit the block after two blank lines" heuristic — it always inserts a newline. That
// heuristic has no visual cue before it fires, so pressing Enter a few times while writing code
// (a normal thing to do) silently kicks you out of the block. Exiting via the keyboard still works
// through normal arrow-key navigation past the block's boundary (the node isn't `isolating`).
function findLanguageId(
  options: CodeBlockOptions,
  languageName: string,
): string | undefined {
  const normalized = languageName.trim().toLowerCase();
  return Object.entries(options.supportedLanguages ?? {}).find(
    ([id, { aliases }]) =>
      id.toLowerCase() === normalized ||
      aliases?.some((alias) => alias.toLowerCase() === normalized),
  )?.[0];
}

export const codeBlockKeyboardShortcuts =
  (options: CodeBlockOptions) => (key: string, blockType: string) =>
    createExtension({
      key,
      keyboardShortcuts: {
        Delete: ({ editor }) =>
          editor.transact((tr) => {
            const { block } = editor.getTextCursorPosition();
            if (block.type !== blockType) {
              return false;
            }
            const { $from } = tr.selection;

            // Empty codeblock: Delete removes the block entirely.
            if (!$from.parent.textContent) {
              editor.removeBlocks([block]);
              return true;
            }

            return false;
          }),
        Tab: ({ editor }) => {
          if (options.indentLineWithTab === false) {
            return false;
          }

          return editor.transact((tr) => {
            const { block } = editor.getTextCursorPosition();
            if (block.type !== blockType) {
              return false;
            }

            tr.insertText("  ");
            return true;
          });
        },
        "Mod-a": ({ editor }) =>
          editor.transact((tr) => {
            const { block } = editor.getTextCursorPosition();
            if (block.type !== blockType) {
              return false;
            }

            const { $from } = tr.selection;
            tr.setSelection(
              TextSelection.create(tr.doc, $from.start(), $from.end()),
            );
            return true;
          }),
        Enter: ({ editor }) =>
          editor.transact((tr) => {
            const { block } = editor.getTextCursorPosition();
            if (block.type !== blockType) {
              return false;
            }

            tr.insertText("\n");
            return true;
          }),
        "Shift-Enter": ({ editor }) =>
          editor.transact(() => {
            const { block } = editor.getTextCursorPosition();
            if (block.type !== blockType) {
              return false;
            }

            const [newBlock] = editor.insertBlocks(
              [{ type: "paragraph" }],
              block,
              "after",
            );
            if (newBlock) {
              editor.setTextCursorPosition(newBlock, "start");
            }
            return true;
          }),
      },
      inputRules: [
        {
          find: /^```(.*?)\s$/,
          replace: ({ match }) => {
            const languageName = (match[1] ?? "").trim();
            return {
              type: blockType,
              props: {
                language: findLanguageId(options, languageName) ?? languageName,
              },
              content: [],
            };
          },
        },
      ],
    });
