"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { BlockNoteView } from "@blocknote/mantine";
import { useCreateBlockNote } from "@blocknote/react";
import type { PartialBlock } from "@blocknote/core";
import { syntaxHighlighter } from "@blocknote/code-block";
import "@blocknote/mantine/style.css";
import imageCompression from "browser-image-compression";
import type { Page } from "@crowscribe/types";
import {
  usePublishPage,
  useUnpublishPage,
  useUpdatePage,
  useUploadPageImage,
} from "@crowscribe/shared";
import { HEADING_CLASSES } from "../../../../../_components/Heading";
import { resolveBlockNoteTheme } from "../../../../../_lib/blocknoteTheme";
import { restrictedBlockSchema } from "../../../../../_lib/blocknoteSchema";

const AUTOSAVE_DEBOUNCE_MS = 800;
const AUTOSAVE_RETRY_MS = 2000;

// `content` is stored as jsonb (default `[]`) — BlockNote's `initialContent` option requires a
// non-empty array (it throws otherwise), so an empty/never-edited page falls back to `undefined`,
// which makes BlockNote seed its own single empty paragraph.
function toInitialContent(content: unknown): PartialBlock[] | undefined {
  return Array.isArray(content) && content.length > 0
    ? (content as PartialBlock[])
    : undefined;
}

export function PageEditor({ page }: { page: Page }) {
  const { resolvedTheme } = useTheme();
  const updatePage = useUpdatePage();
  const publishPage = usePublishPage();
  const unpublishPage = useUnpublishPage();
  const uploadImage = useUploadPageImage();

  const [title, setTitle] = useState(page.title);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // scheduleSave can be called for title and content independently (e.g. typing the title, then
  // typing content, both within the debounce window) — accumulate into one pending patch rather
  // than letting the later call's fields silently replace the earlier call's, which would drop
  // whichever field was edited first.
  const pendingPatch = useRef<{ title?: string; content?: unknown }>({});
  // Guards against overlapping in-flight saves: Postgres gives no ordering guarantee between two
  // independent PATCH requests, so if a second save fired while the first was still in flight, the
  // one that finishes last on the server wins — which could be the older edit clobbering the
  // newer one. flush() only ever lets one mutate() be in flight at a time, chaining the next one
  // (if edits piled up meanwhile) off its onSettled instead.
  const saving = useRef(false);

  // Recreate the editor when navigating to a different page (deps: [page.id]) — BlockNote's
  // initialContent is read once at creation time only, it isn't reactive to prop changes.
  const editor = useCreateBlockNote(
    {
      schema: restrictedBlockSchema,
      extensions: [syntaxHighlighter],
      initialContent: toInitialContent(page.content),
      uploadFile: async (file) => {
        // Resize/convert/strip-EXIF client-side before it ever leaves the browser — keeps
        // Storage usage well inside the free tier's 1GB and avoids uploading a raw phone photo's
        // embedded location data. See supabase/migrations' storage migration for the bucket/path
        // convention this feeds into.
        const compressed = await imageCompression(file, {
          maxWidthOrHeight: 1920,
          maxSizeMB: 0.5,
          fileType: "image/webp",
          useWebWorker: true,
          exifOrientation: 1, // normalize orientation, then strip the EXIF block itself
        });
        return uploadImage.mutateAsync({
          workspaceId: page.workspaceId,
          pageId: page.id,
          file: compressed,
        });
      },
    },
    [page.id],
  );

  useEffect(() => {
    setTitle(page.title);
  }, [page.id, page.title]);

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (retryTimer.current) clearTimeout(retryTimer.current);
      pendingPatch.current = {};
    };
  }, [page.id]);

  // Sends whatever's accumulated in pendingPatch, serialized so at most one mutate() is ever in
  // flight — see the `saving` ref's comment above for why. On error, the failed patch is merged
  // back (newer edits still win) and retried once after a short fixed delay rather than looping
  // indefinitely against a possibly-offline connection; updatePage.isError still surfaces the
  // failure below if that retry doesn't land either.
  function flush() {
    if (saving.current) return;
    const toSave = pendingPatch.current;
    if (Object.keys(toSave).length === 0) return;
    pendingPatch.current = {};
    saving.current = true;
    let hadError = false;
    updatePage.mutate(
      { id: page.id, ...toSave },
      {
        onError: () => {
          hadError = true;
          pendingPatch.current = { ...toSave, ...pendingPatch.current };
          retryTimer.current = setTimeout(flush, AUTOSAVE_RETRY_MS);
        },
        onSettled: () => {
          saving.current = false;
          // On success, more edits may have piled up in pendingPatch while this request was in
          // flight — send them now instead of waiting for the next debounce, so writes reach the
          // server strictly in order. On error, skip this: the retryTimer above already owns
          // resending `toSave`, and flushing immediately here would race ahead of it.
          if (!hadError) flush();
        },
      },
    );
  }

  function scheduleSave(patch: { title?: string; content?: unknown }) {
    pendingPatch.current = { ...pendingPatch.current, ...patch };
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(flush, AUTOSAVE_DEBOUNCE_MS);
  }

  function handleTitleChange(value: string) {
    setTitle(value);
    scheduleSave({ title: value });
  }

  function handleContentChange() {
    scheduleSave({ content: editor.document });
  }

  const shareUrl = useMemo(() => {
    if (!page.isPublished || !page.publishedSlug) return null;
    if (typeof window === "undefined") return null;
    return `${window.location.origin}/share/${page.publishedSlug}`;
  }, [page.isPublished, page.publishedSlug]);

  function handlePublishToggle() {
    if (page.isPublished) {
      unpublishPage.mutate({ id: page.id });
    } else {
      publishPage.mutate({ id: page.id, existingSlug: page.publishedSlug });
    }
  }

  return (
    <div className="mx-auto flex h-full max-w-4xl flex-col gap-4 px-4 pb-10 pt-14 sm:px-8 sm:pt-10">
      <div className="flex items-start justify-between gap-4">
        <label htmlFor="page-title" className="sr-only">
          Title
        </label>
        <input
          id="page-title"
          value={title}
          onChange={(e) => handleTitleChange(e.target.value)}
          placeholder="Untitled"
          maxLength={500}
          className={`w-full flex-1 border-none bg-transparent outline-none placeholder:text-ink-400 ${HEADING_CLASSES["content-large"]}`}
        />
        <div className="flex shrink-0 items-center gap-2 pt-2">
          <button
            type="button"
            onClick={handlePublishToggle}
            disabled={publishPage.isPending || unpublishPage.isPending}
            className={`rounded-md px-3 py-1.5 text-xs font-medium ${
              page.isPublished
                ? "bg-accent-500 text-white hover:bg-accent-600"
                : "border border-paper-300 text-ink-600 hover:bg-paper-100"
            }`}
          >
            {page.isPublished ? "Published" : "Publish"}
          </button>
        </div>
      </div>

      {updatePage.isError && (
        <p className="text-xs text-red-700">
          Couldn&apos;t save your last change
          {updatePage.error?.message ? `: ${updatePage.error.message}` : ""}
        </p>
      )}

      {shareUrl && (
        <div className="flex items-center gap-2 rounded-md bg-paper-100 px-3 py-2 text-xs text-ink-600">
          <span>Live at</span>
          <a
            href={shareUrl}
            target="_blank"
            rel="noreferrer"
            className="truncate underline"
          >
            {shareUrl}
          </a>
        </div>
      )}

      <div className="flex-1">
        <BlockNoteView
          editor={editor}
          onChange={handleContentChange}
          theme={resolveBlockNoteTheme(resolvedTheme)}
        />
      </div>
    </div>
  );
}
