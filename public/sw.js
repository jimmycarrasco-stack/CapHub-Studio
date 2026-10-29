// CapHub Studio doesn't use a service worker. If another app that once ran on this address
// (e.g. another project on localhost:3000) left one behind, it would keep serving that app's
// cached files here. When that worker checks for an update it fetches this file, installs it,
// and this version removes itself and its caches.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) await caches.delete(key);
      await self.registration.unregister();
      for (const client of await self.clients.matchAll({ type: "window" })) client.navigate(client.url);
    })(),
  );
});
