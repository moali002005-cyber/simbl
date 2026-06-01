// تفعيل Push Notifications - يشتغل تلقائيًا على أي صفحة لأي مستخدم مسجّل

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

    // لو فيه اشتراك قديم، نلغيه ونعيد الاشتراك (يضمن اشتراك حيّ غير منتهي)
    let subscription = await registration.pushManager.getSubscription();
    const oldEndpoint = subscription ? subscription.endpoint : null;
    if (subscription) {
      try { await subscription.unsubscribe(); } catch (e) {}
    }
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
    });

    const subData = subscription.toJSON();

    // احذف اشتراك هذا الجهاز القديم (لو تغيّر الـ endpoint) لتجنّب الإرسال لاشتراك ميت
    try {
      if (oldEndpoint && oldEndpoint !== subData.endpoint) {
        await supabaseClient.from('push_subscriptions').delete().eq('endpoint', oldEndpoint);
      }
    } catch (e) { console.warn('تنظيف الاشتراك القديم:', e); }

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

    // تنظيف إضافي: احذف اشتراكات هذا الجهاز القديمة (نفس user_agent، endpoint مختلف)
    try {
      await supabaseClient
        .from('push_subscriptions')
        .delete()
        .eq('user_id', userId)
        .eq('user_agent', navigator.userAgent)
        .neq('endpoint', subData.endpoint);
    } catch (e) { console.warn('تنظيف اشتراكات الجهاز القديمة:', e); }

    console.log('✅ تم تفعيل الإشعارات بنجاح');
    return true;
  } catch (err) {
    console.error('خطأ في تفعيل الإشعارات:', err);
    return false;
  }
}

// إعادة اشتراك صامتة عند كل فتح — تضمن بقاء الاشتراك حيّاً بدون تدخّل المستخدم
async function ensurePushSubscription(userId) {
  try {
    if (!userId) return;
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

    const registration = await navigator.serviceWorker.register('/push-sw.js');
    await navigator.serviceWorker.ready;

    let subscription = await registration.pushManager.getSubscription();

    // لو ما فيه اشتراك (انتهى/انلغى) → أعد الاشتراك بالكامل
    if (!subscription) {
      await subscribeToPush(userId);
      return;
    }

    // فيه اشتراك حيّ → تأكّد إنه محفوظ ومربوط بالمستخدم الحالي (upsert خفيف)
    const subData = subscription.toJSON();
    await supabaseClient
      .from('push_subscriptions')
      .upsert({
        user_id: userId,
        endpoint: subData.endpoint,
        p256dh: subData.keys.p256dh,
        auth: subData.keys.auth,
        user_agent: navigator.userAgent
      }, { onConflict: 'endpoint' });
  } catch (err) {
    console.warn('ensurePushSubscription:', err);
  }
}

// عرض/إخفاء زر التفعيل اليدوي حسب الحالة
function refreshPushButton() {
  const btn = document.getElementById('btn-push');
  if (!btn) return;
  if (typeof Notification === 'undefined') { btn.classList.remove('show'); return; }
  if (Notification.permission === 'granted') {
    btn.classList.remove('show');
  } else {
    btn.classList.add('show');
  }
}

// التفعيل اليدوي من زر "🔔 فعّل الإشعارات"
async function manualEnablePush() {
  const user = JSON.parse(localStorage.getItem('simbl_current_user') || 'null');
  if (!user || !user.id) {
    alert('سجّل دخول أولاً.');
    return;
  }
  if (Notification.permission === 'denied') {
    alert('الإشعارات معطّلة في متصفّحك.\n\nلتفعيلها:\n1. اضغط أيقونة 🔒 يسار شريط العنوان\n2. اختر "الإشعارات" ← "السماح"\n3. حدّث الصفحة');
    return;
  }
  const success = await subscribeToPush(user.id);
  refreshPushButton();
  if (success) {
    try {
      new Notification('سيمبل', {
        body: 'تم تفعيل الإشعارات ✨ راح يوصلك تنبيه لكل حدث جديد',
        icon: '/icon-192.png',
        dir: 'rtl'
      });
    } catch (e) {}
  }
}

// المطالبة بالإذن: تُستدعى تلقائيًا أو من زر
function showPushPermissionPrompt(userId) {
  if (!userId) return;
  if (typeof Notification === 'undefined') return;

  console.log('[Push] حالة الإذن:', Notification.permission);

  // مفعّل أصلاً → تأكّد من الاشتراك بصمت (يجدّده لو انتهى)
  if (Notification.permission === 'granted') {
    ensurePushSubscription(userId);
    return;
  }

  // عُرض البانر لهذا المستخدم في هذه الجلسة
  const sessionKey = 'simbl_push_reminded_' + userId;
  if (sessionStorage.getItem(sessionKey)) return;
  sessionStorage.setItem(sessionKey, '1');

  showReminderBanner(userId);
}

function showReminderBanner(userId) {
  // لو فيه بانر قديم، احذفه
  const existing = document.getElementById('simbl-push-banner');
  if (existing) existing.remove();

  const isDenied = Notification.permission === 'denied';

  const banner = document.createElement('div');
  banner.id = 'simbl-push-banner';
  banner.style.cssText = 'position:fixed;bottom:20px;left:16px;right:16px;background:#0a0a0a;color:#fff;padding:16px 18px;border-radius:18px;z-index:9999;max-width:500px;margin:0 auto;display:flex;gap:12px;align-items:center;box-shadow:0 12px 40px rgba(0,0,0,0.20);font-family:"IBM Plex Sans Arabic",sans-serif;animation:simblBannerIn 0.35s cubic-bezier(0.22, 1, 0.36, 1);';

  if (!document.getElementById('simbl-push-banner-keyframes')) {
    const style = document.createElement('style');
    style.id = 'simbl-push-banner-keyframes';
    style.textContent = '@keyframes simblBannerIn { from { opacity:0; transform: translateY(20px); } to { opacity:1; transform: translateY(0); } }';
    document.head.appendChild(style);
  }

  if (isDenied) {
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
    banner.innerHTML = `
      <div style="flex:1; min-width:0">
        <div style="font-weight:600;margin-bottom:4px;font-size:15px;">🔔 فعّل الإشعارات</div>
        <div style="font-size:13px;opacity:0.85;line-height:1.6;">ليصلك تنبيه فوري لكل جديد، حتى لو الموقع مقفول.</div>
      </div>
      <button id="push-enable-btn" style="background:#13B9B2;color:#fff;border:none;padding:10px 20px;border-radius:100px;font-family:inherit;font-size:13px;font-weight:500;cursor:pointer;white-space:nowrap;transition:background .2s;flex-shrink:0;">تفعيل</button>
      <button id="push-dismiss-btn" style="background:transparent;color:#fff;border:none;padding:4px 8px;font-size:22px;cursor:pointer;opacity:0.7;line-height:1;flex-shrink:0;" aria-label="إغلاق">×</button>
    `;
    document.body.appendChild(banner);

    document.getElementById('push-enable-btn').onclick = async () => {
      banner.remove();
      const success = await subscribeToPush(userId);
      refreshPushButton();
      if (success) {
        try {
          new Notification('سيمبل', {
            body: 'أهلاً ✨ راح يوصلك تنبيه فوري لكل حدث جديد',
            icon: '/icon-192.png',
            dir: 'rtl'
          });
        } catch (e) {}
      }
    };

    document.getElementById('push-dismiss-btn').onclick = () => banner.remove();
  }
}

// ============= التشغيل التلقائي =============
// أي صفحة تستدعي هذا الملف، بعد ثانيتين من تحميلها يطلب الإذن من المستخدم المسجّل
(async function pushAutoInit() {
  if (document.readyState === 'loading') {
    await new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve));
  }

  // محاولة استعادة الجلسة لو كانت موجودة في cookie
  if (typeof tryRestoreSession === 'function') {
    try { await tryRestoreSession(); } catch (e) {}
  }

  // تحديث حالة الزر اليدوي فورًا (لو موجود)
  refreshPushButton();

  // إعادة اشتراك صامتة فورية لو الإذن مفعّل (يجدّد أي اشتراك منتهي بدون تدخّل)
  const u0 = JSON.parse(localStorage.getItem('simbl_current_user') || 'null');
  if (u0 && u0.id && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    ensurePushSubscription(u0.id);
  }

  // بعد ثانيتين، اعرض المطالبة لأي مستخدم مسجّل (بدون تمييز الدور)
  setTimeout(() => {
    const user = JSON.parse(localStorage.getItem('simbl_current_user') || 'null');
    if (user && user.id) {
      showPushPermissionPrompt(user.id);
    }
  }, 2000);
})();

// إعادة فحص الاشتراك لمّا يرجع المستخدم للتطبيق (تبويب نشط) — يصلّح أي اشتراك انتهى
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  const user = JSON.parse(localStorage.getItem('simbl_current_user') || 'null');
  if (user && user.id && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    ensurePushSubscription(user.id);
  }
});
