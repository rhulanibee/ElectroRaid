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

interface NoticesValue {
  items: ResidentNotice[];
  unread: number;
  connected: boolean;
  markRead: (id: string) => void;
  markAllRead: () => void;
}

const empty: NoticesValue = {
  items: [],
  unread: 0,
  connected: false,
  markRead: () => {},
  markAllRead: () => {},
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
  const userId = persona?.role === "resident" ? persona.id : null;
  const accountNumber =
    persona?.role === "resident" ? persona.accountNumber : undefined;
  const activeUser = useRef<string | null>(null);

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
        deriveResidentNotices(snapshot, accountNumber),
      );
      if (!switched && current.length && noticesEqual(next, current)) {
        return current;
      }
      saveNotices(userId, next);
      return next;
    });
  }, [userId, accountNumber, snapshot]);

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

  const value = useMemo<NoticesValue>(
    () => ({
      items,
      unread: items.reduce((count, notice) => count + (notice.read ? 0 : 1), 0),
      connected,
      markRead,
      markAllRead,
    }),
    [items, connected, markRead, markAllRead],
  );

  return (
    <NoticesContext.Provider value={value}>{children}</NoticesContext.Provider>
  );
}

export function useResidentNotices() {
  return useContext(NoticesContext);
}
