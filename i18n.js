// ============ محرّك تبديل اللغة (عربي / إنجليزي) ============
// يدعم طريقتين:
//   1) عناصر معلّمة بـ data-i18n (للصفحات القديمة: الرئيسية والدخول)
//   2) قاموس ترجمة تلقائي I18N_TEXT: يترجم أي نص عربي مطابق — حتى الديناميكي
(function () {
  var DEFAULT = 'ar';
  var KEY = 'simbl_lang';

  function getLang() {
    try { return localStorage.getItem(KEY) || DEFAULT; } catch (e) { return DEFAULT; }
  }
  function keyedDict() { return (window.I18N && window.I18N[getLang()]) || {}; }
  function textMap() { return window.I18N_TEXT || {}; }

  // (1) العناصر المعلّمة بمفتاح
  function applyKeyed(lang) {
    var t = keyedDict();
    var titleKey = document.documentElement.getAttribute('data-i18n-title');
    if (titleKey && t[titleKey]) document.title = t[titleKey];
    else if (!titleKey && t.page_title) document.title = t.page_title;
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      var k = el.getAttribute('data-i18n'); if (t[k] != null) el.textContent = t[k];
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(function (el) {
      var k = el.getAttribute('data-i18n-placeholder'); if (t[k] != null) el.setAttribute('placeholder', t[k]);
    });
    document.querySelectorAll('[data-i18n-toggle]').forEach(function (el) {
      el.textContent = (lang === 'en') ? 'عربي' : 'EN';
    });
  }

  // (2) القاموس التلقائي
  function skip(node) {
    var p = node.parentNode; if (!p) return true;
    var tag = p.nodeName;
    if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'TEXTAREA') return true;
    if (p.closest && p.closest('[data-i18n]')) return true;
    return false;
  }
  function swapTextNode(node, lang, map) {
    if (node._o == null) node._o = node.nodeValue;
    var orig = node._o, key = orig.trim();
    if (lang === 'en' && map[key] != null) node.nodeValue = orig.replace(key, map[key]);
    else node.nodeValue = orig;
  }
  function translateTree(root, lang) {
    var map = textMap();
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null), batch = [], n;
    while (n = w.nextNode()) { if (n.nodeValue && n.nodeValue.trim() && !skip(n)) batch.push(n); }
    batch.forEach(function (nd) { swapTextNode(nd, lang, map); });
    // placeholders
    var els = root.querySelectorAll ? root.querySelectorAll('[placeholder]') : [];
    Array.prototype.forEach.call(els, function (el) {
      if (el.hasAttribute('data-i18n-placeholder')) return;
      if (el._op == null) el._op = el.getAttribute('placeholder') || '';
      var orig = el._op, key = orig.trim();
      if (lang === 'en' && map[key] != null) el.setAttribute('placeholder', map[key]);
      else el.setAttribute('placeholder', orig);
    });
  }

  function apply() {
    var lang = getLang(), html = document.documentElement;
    html.lang = lang; html.dir = (lang === 'en') ? 'ltr' : 'rtl';
    applyKeyed(lang);
    if (document.body) translateTree(document.body, lang);
  }

  window.simblI18n = {
    get: getLang,
    t: function (k) { var d = keyedDict(); return d[k] != null ? d[k] : k; },
    set: function (lang) { try { localStorage.setItem(KEY, lang); } catch (e) {} apply(); },
    toggle: function () { this.set(getLang() === 'en' ? 'ar' : 'en'); },
    apply: apply
  };

  (function early() {
    var lang = getLang();
    document.documentElement.lang = lang;
    document.documentElement.dir = (lang === 'en') ? 'ltr' : 'rtl';
  })();

  function start() {
    apply();
    if (window.MutationObserver && document.body) {
      new MutationObserver(function (muts) {
        if (getLang() !== 'en') return;
        var map = textMap();
        muts.forEach(function (m) {
          for (var i = 0; i < m.addedNodes.length; i++) {
            var node = m.addedNodes[i];
            if (node.nodeType === 1) {
              if (node.closest && node.closest('[data-i18n]')) continue;
              translateTree(node, 'en');
            } else if (node.nodeType === 3 && !skip(node)) {
              swapTextNode(node, 'en', map);
            }
          }
        });
      }).observe(document.body, { childList: true, subtree: true });
    }
  }
  if (document.readyState !== 'loading') start();
  else document.addEventListener('DOMContentLoaded', start);
})();
