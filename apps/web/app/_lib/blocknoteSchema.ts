import { BlockNoteSchema, defaultBlockSpecs } from "@blocknote/core";

// Video/Audio/File are deliberately held back for a future paid tier — not implemented as an
// access-control/role check, just not offered as insertable block types at all right now. An
// explicit allow-list (rather than destructuring the three out of defaultBlockSpecs) means a
// future BlockNote upgrade adding a new media block type doesn't silently become available here
// too — it only ships once someone deliberately adds it to this list.
//
// Removing them from the schema (rather than just filtering the slash-menu UI) makes them
// unreachable via every insertion path — slash menu, the side "+" picker, drag-and-drop, and
// paste-to-embed — since their extensions are never registered, not just hidden from one menu.
export const restrictedBlockSchema = BlockNoteSchema.create({
  blockSpecs: {
    paragraph: defaultBlockSpecs.paragraph,
    heading: defaultBlockSpecs.heading,
    quote: defaultBlockSpecs.quote,
    bulletListItem: defaultBlockSpecs.bulletListItem,
    numberedListItem: defaultBlockSpecs.numberedListItem,
    checkListItem: defaultBlockSpecs.checkListItem,
    toggleListItem: defaultBlockSpecs.toggleListItem,
    codeBlock: defaultBlockSpecs.codeBlock,
    table: defaultBlockSpecs.table,
    divider: defaultBlockSpecs.divider,
    image: defaultBlockSpecs.image,
  },
});
