// Service Worker لسيمبل
// (1) يستقبل إشعارات Push ويعرضها حتى لو المتصفح مقفول
// (2) يجلب الصفحات من الشبكة مباشرة (no-store) — فأي تحديث يوصل كل الأجهزة فورًا بلا كاش قديم

const CACHE_VERSION = 'simbl-v3';

// التثبيت — نفعّل النسخة الجديدة فورًا
self.addEventListener('install', (event) => {
  console.log('Simbl SW installed', CACHE_VERSION);
  self.skipWaiting();
});

// التفعيل — نحذف أي كاش قديم ونسيطر على كل التبويبات مباشرة
self.addEventListener('activate', (event) => {
  console.log('Simbl SW activated', CACHE_VERSION);
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

// استقبال Push notification
self.addEventListener('push', (event) => {
  let data = {
    title: 'سيمبل',
    body: 'لديك إشعار جديد',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    url: '/'
  };

  if (event.data) {
    try {
      data = { ...data, ...event.data.json() };
    } catch (e) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: data.icon,
    badge: data.badge,
    dir: 'rtl',
    lang: 'ar',
    vibrate: [200, 100, 200],
    data: { url: data.url },
    requireInteraction: false,
    tag: data.tag || 'simbl-notification'
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// لما المستخدم يضغط على الإشعار
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            client.navigate(targetUrl);
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow(targetUrl);
        }
      })
  );
});

// fetch — للصفحات (navigation) نجلب من الشبكة مباشرة بلا كاش، فيوصل آخر تحديث دايمًا لكل الأجهزة.
// باقي الطلبات (js/css/صور) نتركها للمتصفح (لها كاش-باستينج تلقائي بالفعل).
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req, { cache: 'no-store' }).catch(() =>
        caches.match(req).then((cached) =>
          cached || new Response(
            '<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="2">' +
            '<body style="font-family:sans-serif;text-align:center;padding:40px;color:#555">جارٍ إعادة المحاولة…</body>',
            { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
          )
        )
      )
    );
  }
  // غير الصفحات: لا نتدخّل
});
