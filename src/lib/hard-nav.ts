/**
 * Client navigation helpers. Soft-route via the App Router when bound
 * (Providers); fall back to full document loads only before bind.
 */

type NavFns = {
  push: (href: string) => void;
  replace: (href: string) => void;
};

let nav: NavFns | null = null;
const pendingListeners = new Set<(pending: boolean) => void>();

export function bindSoftNav(fns: NavFns) {
  nav = fns;
}

export function subscribeNavPending(cb: (pending: boolean) => void) {
  pendingListeners.add(cb);
  return () => {
    pendingListeners.delete(cb);
  };
}

export function markNavPending() {
  for (const cb of pendingListeners) cb(true);
}

export function clearNavPending() {
  for (const cb of pendingListeners) cb(false);
}

export function go(href: string) {
  markNavPending();
  if (nav) nav.push(href);
  else window.location.assign(href);
}

export function goReplace(href: string) {
  markNavPending();
  if (nav) nav.replace(href);
  else window.location.replace(href);
}
