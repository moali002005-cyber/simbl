/* نافذة خدمة عملاء سيمبل — تُحقن في صفحات المعلن والشركة
   تعتمد على supabaseClient و getCurrentUser() من supabase-config.js */
(function () {
  if (window.__simblSupportLoaded) return;
  window.__simblSupportLoaded = true;

  var CATS = [
    ['campaign', 'حملة أو صفقة'],
    ['account', 'الحساب والتفعيل'],
    ['payment', 'مستحقات ودفع'],
    ['agent', 'وكيل التفاوض'],
    ['bug', 'عطل في المنصة'],
    ['other', 'شيء آخر']
  ];
  var CAT_AR = {}; CATS.forEach(function (c) { CAT_AR[c[0]] = c[1]; });
  var ST_AR = { open: 'مفتوحة', answered: 'تم الرد عليها', closed: 'مغلقة' };

  var CSS = ''
    + '.flfs-btn{position:fixed;bottom:20px;inset-inline-end:20px;z-index:9998;display:inline-flex;align-items:center;gap:8px;'
    + 'background:#0c4f4b;color:#fff;border:0;border-radius:100px;padding:12px 18px;font-family:inherit;font-size:13.5px;'
    + 'font-weight:600;cursor:pointer;box-shadow:0 10px 28px -12px rgba(0,0,0,.55);transition:transform .15s}'
    + '.flfs-btn:hover{transform:translateY(-2px)}'
    // ما يغطي زر الإرسال: يختفي وقت الكتابة، وعلى الجوال يصير دائرة صغيرة
    + '.flfs-btn.flfs-hide{display:none!important}'
    + '@media (max-width:640px){.flfs-btn{width:46px;height:46px;padding:0;justify-content:center;font-size:0;bottom:84px}.flfs-btn::after{content:"💬";font-size:20px}.flfs-btn .flfs-dot{position:absolute;top:6px;inset-inline-start:6px}}'
    + '.flfs-st{border-radius:10px;padding:10px 12px;font-size:12.5px;line-height:1.7;margin-bottom:14px}'
    + '.flfs-st.ok{background:#E8F7EE;color:#1B6B3A}'
    + '.flfs-st.wait{background:#FDF4E3;color:#8A5A12}'
    + '.flfs-st.no{background:#FDECEA;color:#B02A20}'
    + '.flfs-btn .flfs-dot{width:8px;height:8px;border-radius:50%;background:#FFB020;display:none}'
    + '.flfs-btn.has-reply .flfs-dot{display:inline-block}'
    + '.flfs-ov{position:fixed;inset:0;z-index:9999;background:rgba(15,20,32,.45);display:none;align-items:flex-end;justify-content:flex-start;padding:20px}'
    + '.flfs-ov.open{display:flex}'
    + '.flfs-panel{background:#fff;width:min(380px,100%);max-height:min(620px,86vh);border-radius:18px;display:flex;flex-direction:column;'
    + 'overflow:hidden;box-shadow:0 24px 60px -20px rgba(0,0,0,.5);font-family:inherit}'
    + '.flfs-hd{background:#0c4f4b;color:#fff;padding:16px 18px;display:flex;justify-content:space-between;align-items:flex-start;gap:10px}'
    + '.flfs-hd h4{margin:0;font-size:15.5px;font-weight:700}'
    + '.flfs-hd p{margin:4px 0 0;font-size:12px;opacity:.72;line-height:1.6}'
    + '.flfs-x{background:transparent;border:0;color:#fff;font-size:20px;line-height:1;cursor:pointer;opacity:.7}'
    + '.flfs-x:hover{opacity:1}'
    + '.flfs-tabs{display:flex;border-bottom:1px solid #EFEBE8;background:#FAF8F7}'
    + '.flfs-tab{flex:1;background:transparent;border:0;padding:11px 8px;font-family:inherit;font-size:13px;font-weight:600;'
    + 'color:#8A807B;cursor:pointer;border-bottom:2px solid transparent}'
    + '.flfs-tab.on{color:#0c4f4b;border-bottom-color:#13B9B2}'
    + '.flfs-body{padding:16px 18px;overflow-y:auto;flex:1}'
    + '.flfs-f{margin-bottom:12px}'
    + '.flfs-f label{display:block;font-size:12px;font-weight:600;color:#5f5b58;margin-bottom:6px}'
    + '.flfs-f select,.flfs-f textarea,.flfs-f input{width:100%;box-sizing:border-box;font-family:inherit;font-size:13.5px;'
    + 'padding:10px 12px;border:1px solid #E4DEDA;border-radius:10px;background:#fff;color:#16110F}'
    + '.flfs-f textarea{min-height:110px;resize:vertical;line-height:1.7}'
    + '.flfs-send{width:100%;background:linear-gradient(135deg,#13B9B2,#0c4f4b);color:#fff;border:0;border-radius:100px;'
    + 'padding:12px;font-family:inherit;font-size:14px;font-weight:700;cursor:pointer}'
    + '.flfs-send:disabled{opacity:.6;cursor:default}'
    + '.flfs-note{font-size:11.5px;color:#8A807B;line-height:1.7;margin-top:10px;text-align:center}'
    + '.flfs-ok{background:rgba(11,107,79,.08);color:#0B6B4F;border-radius:12px;padding:12px 14px;font-size:13px;line-height:1.8}'
    + '.flfs-t{border:1px solid #EFEBE8;border-radius:12px;padding:12px 14px;margin-bottom:10px}'
    + '.flfs-th{display:flex;justify-content:space-between;gap:10px;align-items:baseline;margin-bottom:6px}'
    + '.flfs-tc{font-size:12px;font-weight:700;color:#16110F}'
    + '.flfs-ts{font-size:11px;font-weight:700;border-radius:100px;padding:2px 9px}'
    + '.flfs-ts.open{background:rgba(154,75,6,.10);color:#9A4B06}'
    + '.flfs-ts.answered{background:rgba(11,107,79,.10);color:#0B6B4F}'
    + '.flfs-ts.closed{background:rgba(15,20,32,.06);color:#8A807B}'
    + '.flfs-tm{font-size:12.5px;color:#3d3936;line-height:1.75;white-space:pre-wrap;word-break:break-word}'
    + '.flfs-r{margin-top:8px;padding-top:8px;border-top:1px dashed #EFEBE8;font-size:12.5px;line-height:1.75;white-space:pre-wrap}'
    + '.flfs-r b{display:block;font-size:11px;margin-bottom:2px}'
    + '.flfs-r.admin b{color:#0B6B4F}.flfs-r.user b{color:#8A807B}'
    + '.flfs-rep{display:flex;gap:6px;margin-top:8px}'
    + '.flfs-rep input{flex:1}'
    + '.flfs-rep button{background:#0c4f4b;color:#fff;border:0;border-radius:10px;padding:0 14px;font-family:inherit;font-size:12.5px;cursor:pointer}'
    + '.flfs-empty{color:#8A807B;font-size:13px;text-align:center;padding:22px 0}'
    + '@media(max-width:520px){.flfs-ov{padding:0;align-items:stretch}.flfs-panel{width:100%;max-height:100vh;border-radius:0}}';

  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (m) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m];
    });
  }
  function ago(t) {
    if (!t) return '';
    var d = new Date(t); if (isNaN(d)) return '';
    var m = Math.floor((Date.now() - d.getTime()) / 60000);
    if (m < 1) return 'الآن';
    if (m < 60) return 'قبل ' + m + ' دقيقة';
    var h = Math.floor(m / 60);
    if (h < 24) return 'قبل ' + h + ' ساعة';
    return 'قبل ' + Math.floor(h / 24) + ' يوم';
  }
  function me() {
    try { return (typeof getCurrentUser === 'function') ? getCurrentUser() : null; } catch (e) { return null; }
  }

  var btn, ov, panel, bodyBox, tabNew, tabMine, current = 'new';

  function build() {
    var st = el('style'); st.textContent = CSS; document.head.appendChild(st);

    btn = el('button', 'flfs-btn', '<span class="flfs-dot"></span>💬 خدمة العملاء');
    btn.type = 'button';
    btn.setAttribute('aria-label', 'خدمة عملاء سيمبل');
    btn.onclick = open;
    document.body.appendChild(btn);
    // صفحة التفاوض فيها خانة كتابة وزر إرسال أسفل الشاشة — الزر العائم كان يغطيه، فنخفيه هناك
    if (/\/campaign(\.html)?$/.test(location.pathname)) btn.classList.add('flfs-hide');
    var isField = function (t) { return t && t.matches && t.matches('input:not([type=checkbox]):not([type=radio]):not([type=file]),textarea,[contenteditable="true"]'); };
    document.addEventListener('focusin', function (e) { if (isField(e.target) && !(ov && ov.contains(e.target))) btn.classList.add('flfs-hide'); });
    document.addEventListener('focusout', function () {
      setTimeout(function () {
        if (/\/campaign(\.html)?$/.test(location.pathname)) return;
        if (!isField(document.activeElement)) btn.classList.remove('flfs-hide');
      }, 250);
    });

    ov = el('div', 'flfs-ov');
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    panel = el('div', 'flfs-panel');
    panel.innerHTML =
      '<div class="flfs-hd"><div><h4>خدمة عملاء سيمبل</h4>'
      + '<p>كتابة المشكلة أو الاستفسار، ويصل الرد هنا داخل المنصة.</p></div>'
      + '<button class="flfs-x" type="button" aria-label="إغلاق">×</button></div>'
      + '<div class="flfs-tabs"><button class="flfs-tab on" data-t="new" type="button">رسالة جديدة</button>'
      + '<button class="flfs-tab" data-t="mine" type="button">رسائلي</button></div>'
      + '<div class="flfs-body"></div>';
    ov.appendChild(panel);
    document.body.appendChild(ov);

    panel.querySelector('.flfs-x').onclick = close;
    bodyBox = panel.querySelector('.flfs-body');
    tabNew = panel.querySelector('[data-t="new"]');
    tabMine = panel.querySelector('[data-t="mine"]');
    tabNew.onclick = function () { current = 'new'; sync(); };
    tabMine.onclick = function () { current = 'mine'; sync(); };

    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
    checkReplies();
  }

  function sync() {
    tabNew.classList.toggle('on', current === 'new');
    tabMine.classList.toggle('on', current === 'mine');
    if (current === 'new') renderNew(); else renderMine();
  }
  function open() { ov.classList.add('open'); sync(); }
  function close() { ov.classList.remove('open'); }

  function renderNew() {
    var u = me();
    if (!u) {
      bodyBox.innerHTML = '<div class="flfs-empty">يُرجى تسجيل الدخول أولًا لنتمكّن من الرد عليك 🌿</div>';
      return;
    }
    bodyBox.innerHTML =
      statusStrip(u)
      + '<div class="flfs-f"><label for="flfs-cat">نوع المشكلة</label><select id="flfs-cat">'
      + '<option value="" selected>— اختيار نوع المشكلة —</option>'
      + CATS.map(function (c) { return '<option value="' + c[0] + '">' + c[1] + '</option>'; }).join('')
      + '</select></div>'
      + '<div class="flfs-f"><label for="flfs-msg">شرح المشكلة بالتفصيل</label>'
      + '<textarea id="flfs-msg" placeholder="ما الذي حدث بالضبط؟ ومتى؟ وإن كان الأمر يخص حملة أو صفقة معيّنة، يُرجى ذكر اسمها."></textarea></div>'
      + '<button class="flfs-send" id="flfs-send" type="button">إرسال</button>'
      + '<p class="flfs-note">نردّ خلال ساعات العمل. ويصلك الرد في «رسائلي» هنا.</p>';
    document.getElementById('flfs-send').onclick = send;
  }

  // عنوان مختصر من أول سطر الرسالة — كان العنوان اسم التصنيف نفسه
  // فكانت كل تذاكر الدفع بعنوان واحد ولا يمكن تمييزها في لوحة الأدمن
  function shortSubject(msg) {
    var line = String(msg || '').split(/\r?\n/)[0].trim();
    if (!line) return null;
    return line.length > 70 ? line.slice(0, 70) + '…' : line;
  }

  // جواب جاهز لأكثر سؤال يتكرر: «هل تم قبول حسابي؟» — نعرضه قبل ما يسأل
  function statusStrip(u) {
    var st = u && u.approval_status;
    if (st === 'approved') {
      return '<div class="flfs-st ok">✅ الحساب مُفعّل — ويمكن التقديم على أي حملة مناسبة من صفحة الحملات.</div>';
    }
    if (st === 'pending') {
      return '<div class="flfs-st wait">⏳ الحساب قيد المراجعة. لا حاجة لمراسلتنا عن التفعيل — ويصل إشعار فور الاعتماد.</div>';
    }
    if (st === 'rejected') {
      return '<div class="flfs-st no">الحساب غير مُعتمد حاليًا. في حال وجود خطأ، يمكن مراسلتنا وسنراجعه.</div>';
    }
    return '';
  }

  async function send() {
    var u = me(); if (!u) return;
    var b = document.getElementById('flfs-send');
    var msg = (document.getElementById('flfs-msg').value || '').trim();
    var cat = document.getElementById('flfs-cat').value;
    if (!cat) { alertish('يلزم اختيار نوع المشكلة أولًا لتصل للفريق المختص.'); return; }
    if (msg.length < 10) { alertish('يلزم تفاصيل أكثر حتى نتمكن من المساعدة.'); return; }
    b.disabled = true; b.textContent = 'جارٍ الإرسال...';
    try {
      var r = await supabaseClient.from('support_tickets').insert([{
        user_id: u.id, user_role: u.role || null, category: cat,
        subject: shortSubject(msg), message: msg, page_url: location.pathname
      }]).select().single();
      if (r.error) throw r.error;
      bodyBox.innerHTML = '<div class="flfs-ok">تلقّينا رسالتك 🌿<br>رقم التذكرة: <b>'
        + esc(String(r.data.id).slice(0, 8)) + '</b><br>سيصلك الرد في «رسائلي» داخل المنصة.</div>';
    } catch (e) {
      console.error('support send failed:', e);
      b.disabled = false; b.textContent = 'إرسال';
      alertish('تعذّر الإرسال، يُرجى المحاولة مرة أخرى.');
    }
  }
  function alertish(t) {
    try { if (typeof showToast === 'function') { showToast(t, 'error'); return; } } catch (e) {}
    var n = el('p', 'flfs-note', esc(t)); n.style.color = '#B02A20'; bodyBox.appendChild(n);
    setTimeout(function () { try { n.remove(); } catch (e) {} }, 4000);
  }

  async function renderMine() {
    var u = me();
    if (!u) { bodyBox.innerHTML = '<div class="flfs-empty">يُرجى تسجيل الدخول أولًا 🌿</div>'; return; }
    bodyBox.innerHTML = '<div class="flfs-empty">جارٍ التحميل…</div>';
    try {
      var t = await supabaseClient.from('support_tickets').select('*')
        .eq('user_id', u.id).order('updated_at', { ascending: false }).limit(20);
      if (t.error) throw t.error;
      var tickets = t.data || [];
      if (!tickets.length) { bodyBox.innerHTML = '<div class="flfs-empty">لم ترسل إلينا شيئًا بعد.</div>'; return; }
      var ids = tickets.map(function (x) { return x.id; });
      var rp = await supabaseClient.from('support_replies').select('*')
        .in('ticket_id', ids).order('created_at', { ascending: true });
      var byT = {};
      (rp.data || []).forEach(function (r) { (byT[r.ticket_id] = byT[r.ticket_id] || []).push(r); });

      bodyBox.innerHTML = tickets.map(function (x) {
        var reps = (byT[x.id] || []).map(function (r) {
          return '<div class="flfs-r ' + r.from_role + '"><b>'
            + (r.from_role === 'admin' ? 'سيمبل' : 'أنت') + ' · ' + ago(r.created_at) + '</b>'
            + esc(r.body) + '</div>';
        }).join('');
        return '<div class="flfs-t" data-id="' + esc(x.id) + '">'
          + '<div class="flfs-th"><span class="flfs-tc">' + esc(CAT_AR[x.category] || x.category) + '</span>'
          + '<span class="flfs-ts ' + esc(x.status) + '">' + esc(ST_AR[x.status] || x.status) + '</span></div>'
          + '<div class="flfs-tm">' + esc(x.message) + '</div>' + reps
          + (x.status === 'closed' ? ''
            : '<div class="flfs-rep"><input type="text" placeholder="إضافة رد…"><button type="button">إرسال</button></div>')
          + '<p class="flfs-note" style="text-align:start;margin-top:8px">' + ago(x.created_at) + '</p></div>';
      }).join('');

      Array.prototype.forEach.call(bodyBox.querySelectorAll('.flfs-rep button'), function (b) {
        b.onclick = async function () {
          var wrap = b.closest('.flfs-t'), inp = wrap.querySelector('input');
          var body = (inp.value || '').trim(); if (body.length < 2) return;
          b.disabled = true;
          try {
            await supabaseClient.from('support_replies').insert([
              { ticket_id: wrap.getAttribute('data-id'), from_role: 'user', body: body }]);
            renderMine();
          } catch (e) { console.error(e); b.disabled = false; }
        };
      });
      markSeen();
    } catch (e) {
      console.error('support list failed:', e);
      bodyBox.innerHTML = '<div class="flfs-empty">تعذّر تحميل رسائلك.</div>';
    }
  }

  // نقطة حمراء على الزر لو فيه رد جديد من المنصة
  async function checkReplies() {
    var u = me(); if (!u) return;
    try {
      var r = await supabaseClient.from('support_tickets').select('id, updated_at')
        .eq('user_id', u.id).eq('status', 'answered').order('updated_at', { ascending: false }).limit(1);
      if (r.error || !r.data || !r.data.length) return;
      var last = 0; try { last = Number(localStorage.getItem('simbl_support_seen') || 0); } catch (e) {}
      if (new Date(r.data[0].updated_at).getTime() > last) btn.classList.add('has-reply');
    } catch (e) { /* صامت */ }
  }
  function markSeen() {
    try { localStorage.setItem('simbl_support_seen', String(Date.now())); } catch (e) {}
    btn.classList.remove('has-reply');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
  else build();
})();
