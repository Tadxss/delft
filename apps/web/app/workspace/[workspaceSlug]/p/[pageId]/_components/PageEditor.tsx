"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { BlockNoteView } from "@blocknote/mantine";
import { useCreateBlockNote } from "@blocknote/react";
import type { PartialBlock } from "@blocknote/core";
import "@blocknote/mantine/style.css";
import imageCompression from "browser-image-compression";
import type { Page } from "@delft/types";
import {
  useDeletePage,
  usePublishPage,
  useUnpublishPage,
  useUpdatePage,
  useUploadPageImage,
} from "@delft/shared";
import { resolveBlockNoteTheme } from "../../../../../_lib/blocknoteTheme";
import { restrictedBlockSchema } from "../../../../../_lib/blocknoteSchema";

const AUTOSAVE_DEBOUNCE_MS = 800;

// `content` is stored as jsonb (default `[]`) — BlockNote's `initialContent` option requires a
// non-empty array (it throws otherwise), so an empty/never-edited page falls back to `undefined`,
// which makes BlockNote seed its own single empty paragraph.
function toInitialContent(content: unknown): PartialBlock[] | undefined {
  return Array.isArray(content) && content.length > 0 ? (content as PartialBlock[]) : undefined;
}

export function PageEditor({ page }: { page: Page }) {
  const router = useRouter();
  const { resolvedTheme } = useTheme();
  const updatePage = useUpdatePage();
  const deletePage = useDeletePage();
  const publishPage = usePublishPage();
  const unpublishPage = useUnpublishPage();
  const uploadImage = useUploadPageImage();

  const [title, setTitle] = useState(page.title);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // scheduleSave can be called for title and content independently (e.g. typing the title, then
  // typing content, both within the debounce window) — accumulate into one pending patch rather
  // than letting the later call's fields silently replace the earlier call's, which would drop
  // whichever field was edited first.
  const pendingPatch = useRef<{ title?: string; content?: unknown }>({});

  // Recreate the editor when navigating to a different page (deps: [page.id]) — BlockNote's
  // initialContent is read once at creation time only, it isn't reactive to prop changes.
  const editor = useCreateBlockNote(
    {
      schema: restrictedBlockSchema,
      initialContent: toInitialContent(page.content),
      uploadFile: async (file) => {
        // Resize/convert/strip-EXIF client-side before it ever leaves the browser — keeps
        // Storage usage well inside the free tier's 1GB and avoids uploading a raw phone photo's
        // embedded location data. See supabase/migrations' storage migration for the bucket/path
        // convention this feeds into.
        const compressed = await imageCompression(file, {
          maxWidthOrHeight: 1920,
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
      pendingPatch.current = {};
    };
  }, [page.id]);

  function scheduleSave(patch: { title?: string; content?: unknown }) {
    pendingPatch.current = { ...pendingPatch.current, ...patch };
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const toSave = pendingPatch.current;
      pendingPatch.current = {};
      updatePage.mutate({ id: page.id, ...toSave });
    }, AUTOSAVE_DEBOUNCE_MS);
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

  function handleDelete() {
    if (!window.confirm("Delete this page and all of its sub-pages?")) return;
    deletePage.mutate(
      { id: page.id, workspaceId: page.workspaceId },
      // Bare workspace id, no slug prefix — parseWorkspaceSlug() falls back to treating a
      // slug-less param as the id directly, so this doesn't need the workspace's name in hand.
      { onSuccess: () => router.push(`/workspace/${page.workspaceId}`) },
    );
  }

  return (
    <div className="mx-auto flex h-full max-w-4xl flex-col gap-4 px-8 pb-10 pt-28">
      <div className="flex items-start justify-between gap-4">
        <input
          value={title}
          onChange={(e) => handleTitleChange(e.target.value)}
          placeholder="Untitled"
          className="w-full flex-1 border-none bg-transparent text-4xl font-bold text-ink-800 outline-none placeholder:text-ink-400"
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
          <button
            type="button"
            onClick={handleDelete}
            className="rounded-md px-2 py-1.5 text-xs text-ink-400 hover:bg-paper-100 hover:text-red-700"
          >
            Delete
          </button>
        </div>
      </div>

      {shareUrl && (
        <div className="flex items-center gap-2 rounded-md bg-paper-100 px-3 py-2 text-xs text-ink-600">
          <span>Live at</span>
          <a href={shareUrl} target="_blank" rel="noreferrer" className="truncate underline">
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
