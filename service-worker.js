/* ── service-worker.js — Ably Push Notifications ── */

const CACHE_NAME = 'ably-push-v1';

/* ── Install ── */
self.addEventListener('install', (event) => {
  console.log('[SW] Installing…');
  self.skipWaiting();
});

/* ── Activate ── */
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating…');
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

/* ── Push event ──
 * Fired when the browser receives a push message from the server
 * (e.g. via Ably's push gateway or the Web Push API).
 *
 * Expected payload shapes:
 *   • JSON: { "notification": { "title": "...", "body": "..." }, "data": { ... } }
 *   • Plain text: shown as the notification body
 */
self.addEventListener('push', (event) => {
  console.log('[SW] Push received:', event.data?.text());

  const eventData = event.data.json();

  const notification = {
    title: eventData.notification?.title,
    body: eventData.notification?.body || '',
    data: eventData.data || {},
  };

  if (notification.title) {
    event.waitUntil(self.registration.showNotification(notification.title, notification));
  }
  else {
    console.group('Data Only Push');
    console.log(eventData);
    console.groupEnd();
  }

});

/* ── Notification click ── */
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked:', event.notification.tag);
  event.notification.close();

  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        // Focus an existing tab if one is open
        for (const client of windowClients) {
          if (client.url === targetUrl && 'focus' in client) {
            return client.focus();
          }
        }
        // Otherwise open a new tab
        if (clients.openWindow) {
          return clients.openWindow(targetUrl);
        }
      })
  );
});

/* ── Notification close ── */
self.addEventListener('notificationclose', (event) => {
  console.log('[SW] Notification dismissed:', event.notification.tag);
});

/* ── Message from page ──
 * The page can post messages to the SW, e.g. to trigger test notifications.
 * Usage: navigator.serviceWorker.controller.postMessage({ type: 'TEST' })
 */
self.addEventListener('message', (event) => {
  if (event.data?.type === 'TEST') {
    self.registration.showNotification('Test Notification', {
      body: 'The service worker is working correctly.',
      icon: '/favicon.ico',
    });
  }
});
