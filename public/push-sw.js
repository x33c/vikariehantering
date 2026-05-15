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
    tag: data.tag || data.url || 'vikariehantering',
    renotify: true,
    timestamp: Date.now(),
    data: { url: data.url || '/' },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';

  event.waitUntil((async () => {
    const targetUrl = new URL(url, self.location.origin).href;
    const oppnaFonster = await clients.matchAll({ type: 'window', includeUncontrolled: true });

    for (const klient of oppnaFonster) {
      const klientUrl = new URL(klient.url);
      if (klientUrl.origin === self.location.origin && 'focus' in klient) {
        await klient.focus();
        if ('navigate' in klient) await klient.navigate(targetUrl);
        return;
      }
    }

    await clients.openWindow(targetUrl);
  })());
});
