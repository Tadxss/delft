"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { AnimatePresence, m } from "motion/react";
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

  const desktopSidebar = (
    <div className="hidden md:flex">
      <m.div
        className="shrink-0 overflow-hidden"
        animate={{ width: collapsed ? 40 : 256 }}
        transition={{ duration: 0.18, ease: "easeInOut" }}
      >
        <AnimatePresence mode="wait" initial={false}>
          {collapsed ? (
            <m.div
              key="rail"
              className="flex h-full w-10 flex-col items-center border-r border-paper-200 bg-paper-50 py-3"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }}
            >
              <button
                type="button"
                onClick={() => setAndPersist(false)}
                aria-label="Expand sidebar"
                className="rounded px-1.5 py-0.5 text-ink-500 hover:bg-paper-100 hover:text-ink-800"
              >
                <Menu size={14} />
              </button>
            </m.div>
          ) : (
            <m.div
              key="full"
              className="w-64"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }}
            >
              <Sidebar onCollapse={() => setAndPersist(true)} />
            </m.div>
          )}
        </AnimatePresence>
      </m.div>
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

      <AnimatePresence>
        {mobileOpen && (
          <div className="fixed inset-0 z-40 md:hidden">
            <m.div
              role="presentation"
              className="absolute inset-0 bg-black/50"
              onClick={() => setMobileOpen(false)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            />
            <m.div
              className="absolute inset-y-0 left-0"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
              <Sidebar onCollapse={() => setMobileOpen(false)} />
            </m.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
