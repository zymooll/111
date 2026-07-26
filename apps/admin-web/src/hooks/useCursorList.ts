import { useCallback, useEffect, useRef, useState } from 'react';
import type { CursorPage, CursorQuery } from '../types';

export type PageLoader<T> = (query: CursorQuery, signal: AbortSignal) => Promise<CursorPage<T>>;

export interface CursorListResult<T> {
  items: T[];
  loading: boolean;
  /** Only set for endpoints that report a total; never invent one for the others. */
  total?: number;
  pageNumber: number;
  hasPrevious: boolean;
  hasNext: boolean;
  next: () => void;
  previous: () => void;
  /** Re-reads the page currently on screen. */
  reload: () => void;
  /** Jumps back to the newest page, e.g. after creating a record. */
  reset: () => void;
}

interface CursorStack {
  cursors: Array<string | null>;
  index: number;
}

const firstPage: CursorStack = { cursors: [null], index: 0 };

/**
 * Walks a keyset endpoint by remembering the cursor of every visited page, which is what the
 * admin tables need because the API deliberately exposes no offset.
 */
export function useCursorList<T>(
  load: PageLoader<T>,
  limit: number,
  onError: (error: unknown) => void,
): CursorListResult<T> {
  const [tracked, setTracked] = useState(() => load);
  const [stack, setStack] = useState<CursorStack>(firstPage);
  const [items, setItems] = useState<T[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState<number>();
  const [loading, setLoading] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);
  const errorHandler = useRef(onError);
  errorHandler.current = onError;

  if (tracked !== load) {
    setTracked(() => load);
    setStack(firstPage);
  }

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    tracked({ cursor: stack.cursors[stack.index], limit }, controller.signal)
      .then((page) => {
        if (controller.signal.aborted) return;
        setItems(page.items);
        setNextCursor(page.nextCursor);
        setHasMore(page.hasMore);
        setTotal(page.total);
        setLoading(false);
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setItems([]);
        setNextCursor(null);
        setHasMore(false);
        setTotal(undefined);
        setLoading(false);
        errorHandler.current(error);
      });
    return () => controller.abort();
  }, [tracked, stack, limit, reloadToken]);

  const next = useCallback(() => {
    setStack((current) => {
      if (!nextCursor) return current;
      return { cursors: [...current.cursors.slice(0, current.index + 1), nextCursor], index: current.index + 1 };
    });
  }, [nextCursor]);

  const previous = useCallback(() => {
    setStack((current) => (current.index === 0 ? current : { cursors: current.cursors, index: current.index - 1 }));
  }, []);

  return {
    items,
    loading,
    total,
    pageNumber: stack.index + 1,
    hasPrevious: stack.index > 0,
    hasNext: hasMore && nextCursor !== null,
    next,
    previous,
    reload: useCallback(() => setReloadToken((token) => token + 1), []),
    reset: useCallback(() => setStack({ cursors: [null], index: 0 }), []),
  };
}
