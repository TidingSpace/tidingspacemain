// Service worker for web push notifications. Deliberately minimal — this
// is not a full offline-caching PWA service worker (that's a separate,
// bigger undertaking with real cache-invalidation risk, not something to
// bolt on as a side effect of adding push). Its only two jobs are:
// receive a push event and show a notification, and handle someone
// tapping that notification.

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    return;
  }

  const { title, body, url, tag } = payload;

  event.waitUntil(
    (async () => {
      // Previously tried to suppress this when a matching page was
      // already open and focused, using the Push API's Client.focused
      // property. Removed after real-world testing showed notifications
      // never arriving regardless of which page was actually open —
      // Client.focused has a documented history of being unreliable
      // across mobile browsers and PWA installation states, sometimes
      // reporting true even when the app isn't in the foreground. An
      // occasionally-redundant notification (showing once while already
      // in that exact chat) is a far better trade-off than an unreliable
      // check silently eating every notification, which is what appears
      // to have been happening here.
      await self.registration.showNotification(title, {
        body,
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        // tag groups multiple pushes about the SAME conversation into one
        // notification instead of stacking duplicates — e.g. several
        // messages arriving in the same DM while the phone is asleep
        // collapse into the latest one, rather than five separate entries.
        tag: tag || 'tiding-space-message',
        data: { url }
      });
    })()
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      // Focus an already-open tab/window if one exists, rather than
      // always opening a new one — matches how a real native app's
      // notification tap behaves.
      const existing = allClients.find((client) => client.url.includes(url));
      if (existing) {
        existing.focus();
      } else {
        self.clients.openWindow(url);
      }
    })()
  );
});
