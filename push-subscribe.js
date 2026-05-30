// تفعيل Push Notifications للمؤثرة - تذكير ذكي عند كل دخول

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

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.log('المتصفّح رفض الإشعارات');
      return false;
    }

    const registration = await navigator.serviceWorker.register('/push-sw.js');
    await navigator.serviceWorker.ready;

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
    });

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

// النقطة الرئيسية: يُستدعى عند كل دخول لصفحة المعلن
function showPushPermissionPrompt(userId) {
  if (!userId) return;
  if (typeof Notification === 'undefined') return;

  // مفعّل أصلاً → اشترك بصمت ولا تعرض شي
  if (Notification.permission === 'granted') {
    subscribeToPush(userId);
    return;
  }

  // التذكير ظهر مرة في هذه الجلسة، لا نكرر داخل نفس الجلسة
  // (بس راح يظهر مرة ثانية في أي جلسة جديدة)
  if (sessionStorage.getItem('simbl_push_reminded')) return;
  sessionStorage.setItem('simbl_push_reminded', '1');

  setTimeout(() => showReminderBanner(userId), 1500);
}

function showReminderBanner(userId) {
  const isDenied = Notification.permission === 'denied';

  const banner = document.createElement('div');
  banner.id = 'simbl-push-banner';
  banner.style.cssText = 'position:fixed;bottom:20px;left:16px;right:16px;background:#0a0a0a;color:#fff;padding:16px 18px;border-radius:18px;z-index:9999;max-width:500px;margin:0 auto;display:flex;gap:12px;align-items:center;box-shadow:0 12px 40px rgba(0,0,0,0.20);font-family:"IBM Plex Sans Arabic",sans-serif;animation:simblBannerIn 0.35s cubic-bezier(0.22, 1, 0.36, 1);';

  // أنيميشن دخول البانر
  if (!document.getElementById('simbl-push-banner-keyframes')) {
    const style = document.createElement('style');
    style.id = 'simbl-push-banner-keyframes';
    style.textContent = '@keyframes simblBannerIn { from { opacity:0; transform: translateY(20px); } to { opacity:1; transform: translateY(0); } }';
    document.head.appendChild(style);
  }

  if (isDenied) {
    // الإشعارات مرفوضة من المتصفّح — لازم المستخدم يعدّل الإعدادات يدويًا
    banner.innerHTML = `
      <div style="flex:1; min-width:0">
        <div style="font-weight:600;margin-bottom:4px;font-size:15px;">🔕 الإشعارات معطّلة في متصفّحك</div>
        <div style="font-size:13px;opacity:0.85;line-height:1.6;">اضغط أيقونة 🔒 يسار شريط العنوان ← "الإشعارات" ← "السماح"، ثم حدّث الصفحة.</div>
      </div>
      <button id="push-dismiss-btn" style="background:transparent;color:#fff;border:none;padding:4px 8px;font-size:22px;cursor:pointer;opacity:0.7;line-height:1;flex-shrink:0;" aria-label="إغلاق">×</button>
    `;
    document.body.appendChild(banner);
    document.getElementById('push-dismiss-btn').onclick = () => banner.remove();
  } else {
    // الإشعارات لم تُفعّل بعد — نسأل المستخدم
    banner.innerHTML = `
      <div style="flex:1; min-width:0">
        <div style="font-weight:600;margin-bottom:4px;font-size:15px;">🔔 فعّل الإشعارات</div>
        <div style="font-size:13px;opacity:0.85;line-height:1.6;">ليصلك تنبيه فوري لكل حملة جديدة، حتى لو الموقع مقفول.</div>
      </div>
      <button id="push-enable-btn" style="background:#13B9B2;color:#fff;border:none;padding:10px 20px;border-radius:100px;font-family:inherit;font-size:13px;font-weight:500;cursor:pointer;white-space:nowrap;transition:background .2s;flex-shrink:0;">تفعيل</button>
      <button id="push-dismiss-btn" style="background:transparent;color:#fff;border:none;padding:4px 8px;font-size:22px;cursor:pointer;opacity:0.7;line-height:1;flex-shrink:0;" aria-label="إغلاق">×</button>
    `;
    document.body.appendChild(banner);

    document.getElementById('push-enable-btn').onclick = async () => {
      banner.remove();
      const success = await subscribeToPush(userId);
      if (success) {
        try {
          new Notification('سيمبل', {
            body: 'أهلاً ✨ راح يوصلك تنبيه فوري لكل حملة جديدة',
            icon: '/icon-192.png',
            dir: 'rtl'
          });
        } catch (e) {}
      }
    };

    document.getElementById('push-dismiss-btn').onclick = () => banner.remove();
  }
}
