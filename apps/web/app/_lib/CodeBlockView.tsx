"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { plainContentToString } from "@blocknote/core";
import type { ReactCustomBlockRenderProps } from "@blocknote/react";
import { codeBlockOptions } from "@blocknote/code-block";
import type { codeBlockConfig } from "./codeBlockConfig";

const LANGUAGES = Object.entries(codeBlockOptions.supportedLanguages).map(
  ([id, lang]) => ({
    id,
    name: lang.name,
  }),
);

const FALLBACK_LANGUAGE = {
  id: codeBlockOptions.defaultLanguage,
  name: "Plain Text",
};

function ChevronDownIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
    >
      <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.35-4.35" strokeLinecap="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
    >
      <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
    </svg>
  );
}

// The block's own `render` UI — a language picker (searchable, matching the app's Notion-style
// aesthetic) and a copy button, replacing @blocknote/core's bare native <select>. Toolbar chips
// and the dropdown panel both use the app's paper/ink theme tokens; the code-block surface itself
// is re-themed per light/dark in globals.css (Shiki runs with `defaultColor: false`, so the block
// background — not this component — drives contrast). The `.code-block-toolbar` class is the hook
// for the hover/focus reveal rule, also in globals.css.
export function CodeBlockView({
  block,
  editor,
  contentRef,
}: ReactCustomBlockRenderProps<typeof codeBlockConfig>) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [copied, setCopied] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const currentLanguage =
    LANGUAGES.find((lang) => lang.id === block.props.language) ??
    FALLBACK_LANGUAGE;

  const filteredLanguages = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return LANGUAGES;
    return LANGUAGES.filter((lang) => lang.name.toLowerCase().includes(query));
  }, [search]);

  function closePicker() {
    setPickerOpen(false);
    setSearch("");
  }

  function selectLanguage(id: string) {
    editor.updateBlock(block.id, { props: { language: id } });
    closePicker();
  }

  // Reset the highlighted item to the top match whenever the search results change.
  useEffect(() => {
    setHighlightedIndex(0);
  }, [search]);

  // Auto-scroll the highlighted item into view for keyboard navigation.
  useEffect(() => {
    itemRefs.current[highlightedIndex]?.scrollIntoView({ block: "nearest" });
  }, [highlightedIndex]);

  // Open lifecycle: focus the search box, start the highlight on the current language, and close
  // on an outside click.
  useEffect(() => {
    if (!pickerOpen) return;
    searchInputRef.current?.focus();
    const initialIndex = LANGUAGES.findIndex(
      (lang) => lang.id === currentLanguage.id,
    );
    setHighlightedIndex(initialIndex >= 0 ? initialIndex : 0);

    function handlePointerDown(e: PointerEvent) {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(e.target as Node)
      ) {
        closePicker();
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [pickerOpen, currentLanguage.id]);

  // Keyboard navigation: kept as a separate effect since it needs to stay in sync with the
  // filtered list and the current highlight on every keystroke.
  useEffect(() => {
    if (!pickerOpen) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        closePicker();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlightedIndex((i) =>
          filteredLanguages.length === 0
            ? 0
            : (i + 1) % filteredLanguages.length,
        );
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlightedIndex((i) =>
          filteredLanguages.length === 0
            ? 0
            : (i - 1 + filteredLanguages.length) % filteredLanguages.length,
        );
      } else if (e.key === "Enter") {
        e.preventDefault();
        const lang = filteredLanguages[highlightedIndex];
        if (lang) selectLanguage(lang.id);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickerOpen, filteredLanguages, highlightedIndex]);

  async function handleCopy() {
    const text = plainContentToString(block.content);
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <>
      <div
        ref={wrapperRef}
        className="code-block-toolbar absolute right-2 top-1.5 z-10 flex items-center gap-2"
      >
        {editor.isEditable && (
          <div className="relative">
            <button
              type="button"
              title="Change language"
              aria-haspopup="listbox"
              aria-expanded={pickerOpen}
              onClick={() => (pickerOpen ? closePicker() : setPickerOpen(true))}
              className="flex h-7 items-center gap-1 rounded-md border border-paper-200 bg-paper-100 px-2 text-xs text-ink-700 hover:bg-paper-200 hover:text-ink-900"
            >
              {currentLanguage.name}
              <ChevronDownIcon />
            </button>
            {pickerOpen && (
              <div className="absolute right-0 top-full z-20 mt-1 w-56 overflow-hidden rounded-md border border-paper-200 bg-paper-50 shadow-lg">
                <div className="flex items-center gap-2 border-b border-paper-200 px-2.5 py-1.5 text-ink-400">
                  <SearchIcon />
                  <input
                    ref={searchInputRef}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search for a language..."
                    aria-label="Search for a language"
                    className="w-full bg-transparent text-xs text-ink-800 outline-none placeholder:text-ink-400"
                  />
                </div>
                <div
                  role="listbox"
                  aria-label="Languages"
                  className="max-h-64 overflow-y-auto py-1"
                >
                  {filteredLanguages.map((lang, index) => (
                    <button
                      key={lang.id}
                      ref={(el) => {
                        itemRefs.current[index] = el;
                      }}
                      type="button"
                      role="option"
                      aria-selected={lang.id === currentLanguage.id}
                      onClick={() => selectLanguage(lang.id)}
                      onMouseEnter={() => setHighlightedIndex(index)}
                      className={`flex w-full items-center justify-between px-3 py-1.5 text-left text-xs text-ink-700 ${
                        index === highlightedIndex ? "bg-paper-100" : ""
                      }`}
                    >
                      {lang.name}
                      {lang.id === currentLanguage.id && <CheckIcon />}
                    </button>
                  ))}
                  {filteredLanguages.length === 0 && (
                    <div className="px-3 py-1.5 text-xs text-ink-400">
                      No languages found
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
        <button
          type="button"
          title="Copy code"
          aria-label="Copy code"
          onClick={handleCopy}
          className="flex h-7 w-7 items-center justify-center rounded-md border border-paper-200 bg-paper-100 text-ink-700 hover:bg-paper-200 hover:text-ink-900"
        >
          {copied ? <CheckIcon /> : <CopyIcon />}
        </button>
      </div>
      <pre>
        <code ref={contentRef} />
      </pre>
    </>
  );
}
