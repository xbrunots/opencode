import { useCallback, useEffect, useState } from "react";

/**
 * True while a scroll container has content below its visible area, so the
 * sidebar can fade the last rows into the footer instead of cutting them off.
 */
export function useScrollMore<T extends HTMLElement>() {
  const [element, setElement] = useState<T | null>(null);
  const [hasMore, setHasMore] = useState(false);

  const update = useCallback(() => {
    if (!element) {
      return;
    }
    const { clientHeight, scrollHeight, scrollTop } = element;
    setHasMore(scrollTop + clientHeight < scrollHeight - 1);
  }, [element]);

  useEffect(() => {
    if (!element) {
      return;
    }
    update();
    element.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(element);
    for (const child of element.children) {
      observer.observe(child);
    }
    return () => {
      element.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, [element, update]);

  return { hasMore, ref: setElement };
}
