// Service Worker لسيمبل
// يستقبل الإشعارات Push ويعرضها حتى لو المتصفح مقفول

const CACHE_VERSION = 'simbl-v2';

// التثبيت
self.addEventListener('install', (event) => {
  console.log('Simbl SW installed', CACHE_VERSION);
  self.skipWaiting();
});

// التفعيل — نحذف أي كاش قديم لضمان عدم ظهور نسخة قديمة
self.addEventListener('activate', (event) => {
  console.log('Simbl SW activated', CACHE_VERSION);
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
      .then(() => clients.claim())
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
        // لو الموقع مفتوح، نركز عليه
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            client.navigate(targetUrl);
            return client.focus();
          }
        }
        // غير كذا، نفتح تبويب جديد
        if (clients.openWindow) {
          return clients.openWindow(targetUrl);
        }
      })
  );
});

// fetch event (نترك المتصفح يتعامل عادي - لا تخزين للصفحات)
self.addEventListener('fetch', (event) => {
  // لا نسوي كاش للصفحات، عشان دايم يطلع آخر تحديث
});
