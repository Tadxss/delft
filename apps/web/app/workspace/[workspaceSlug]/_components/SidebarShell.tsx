"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { Sidebar } from "./Sidebar";

const STORAGE_KEY = "delft-sidebar-collapsed";

// A plain localStorage boolean rather than pulling in a state library — this is one flag, and
// next-themes' pattern (read on mount, avoid rendering the collapsed-vs-expanded choice until
// then) is overkill for something with no light/dark-style flash-of-wrong-content risk: the
// sidebar is always visible either way, so there's nothing to briefly render incorrectly.
//
// Below `md`, the desktop collapsed-rail/expanded-sidebar split above is hidden entirely in favor
// of an off-canvas drawer (fixed toggle + backdrop + sliding panel) — a fixed `w-64` sidebar would
// otherwise consume most of a phone-width viewport. `mobileOpen` is deliberately not persisted
// (unlike `collapsed`): it's a transient overlay state, not a layout preference.
export function SidebarShell() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setCollapsed(window.localStorage.getItem(STORAGE_KEY) === "true");
  }, []);

  // Navigating to a page/canvas (via the drawer's own Sidebar) should close the drawer — otherwise
  // the overlay persists on top of whatever was just navigated to.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  function setAndPersist(value: boolean) {
    setCollapsed(value);
    window.localStorage.setItem(STORAGE_KEY, String(value));
  }

  const desktopSidebar = collapsed ? (
    <div className="hidden w-10 shrink-0 flex-col items-center border-r border-paper-200 bg-paper-50 py-3 md:flex">
      <button
        type="button"
        onClick={() => setAndPersist(false)}
        aria-label="Expand sidebar"
        className="rounded px-1.5 py-0.5 text-ink-500 hover:bg-paper-100 hover:text-ink-800"
      >
        <Menu size={14} />
      </button>
    </div>
  ) : (
    <div className="hidden md:flex">
      <Sidebar onCollapse={() => setAndPersist(true)} />
    </div>
  );

  return (
    <>
      {desktopSidebar}

      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        aria-label="Open sidebar"
        className="fixed left-2 top-14 z-30 rounded-md border border-paper-200 bg-paper-50 p-1.5 text-ink-500 shadow-sm hover:bg-paper-100 hover:text-ink-800 md:hidden"
      >
        <Menu size={16} />
      </button>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            role="presentation"
            className="absolute inset-0 bg-black/50"
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute inset-y-0 left-0">
            <Sidebar onCollapse={() => setMobileOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}
