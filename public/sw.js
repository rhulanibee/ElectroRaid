self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  // Let the network handle APIs and Next internals — never cache-auth them.
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/_next/") ||
    url.pathname === "/login" ||
    url.pathname === "/register"
  ) {
    return;
  }

  event.respondWith(
    fetch(req).catch(async () => {
      const hit = await caches.match(req);
      if (hit) return hit;
      const fallback = await caches.match("/field");
      if (fallback) return fallback;
      return new Response("Offline", {
        status: 503,
        statusText: "Offline",
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }),
  );
});
