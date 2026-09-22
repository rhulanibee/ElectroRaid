"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  deriveResidentNotices,
  loadNotices,
  mergeNotices,
  noticesEqual,
  saveNotices,
  type ResidentNotice,
} from "@/lib/resident-notices";
import { usePlatform } from "@/lib/use-platform";
import { useSession } from "@/lib/use-session";

function dismissKey(userId: string) {
  return `electroraid.area-dismiss.${userId}`;
}

function loadDismissedIds(userId: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(dismissKey(userId));
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    return new Set(
      Array.isArray(parsed)
        ? parsed.filter((x): x is string => typeof x === "string")
        : [],
    );
  } catch {
    return new Set();
  }
}

function saveDismissedIds(userId: string, ids: Set<string>) {
  localStorage.setItem(
    dismissKey(userId),
    JSON.stringify([...ids].slice(0, 120)),
  );
}

interface NoticesValue {
  items: ResidentNotice[];
  unread: number;
  connected: boolean;
  markRead: (id: string) => void;
  markAllRead: () => void;
  dismissNotice: (id: string) => void;
}

const empty: NoticesValue = {
  items: [],
  unread: 0,
  connected: false,
  markRead: () => {},
  markAllRead: () => {},
  dismissNotice: () => {},
};

const NoticesContext = createContext<NoticesValue>(empty);

export function ResidentNoticesProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { persona } = useSession();
  const { snapshot, connected } = usePlatform();
  const [items, setItems] = useState<ResidentNotice[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());
  const userId = persona?.role === "resident" ? persona.id : null;
  const accountNumber =
    persona?.role === "resident" ? persona.accountNumber : undefined;
  const suburb = persona?.role === "resident" ? persona.suburb : undefined;
  const activeUser = useRef<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setDismissed(new Set());
      return;
    }
    setDismissed(loadDismissedIds(userId));
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      activeUser.current = null;
      setItems([]);
      return;
    }
    const switched = activeUser.current !== userId;
    activeUser.current = userId;

    setItems((current) => {
      const base = switched
        ? loadNotices(userId)
        : current.length
          ? current
          : loadNotices(userId);
      if (!snapshot || !accountNumber) {
        return current.length && !switched ? current : base;
      }
      const next = mergeNotices(
        base,
        deriveResidentNotices(snapshot, accountNumber, suburb),
      ).filter((notice) => !dismissed.has(notice.id));
      if (!switched && current.length && noticesEqual(next, current)) {
        return current;
      }
      saveNotices(userId, next);
      return next;
    });
  }, [userId, accountNumber, suburb, snapshot, dismissed]);

  const markRead = useCallback(
    (id: string) => {
      if (!userId) return;
      setItems((current) => {
        const next = current.map((notice) =>
          notice.id === id ? { ...notice, read: true } : notice,
        );
        if (noticesEqual(next, current)) return current;
        saveNotices(userId, next);
        return next;
      });
    },
    [userId],
  );

  const markAllRead = useCallback(() => {
    if (!userId) return;
    setItems((current) => {
      if (current.every((notice) => notice.read)) return current;
      const next = current.map((notice) =>
        notice.read ? notice : { ...notice, read: true },
      );
      saveNotices(userId, next);
      return next;
    });
  }, [userId]);

  const dismissNotice = useCallback(
    (id: string) => {
      if (!userId) return;
      setDismissed((prev) => {
        const next = new Set(prev).add(id);
        saveDismissedIds(userId, next);
        return next;
      });
      markRead(id);
    },
    [userId, markRead],
  );

  const value = useMemo<NoticesValue>(
    () => ({
      items,
      unread: items.reduce((count, notice) => count + (notice.read ? 0 : 1), 0),
      connected,
      markRead,
      markAllRead,
      dismissNotice,
    }),
    [items, connected, markRead, markAllRead, dismissNotice],
  );

  return (
    <NoticesContext.Provider value={value}>{children}</NoticesContext.Provider>
  );
}

export function useResidentNotices() {
  return useContext(NoticesContext);
}
