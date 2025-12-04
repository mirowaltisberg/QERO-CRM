// QERO CRM Service Worker for Push Notifications
// Compatible with iOS Safari 16.4+ and all modern browsers

// Cache name for offline support
const CACHE_NAME = 'qero-crm-v1';

// Install event - cache essential assets
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...');
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker...');
  event.waitUntil(clients.claim());
});

// Push event - receive push notification
self.addEventListener('push', (event) => {
  console.log('[SW] Push received:', event);
  
  let data = {
    title: 'QERO CRM',
    body: 'Neue Nachricht',
    icon: '/qero-logo.svg',
    badge: '/qero-logo.svg',
    tag: 'chat-notification',
    data: { url: '/chat' }
  };
  
  try {
    if (event.data) {
      const payload = event.data.json();
      console.log('[SW] Push payload:', payload);
      data = {
        title: payload.title || 'QERO CRM',
        body: payload.body || 'Neue Nachricht',
        icon: payload.icon || '/qero-logo.svg',
        badge: '/qero-logo.svg',
        tag: payload.tag || 'chat-notification',
        data: { 
          url: payload.url || '/chat',
          roomId: payload.roomId
        }
      };
    }
  } catch (e) {
    console.log('[SW] Error parsing push data:', e);
  }
  
  // iOS-compatible notification options (no vibrate, no actions)
  const options = {
    body: data.body,
    icon: data.icon,
    badge: data.badge,
    tag: data.tag,
    data: data.data,
    // Note: vibrate and actions not supported on iOS
  };
  
  console.log('[SW] Showing notification:', data.title, options);
  
  event.waitUntil(
    self.registration.showNotification(data.title, options)
      .then(() => console.log('[SW] Notification shown successfully'))
      .catch(err => console.error('[SW] Failed to show notification:', err))
  );
});

// Notification click event - open the app
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked:', event);
  
  event.notification.close();
  
  const url = event.notification.data?.url || '/chat';
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Check if there's already a window open
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            client.navigate(url);
            return client.focus();
          }
        }
        // Open new window if none exists
        if (clients.openWindow) {
          return clients.openWindow(url);
        }
      })
  );
});

// Handle fetch for offline support (optional, minimal caching)
self.addEventListener('fetch', (event) => {
  // Let network requests pass through
  // We could add caching here for offline support
});
