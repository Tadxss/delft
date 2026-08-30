import { useEffect } from "react";

// Warns the user (native "Leave site?" dialog) before a tab close / reload / cross-origin
// navigation while `getDirty()` reports unsaved work. Used by PageEditor / CanvasEditor whose
// autosave is a ~800ms debounce — closing the tab inside that window (or during a retry) would
// otherwise drop the last edit silently. In-app SPA navigation doesn't fire `beforeunload`; the
// editors handle that separately by flushing the pending patch in their unmount cleanup.
export function useBeforeUnloadWarning(getDirty: () => boolean): void {
  useEffect(() => {
    function handler(e: BeforeUnloadEvent) {
      if (!getDirty()) return;
      e.preventDefault();
      // Legacy Chrome needs returnValue set; the string is ignored by modern browsers, which
      // show their own generic message.
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [getDirty]);
}
