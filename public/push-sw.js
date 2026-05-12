self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (_) {
    data = { title: 'Vikariehantering', body: event.data ? event.data.text() : '' };
  }

  const title = data.title || 'Vikariehantering';
  const options = {
    body: data.body || 'Du har en ny notifiering.',
    icon: '/sundbyberg-halm.png',
    badge: '/sundbyberg-halm.png',
    data: { url: data.url || '/' },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(clients.openWindow(url));
});
