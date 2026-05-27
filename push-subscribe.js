// تفعيل Push Notifications للمؤثرة

const VAPID_PUBLIC_KEY = 'BGnZ74vZSsAwrRmrw6hcSfdZPjc30hzdqbxz8pfSNC90mwgJD_GdKB8S84kpYJV8QOmK0ZrCe5M2rKOQYkz9FVA';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
}

async function subscribeToPush(userId) {
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      console.log('Push غير مدعوم في هذا المتصفح');
      return false;
    }

    // طلب الإذن
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.log('المستخدم رفض الإشعارات');
      return false;
    }

    // تسجيل Service Worker
    const registration = await navigator.serviceWorker.register('/push-sw.js');
    await navigator.serviceWorker.ready;

    // إنشاء اشتراك
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
    });

    // حفظ في Supabase
    const subData = subscription.toJSON();
    const { error } = await supabaseClient
      .from('push_subscriptions')
      .upsert({
        user_id: userId,
        endpoint: subData.endpoint,
        p256dh: subData.keys.p256dh,
        auth: subData.keys.auth,
        user_agent: navigator.userAgent
      }, { onConflict: 'endpoint' });

    if (error) {
      console.error('فشل حفظ الاشتراك:', error);
      return false;
    }

    console.log('✅ تم تفعيل الإشعارات بنجاح');
    return true;
  } catch (err) {
    console.error('خطأ في تفعيل الإشعارات:', err);
    return false;
  }
}

// زر طلب الإذن (اختياري - يمكن استدعاؤه من أي صفحة)
function showPushPermissionPrompt(userId) {
  if (localStorage.getItem('simbl_push_asked')) return;
  if (Notification.permission === 'granted' || Notification.permission === 'denied') return;

  setTimeout(() => {
    const banner = document.createElement('div');
    banner.style.cssText = 'position:fixed;bottom:20px;left:16px;right:16px;background:#1A1714;color:#F7F3EC;padding:16px;border-radius:16px;z-index:9999;max-width:500px;margin:0 auto;display:flex;gap:12px;align-items:center;box-shadow:0 8px 32px rgba(0,0,0,0.2);font-family:"Tajawal",sans-serif;';
    banner.innerHTML = `
      <div style="flex:1">
        <div style="font-weight:600;margin-bottom:4px;">🔔 فعّلي الإشعارات</div>
        <div style="font-size:13px;opacity:0.85;">ليصلك إشعار فوري لكل حملة جديدة</div>
      </div>
      <button id="push-enable-btn" style="background:#D4523A;color:white;border:none;padding:10px 18px;border-radius:100px;font-family:inherit;font-size:13px;cursor:pointer;white-space:nowrap;">تفعيل</button>
      <button id="push-dismiss-btn" style="background:transparent;color:white;border:none;padding:4px 8px;font-size:20px;cursor:pointer;">×</button>
    `;
    document.body.appendChild(banner);

    document.getElementById('push-enable-btn').onclick = async () => {
      banner.remove();
      localStorage.setItem('simbl_push_asked', 'true');
      const success = await subscribeToPush(userId);
      if (success) {
        // إشعار ترحيبي
        new Notification('سيمبل', {
          body: 'أهلاً بك ✨ راح يوصلك إشعار فوري لكل حملة جديدة',
          icon: '/icon-192.png',
          dir: 'rtl'
        });
      }
    };

    document.getElementById('push-dismiss-btn').onclick = () => {
      banner.remove();
      localStorage.setItem('simbl_push_asked', 'true');
    };
  }, 3000);
}
