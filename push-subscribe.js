// تفعيل Push Notifications للمؤثرة - تلقائيًا بدون مطالبة مخصصة

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

    // طلب الإذن (المتصفّح يعرض نافذته الأصلية)
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.log('المتصفّح رفض الإشعارات');
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

// التفعيل التلقائي: أي مستخدم مسجّل دخول يصير مشترك تلقائيًا في الإشعارات
// (المتصفّح بيعرض نافذته الصغيرة مرة وحدة فقط — هذي قاعدة المتصفح ولا نقدر نتجاوزها)
function showPushPermissionPrompt(userId) {
  if (!userId) return;
  if (typeof Notification === 'undefined') return;

  // إذا الإذن مرفوض سابقًا على مستوى المتصفّح، لا نقدر نسوي شيء
  if (Notification.permission === 'denied') {
    console.log('إذن الإشعارات مرفوض من المتصفح');
    return;
  }

  // إذا الإذن مفعّل أصلاً، نسجّل المستخدم بصمت
  if (Notification.permission === 'granted') {
    subscribeToPush(userId);
    return;
  }

  // الحالة الافتراضية: نطلب الإذن مباشرة بعد ثانيتين من تحميل الصفحة
  // (نعطي وقت بسيط عشان الصفحة تخلّص تحميل قبل نافذة المتصفّح)
  setTimeout(() => {
    subscribeToPush(userId);
  }, 2000);
}
