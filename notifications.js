// نظام إشعارات سيمبل - ملف موحد
// يستخدم في كل الصفحات لعرض الجرس والإشعارات

// تسجيل Service Worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(err => {
    console.warn('SW registration failed:', err);
  });
}

// إضافة CSS الإشعارات
const notifStyles = `
<style>
.notif-bell {
  position: relative;
  background: white;
  border: 1px solid var(--line, rgba(26,23,20,0.1));
  width: 40px;
  height: 40px;
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  transition: all 0.2s;
}
.notif-bell:hover {
  border-color: var(--accent, #D4523A);
}
.notif-badge {
  position: absolute;
  top: -4px;
  inset-inline-end: -4px;
  background: var(--accent, #D4523A);
  color: white;
  font-size: 10px;
  font-weight: 600;
  min-width: 18px;
  height: 18px;
  border-radius: 100px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 5px;
  border: 2px solid white;
  font-family: var(--font-display, 'Reem Kufi', sans-serif);
}
.notif-badge.hidden { display: none; }

.notif-dropdown {
  position: absolute;
  top: 50px;
  inset-inline-end: 0;
  background: white;
  border: 1px solid var(--line, rgba(26,23,20,0.1));
  border-radius: 20px;
  width: 380px;
  max-width: calc(100vw - 32px);
  max-height: 500px;
  overflow: hidden;
  display: none;
  flex-direction: column;
  z-index: 100;
  box-shadow: 0 8px 32px rgba(26, 23, 20, 0.12);
}
.notif-dropdown.show { display: flex; }

.notif-header {
  padding: 16px 20px;
  border-bottom: 1px solid var(--line, rgba(26,23,20,0.1));
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.notif-header h3 {
  font-family: var(--font-display, 'Reem Kufi', sans-serif);
  font-size: 16px;
  font-weight: 600;
  margin: 0;
}
.notif-mark-read {
  font-size: 12px;
  color: var(--accent, #D4523A);
  background: none;
  border: none;
  cursor: pointer;
  font-family: var(--font-body, 'Tajawal', sans-serif);
}
.notif-mark-read:hover { text-decoration: underline; }

.notif-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
}
.notif-empty {
  text-align: center;
  padding: 40px 20px;
  color: var(--ink-muted, #6B645B);
  font-size: 14px;
}

.notif-item {
  padding: 14px 20px;
  border-bottom: 1px solid var(--line, rgba(26,23,20,0.08));
  cursor: pointer;
  display: flex;
  gap: 12px;
  transition: background 0.15s;
  text-decoration: none;
  color: inherit;
}
.notif-item:hover {
  background: var(--cream-darker, #EFE9DD);
}
.notif-item.unread {
  background: rgba(212, 82, 58, 0.04);
}
.notif-item:last-child { border-bottom: none; }

.notif-icon {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  font-size: 16px;
}
.notif-icon.campaign { background: rgba(212, 82, 58, 0.12); color: var(--accent, #D4523A); }
.notif-icon.application { background: rgba(91, 96, 66, 0.12); color: var(--olive, #5B6042); }
.notif-icon.message { background: rgba(184, 145, 94, 0.15); color: var(--gold, #B8915E); }
.notif-icon.workflow { background: rgba(91, 96, 66, 0.12); color: var(--olive, #5B6042); }
.notif-icon.deal { background: rgba(91, 96, 66, 0.15); color: var(--olive, #5B6042); }

.notif-content { flex: 1; min-width: 0; }
.notif-title {
  font-family: var(--font-display, 'Reem Kufi', sans-serif);
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 4px;
  color: var(--ink, #1A1714);
}
.notif-message {
  font-size: 13px;
  color: var(--ink-soft, #3D3833);
  margin-bottom: 4px;
  line-height: 1.5;
}
.notif-time {
  font-size: 11px;
  color: var(--ink-faint, #A8A095);
}
.notif-dot {
  width: 8px;
  height: 8px;
  background: var(--accent, #D4523A);
  border-radius: 50%;
  flex-shrink: 0;
  margin-top: 14px;
}
.notif-dot.read { visibility: hidden; }

.install-banner {
  display: none;
  position: fixed;
  bottom: 20px;
  inset-inline-start: 20px;
  inset-inline-end: 20px;
  background: var(--ink, #1A1714);
  color: white;
  padding: 16px 20px;
  border-radius: 16px;
  z-index: 999;
  align-items: center;
  gap: 12px;
  max-width: 500px;
  margin: 0 auto;
  box-shadow: 0 8px 32px rgba(0,0,0,0.2);
}
.install-banner.show { display: flex; }
.install-banner .text { flex: 1; }
.install-banner h4 {
  font-family: var(--font-display, 'Reem Kufi', sans-serif);
  font-size: 14px;
  margin-bottom: 2px;
}
.install-banner p {
  font-size: 12px;
  opacity: 0.85;
  margin: 0;
}
.install-banner button {
  background: var(--accent, #D4523A);
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 100px;
  font-family: var(--font-body, 'Tajawal', sans-serif);
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
}
.install-banner .close-btn {
  background: transparent;
  font-size: 18px;
  padding: 4px 8px;
}

@media (max-width: 480px) {
  .notif-dropdown {
    position: fixed;
    top: 80px;
    left: 16px;
    right: 16px;
    inset-inline-end: 16px;
    inset-inline-start: 16px;
    width: auto;
    max-width: none;
  }
}
</style>
`;

// إضافة الأنماط للصفحة
if (!document.getElementById('notif-styles')) {
  const styleEl = document.createElement('div');
  styleEl.id = 'notif-styles';
  styleEl.innerHTML = notifStyles;
  document.head.appendChild(styleEl.firstElementChild);
}

let notifData = [];
let unreadCount = 0;
let notifPollInterval = null;
let notifLoaded = false;

// إنشاء جرس الإشعارات
function createBellHTML() {
  return `
    <div style="position: relative">
      <button class="notif-bell" onclick="toggleNotifications(event)" id="notif-bell-btn" aria-label="الإشعارات">
        🔔
        <span class="notif-badge hidden" id="notif-badge">0</span>
      </button>
      <div class="notif-dropdown" id="notif-dropdown">
        <div class="notif-header">
          <h3>الإشعارات</h3>
          <button class="notif-mark-read" onclick="markAllAsRead()">تعليم الكل كمقروء</button>
        </div>
        <div class="notif-list" id="notif-list">
          <div class="notif-empty">جاري التحميل...</div>
        </div>
      </div>
    </div>
  `;
}

// تركيب الجرس في الـ navbar
function mountBell(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const wrapper = document.createElement('div');
  wrapper.innerHTML = createBellHTML();
  container.insertBefore(wrapper.firstElementChild, container.firstChild);
}

// جلب الإشعارات
async function loadNotifications() {
  const user = getCurrentUser();

  // DEBUG: نعرض رسالة على الشاشة
  showDebug('User: ' + (user ? user.name + ' (id: ' + user.id.substring(0,8) + ')' : 'NONE'));
  showDebug('Supabase ready: ' + (window.supabaseClient ? 'YES' : 'NO'));

  if (!user) {
    notifLoaded = true;
    renderNotifList();
    showDebug('STOPPED: no user');
    return;
  }

  // ننتظر supabase يكون جاهز (حتى 5 ثواني)
  let waitCount = 0;
  while (!window.supabaseClient && waitCount < 50) {
    await new Promise(r => setTimeout(r, 100));
    waitCount++;
  }

  if (!window.supabaseClient) {
    showDebug('STOPPED: supabase not ready after wait');
    notifLoaded = true;
    renderNotifList();
    return;
  }

  showDebug('Supabase ready, fetching...');

  try {
    const { data, error } = await supabaseClient
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) {
      showDebug('ERROR: ' + JSON.stringify(error));
      throw error;
    }

    showDebug('Found: ' + (data?.length || 0) + ' notifications');

    notifData = data || [];
    unreadCount = notifData.filter(n => !n.is_read).length;
    notifLoaded = true;
    renderBell();
    renderNotifList();
  } catch (err) {
    console.error('Failed to load notifications:', err);
    showDebug('CATCH: ' + err.message);
    notifLoaded = true;
    renderNotifList();
  }
}

function showDebug(msg) {
  return;
  let debugEl = document.getElementById('notif-debug');
  if (!debugEl) {
    debugEl = document.createElement('div');
    debugEl.id = 'notif-debug';
    debugEl.style.cssText = 'position:fixed; top:80px; left:10px; right:10px; background:#1A1714; color:#F7F3EC; padding:10px; border-radius:8px; font-size:11px; font-family:monospace; z-index:9999; max-height:200px; overflow:auto; direction:ltr; text-align:left;';
    document.body.appendChild(debugEl);
  }
  const time = new Date().toLocaleTimeString();
  debugEl.innerHTML += `<div>[${time}] ${msg}</div>`;
}

function renderBell() {
  const badge = document.getElementById('notif-badge');
  if (!badge) return;
  if (unreadCount > 0) {
    badge.textContent = unreadCount > 9 ? '9+' : unreadCount;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}

function renderNotifList() {
  const list = document.getElementById('notif-list');
  if (!list) return;

  if (!notifLoaded) {
    list.innerHTML = '<div class="notif-empty">جاري التحميل...</div>';
    return;
  }

  if (notifData.length === 0) {
    list.innerHTML = '<div class="notif-empty">ما عندك إشعارات بعد</div>';
    return;
  }

  const iconMap = {
    new_campaign: { class: 'campaign', emoji: '🎯' },
    new_application: { class: 'application', emoji: '📨' },
    new_message: { class: 'message', emoji: '💬' },
    workflow_update: { class: 'workflow', emoji: '✓' },
    deal_closed: { class: 'deal', emoji: '🤝' }
  };

  list.innerHTML = notifData.map(n => {
    const icon = iconMap[n.type] || { class: 'message', emoji: '🔔' };
    const safe = (s) => (s || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return `
      <a href="${safe(n.link || '#')}" class="notif-item ${n.is_read ? '' : 'unread'}" onclick="markAsRead('${n.id}', event)">
        <div class="notif-icon ${icon.class}">${icon.emoji}</div>
        <div class="notif-content">
          <div class="notif-title">${safe(n.title)}</div>
          ${n.message ? `<div class="notif-message">${safe(n.message)}</div>` : ''}
          <div class="notif-time">${formatNotifTime(n.created_at)}</div>
        </div>
        <div class="notif-dot ${n.is_read ? 'read' : ''}"></div>
      </a>
    `;
  }).join('');
}

function formatNotifTime(iso) {
  const date = new Date(iso);
  const now = new Date();
  const diff = (now - date) / 1000;
  if (diff < 60) return 'الآن';
  if (diff < 3600) return `قبل ${Math.floor(diff / 60)} دقيقة`;
  if (diff < 86400) return `قبل ${Math.floor(diff / 3600)} ساعة`;
  if (diff < 604800) return `قبل ${Math.floor(diff / 86400)} يوم`;
  return date.toLocaleDateString('ar-SA', { month: 'short', day: 'numeric' });
}

async function toggleNotifications(event) {
  if (event) event.stopPropagation();
  const dropdown = document.getElementById('notif-dropdown');
  if (!dropdown) return;
  dropdown.classList.toggle('show');
  if (dropdown.classList.contains('show')) {
    // نعرض البيانات الحالية فوراً (لو موجودة)
    renderNotifList();
    // نحدّث من القاعدة ثم نعلّمها كمقروءة (تثبت ولا ترجع غير مقروءة)
    await loadNotifications();
    markAllAsRead();
  }
}

async function markAsRead(notifId, event) {
  const notif = notifData.find(n => n.id === notifId);
  if (!notif || notif.is_read) return;

  notif.is_read = true;
  unreadCount = Math.max(0, unreadCount - 1);
  renderBell();
  renderNotifList();

  try {
    await supabaseClient
      .from('notifications')
      .update({ is_read: true })
      .eq('id', notifId);
  } catch (err) {
    console.error('Failed to mark as read:', err);
  }
}

async function markAllAsRead() {
  const user = getCurrentUser();
  if (!user) return;

  notifData.forEach(n => n.is_read = true);
  unreadCount = 0;
  renderBell();
  renderNotifList();

  try {
    const { error } = await supabaseClient.rpc('mark_my_notifications_read');
    if (error) throw error;
  } catch (err) {
    console.error('Failed to mark all as read:', err);
  }
}

// إغلاق القائمة المنسدلة عند الضغط خارجها
document.addEventListener('click', (event) => {
  const dropdown = document.getElementById('notif-dropdown');
  const bell = document.getElementById('notif-bell-btn');
  if (!dropdown || !bell) return;
  if (!bell.contains(event.target) && !dropdown.contains(event.target)) {
    dropdown.classList.remove('show');
  }
});

// دالة إنشاء إشعار (تستخدم من أماكن أخرى)
async function createNotification(userId, type, title, message, link) {
  if (!window.supabaseClient) return;
  try {
    await supabaseClient
      .from('notifications')
      .insert([{ user_id: userId, type, title, message: message || null, link: link || null }]);
  } catch (err) {
    console.error('Failed to create notification:', err);
  }
}

// ===== المطابقة الذكية: حدود النطاقات القديمة (للحملات المنشأة قبل التوحيد) =====
const SIMBL_FOLLOWER_BOUNDS = {
  '20-50k':   [20000, 50000],
  '50-200k':  [50000, 200000],
  '200-500k': [200000, 500000],
  '500k+':    [500000, Infinity]
};

// المطابقة 100٪: نطاقات الحملة الآن نفس قيم شرائح المؤثر الرقمية (10000، 20000 ...).
// القاعدة: شريحة المؤثر (followers) لازم تساوي إحدى الشرائح اللي اختارتها الشركة — تطابق تام.
// مع دعم خلفي: لو الحملة قديمة وفيها نطاق نصّي (مثل 200-500k) نرجع لفحص الحدود.
function simblFollowersMatch(followers, followerRange) {
  const f = parseInt(followers, 10);
  if (!f || isNaN(f)) return false;
  const tokens = String(followerRange || '').split(',').map(s => s.trim()).filter(Boolean);
  if (tokens.length === 0) return true; // الشركة ما حددت شريحة → الكل يطابق
  return tokens.some(tok => {
    const legacy = SIMBL_FOLLOWER_BOUNDS[tok];
    if (legacy) return f >= legacy[0] && f < legacy[1]; // نطاق قديم → فحص حدود
    const exact = parseInt(tok, 10);                     // شريحة رقمية → مساواة تامة
    return !isNaN(exact) && f === exact;
  });
}

// إشعار المؤثرين المطابقين فقط (فلتر 1: المنصة مطابقة · فلتر 2: المتابعون ضمن النطاق)
async function notifyMatchedCreators(campaign, brandName) {
  if (!window.supabaseClient || !campaign) return [];
  try {
    let q = supabaseClient
      .from('users')
      .select('id, followers, platform, country, city')
      .eq('role', 'creator')
      .eq('is_test', !!(getCurrentUser()?.is_test));

    // فلتر 1 — المنصة: مطابقة تامة لو الحملة محددة منصة
    if (campaign.platform) q = q.eq('platform', campaign.platform);

    const { data: creators } = await q;
    if (!creators || creators.length === 0) return [];

    // فلتر موحّد — نفس منطق العرض والدخول والوكيل (الدولة + المدينة + المنصة + نطاق المتابعين)
    // مصدر واحد للحقيقة: simblTargetMatch من supabase-config.js (يُحمّل قبل هذا الملف).
    let matched;
    if (typeof simblTargetMatch === 'function') {
      matched = creators.filter(c => simblTargetMatch(c, campaign));
    } else {
      const locMatch = (typeof simblLocationMatch === 'function') ? simblLocationMatch : () => true;
      matched = creators.filter(c =>
        simblFollowersMatch(c.followers, campaign.follower_range) && locMatch(c, campaign)
      );
    }
    if (matched.length === 0) return [];

    const notifications = matched.map(c => ({
      user_id: c.id,
      type: 'new_campaign',
      title: `🎯 حملة جديدة تناسبك من ${brandName}`,
      message: campaign.title,
      link: '/creator.html'
    }));

    await supabaseClient.from('notifications').insert(notifications);
    return matched.map(c => c.id);
  } catch (err) {
    console.error('Failed to notify matched creators:', err);
    return [];
  }
}

// PWA Install banner
let deferredPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  showInstallBanner();
});

function showInstallBanner() {
  // ما نعرض البانر لو المستخدم رفضه قبل
  if (localStorage.getItem('simbl_install_dismissed')) return;
  if (window.matchMedia('(display-mode: standalone)').matches) return;

  let banner = document.getElementById('install-banner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'install-banner';
    banner.className = 'install-banner';
    banner.innerHTML = `
      <div class="text">
        <h4>📱 ثبّت سيمبل على شاشتك</h4>
        <p>وصول أسرع وإشعارات فورية</p>
      </div>
      <button onclick="installApp()">تثبيت</button>
      <button class="close-btn" onclick="dismissInstall()" aria-label="إغلاق">×</button>
    `;
    document.body.appendChild(banner);
  }
  setTimeout(() => banner.classList.add('show'), 1500);
}

async function installApp() {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  if (outcome === 'accepted') {
    localStorage.setItem('simbl_install_dismissed', 'true');
  }
  deferredPrompt = null;
  document.getElementById('install-banner')?.classList.remove('show');
}

function dismissInstall() {
  localStorage.setItem('simbl_install_dismissed', 'true');
  document.getElementById('install-banner')?.classList.remove('show');
}

// تشخيص iOS: عرض تعليمات يدوية
function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}
function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches ||
         window.navigator.standalone === true;
}

if (isIOS() && !isStandalone() && !localStorage.getItem('simbl_ios_dismissed')) {
  setTimeout(() => {
    let banner = document.createElement('div');
    banner.className = 'install-banner show';
    banner.innerHTML = `
      <div class="text">
        <h4>📱 أضيفي سيمبل لشاشتك</h4>
        <p>اضغطي زر المشاركة ⬆ ثم "Add to Home Screen"</p>
      </div>
      <button class="close-btn" onclick="this.parentElement.remove(); localStorage.setItem('simbl_ios_dismissed', 'true')" aria-label="إغلاق">×</button>
    `;
    document.body.appendChild(banner);
  }, 2500);
}

// تشغيل تلقائي
async function initNotifications(bellContainerId) {
  if (bellContainerId) {
    mountBell(bellContainerId);
  }
  // ننتظر استعادة الجلسة أولاً قبل تحميل الإشعارات
  if (typeof tryRestoreSession === 'function') {
    await tryRestoreSession();
  }
  // تحميل الإشعارات بعد ما نتأكد من المستخدم
  await loadNotifications();
  // تحديث كل دقيقة
  if (notifPollInterval) clearInterval(notifPollInterval);
  notifPollInterval = setInterval(loadNotifications, 60000);
}
