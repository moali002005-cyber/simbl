// ============ دليل التثبيت + تفعيل الإشعارات (يظهر لأي زائر: معلن/شركة، سفاري/رابط) ============
// شاشة تنبثق تعلّم المستخدم كيف يثبّت المنصة على جواله ويفعّل الإشعارات.
// تظهر مرة واحدة في الجلسة، وتُكتَم لمن ثبّت التطبيق وفعّل الإشعارات أصلاً.
(function () {
  var SKIP_KEY = 'simbl_install_skip';
  var IMG = '/notify-guide.png';

  function isStandalone() {
    try { return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true; }
    catch (e) { return false; }
  }
  function notifGranted() {
    try { return typeof Notification !== 'undefined' && Notification.permission === 'granted'; }
    catch (e) { return false; }
  }
  function hasUser() {
    try { var u = JSON.parse(localStorage.getItem('simbl_current_user') || 'null'); return !!(u && u.id); }
    catch (e) { return false; }
  }
  // لا نكدّس فوق نوافذ أخرى مفتوحة (المدينة/القروب/إنشاء حملة)
  function otherModalOpen() {
    return !!document.querySelector('#city-modal.on, #group-modal.on, #campaign-modal.show, #push-modal.on');
  }

  function inject() {
    if (document.getElementById('simbl-install-modal')) return;
    var st = document.createElement('style');
    st.textContent =
      '#simbl-install-modal{position:fixed;inset:0;z-index:100000;background:rgba(12,26,24,.6);display:none;align-items:center;justify-content:center;padding:16px;font-family:inherit}' +
      '#simbl-install-modal.on{display:flex}' +
      '#simbl-install-modal .ig-box{background:#fff;border-radius:22px;max-width:420px;width:100%;max-height:92vh;overflow-y:auto;padding:22px 20px;box-shadow:0 20px 50px rgba(0,0,0,.3);text-align:center;position:relative;direction:rtl}' +
      '#simbl-install-modal .ig-close{position:absolute;top:12px;left:14px;width:30px;height:30px;border:0;border-radius:50%;background:#f1f4f4;color:#5b5b5b;font-size:18px;cursor:pointer;line-height:1}' +
      '#simbl-install-modal .ig-ic{font-size:40px;margin-bottom:6px}' +
      '#simbl-install-modal h3{margin:0 0 8px;font-size:20px;color:#141414;font-weight:700}' +
      '#simbl-install-modal p{margin:0 0 14px;font-size:14px;color:#5b5b5b;line-height:1.7}' +
      '#simbl-install-modal .ig-img{width:100%;border-radius:14px;border:1px solid #eef2f2;display:block;margin:0 auto 16px}' +
      '#simbl-install-modal .ig-cta{width:100%;padding:14px;border:0;border-radius:100px;background:#13B9B2;color:#fff;font-family:inherit;font-size:15px;font-weight:700;cursor:pointer}' +
      '#simbl-install-modal .ig-cta:hover{filter:brightness(.97)}' +
      '#simbl-install-modal .ig-skip{display:inline-block;margin-top:12px;font-size:13px;color:#8a8a8a;cursor:pointer;text-decoration:underline}';
    document.head.appendChild(st);

    var cta = hasUser() ? 'تفعيل الآن' : 'فهمت';
    var wrap = document.createElement('div');
    wrap.id = 'simbl-install-modal';
    wrap.innerHTML =
      '<div class="ig-box">' +
      '<button class="ig-close" aria-label="إغلاق">×</button>' +
      '<div class="ig-ic">🔔</div>' +
      '<h3>ثبّت المنصة وفعّل الإشعارات</h3>' +
      '<p>ثبّت سيمبل على جوالك عشان توصلك عروض الحملات وتحديثاتك أول بأول — حتى والتطبيق مغلق. اتبع الخطوات:</p>' +
      '<img class="ig-img" src="' + IMG + '" alt="خطوات تثبيت المنصة وتفعيل الإشعارات" loading="lazy">' +
      '<button class="ig-cta">' + cta + '</button>' +
      '<div class="ig-skip">لاحقًا</div>' +
      '</div>';
    document.body.appendChild(wrap);

    wrap.querySelector('.ig-close').addEventListener('click', skip);
    wrap.querySelector('.ig-skip').addEventListener('click', skip);
    wrap.querySelector('.ig-cta').addEventListener('click', enable);
  }

  function show() { inject(); var m = document.getElementById('simbl-install-modal'); if (m) m.classList.add('on'); }
  function skip() {
    try { sessionStorage.setItem(SKIP_KEY, '1'); } catch (e) {}
    var m = document.getElementById('simbl-install-modal'); if (m) m.classList.remove('on');
  }
  function enable() {
    skip();
    try {
      if (hasUser() && typeof manualEnablePush === 'function') { manualEnablePush(); return; }
    } catch (e) { console.warn('install-guide enable:', e); }
  }

  window.simblInstallGuide = { show: show, skip: skip, enable: enable };

  function maybe() {
    var force = location.search.indexOf('pushtest') !== -1; // وضع المعاينة للتجربة
    if (force) { show(); return; }
    if (isStandalone() && notifGranted()) return;           // مثبّت + مفعّل → لا شيء
    try { if (sessionStorage.getItem(SKIP_KEY) === '1') return; } catch (e) {}
    if (otherModalOpen()) return;                           // نافذة أخرى مفتوحة → الجلسة الجاية
    show();
  }
  function start() { setTimeout(maybe, 2200); }             // نعطي وقت لمودالات المدينة/القروب تظهر أولاً
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
