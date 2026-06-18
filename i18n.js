// ============ محرّك تبديل اللغة (عربي / إنجليزي) ============
(function () {
  var DEFAULT = 'ar';            // اللغة الافتراضية
  var KEY = 'simbl_lang';        // مكان حفظ اختيار الزائر

  function getLang() {
    try { return localStorage.getItem(KEY) || DEFAULT; } catch (e) { return DEFAULT; }
  }
  function dict() {
    return (window.I18N && window.I18N[getLang()]) || {};
  }

  // يطبّق اللغة الحالية على كامل الصفحة
  function apply() {
    var lang = getLang();
    var html = document.documentElement;
    html.lang = lang;
    html.dir = (lang === 'en') ? 'ltr' : 'rtl';   // الإنجليزي يسار-لليمين

    var t = dict();
    var titleKey = document.documentElement.getAttribute('data-i18n-title') || 'page_title';
    if (t[titleKey]) document.title = t[titleKey];

    // النصوص العادية
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      var k = el.getAttribute('data-i18n');
      if (t[k] != null) el.textContent = t[k];
    });
    // النصوص داخل الحقول (placeholder)
    document.querySelectorAll('[data-i18n-placeholder]').forEach(function (el) {
      var k = el.getAttribute('data-i18n-placeholder');
      if (t[k] != null) el.setAttribute('placeholder', t[k]);
    });
    // زر تبديل اللغة: يعرض اللغة الأخرى
    document.querySelectorAll('[data-i18n-toggle]').forEach(function (el) {
      el.textContent = (lang === 'en') ? 'عربي' : 'EN';
    });
  }

  // واجهة عامة نستخدمها من أي صفحة
  window.simblI18n = {
    get: getLang,
    t: function (k) { var d = dict(); return d[k] != null ? d[k] : k; },
    set: function (lang) { try { localStorage.setItem(KEY, lang); } catch (e) {} apply(); },
    toggle: function () { this.set(getLang() === 'en' ? 'ar' : 'en'); },
    apply: apply
  };

  // اضبط الاتجاه واللغة مبكرًا (يقلّل وميض اللغة)، وبدّل النصوص عند جاهزية الصفحة
  (function early() {
    var lang = getLang();
    document.documentElement.lang = lang;
    document.documentElement.dir = (lang === 'en') ? 'ltr' : 'rtl';
  })();

  if (document.readyState !== 'loading') apply();
  else document.addEventListener('DOMContentLoaded', apply);
})();
