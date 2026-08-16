"use client";

import { useEffect, useState } from "react";
import { PanelLeftOpen } from "lucide-react";
import { Sidebar } from "./Sidebar";

const STORAGE_KEY = "delft-sidebar-collapsed";

// A plain localStorage boolean rather than pulling in a state library — this is one flag, and
// next-themes' pattern (read on mount, avoid rendering the collapsed-vs-expanded choice until
// then) is overkill for something with no light/dark-style flash-of-wrong-content risk: the
// sidebar is always visible either way, so there's nothing to briefly render incorrectly.
export function SidebarShell() {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setCollapsed(window.localStorage.getItem(STORAGE_KEY) === "true");
  }, []);

  function setAndPersist(value: boolean) {
    setCollapsed(value);
    window.localStorage.setItem(STORAGE_KEY, String(value));
  }

  if (collapsed) {
    return (
      <div className="flex w-10 shrink-0 flex-col items-center border-r border-paper-200 bg-paper-50 py-3">
        <button
          type="button"
          onClick={() => setAndPersist(false)}
          aria-label="Expand sidebar"
          className="rounded px-1.5 py-0.5 text-ink-500 hover:bg-paper-100 hover:text-ink-800"
        >
          <PanelLeftOpen size={14} />
        </button>
      </div>
    );
  }

  return <Sidebar onCollapse={() => setAndPersist(true)} />;
}
