(function () {
  var TEXT = 'المنصة تحت الصيانة في الوقت الحالي';
  function add() {
    if (!document.body || document.getElementById('maint-banner')) return;
    var b = document.createElement('div');
    b.id = 'maint-banner';
    b.setAttribute('role', 'status');
    b.dir = 'rtl';
    b.textContent = TEXT;
    b.style.cssText = 'position:sticky;top:0;left:0;right:0;width:100%;box-sizing:border-box;z-index:2147483647;background:#FFD400;color:#000;text-align:center;font:700 15px/1.4 system-ui,-apple-system,"Segoe UI",Tahoma,Arial,sans-serif;padding:10px 16px;padding-top:calc(10px + env(safe-area-inset-top,0px));margin:0;';
    document.body.insertBefore(b, document.body.firstChild);
  }
  if (document.body) add(); else document.addEventListener('DOMContentLoaded', add);
})();
