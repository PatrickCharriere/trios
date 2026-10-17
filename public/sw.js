/*
 * Trios service worker: shows the turn notifications the server pushes
 * (see src/lib/push), and opens the game when one is tapped. It doesn't
 * cache anything, so the site works exactly as it does without it.
 */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  const message = event.data ? event.data.json() : null;
  if (message) event.waitUntil(show(message));
});

async function show({ title, body, url, tag }) {
  const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  // Someone looking at this game already heard its chime. Browsers expect every
  // push to show a notification (Safari stops delivering them otherwise), so
  // show this one silently and take it straight back.
  const watching = windows.some((w) => w.visibilityState === "visible" && new URL(w.url).pathname === url);
  await self.registration.showNotification(title, {
    body,
    tag,
    data: { url },
    icon: "/icon-192.png",
    silent: watching,
    renotify: !watching,
  });
  if (watching) for (const notification of await self.registration.getNotifications({ tag })) notification.close();
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url ?? "/", self.location.origin).href;
  event.waitUntil(open(url));
});

async function open(url) {
  const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  const same = windows.find((w) => w.url === url);
  if (same) return same.focus();
  return self.clients.openWindow(url);
}
