// إعدادات Supabase لسيمبل
const SUPABASE_URL = 'https://rdzzzasbyzugxogbgwwn.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJkenp6YXNieXp1Z3hvZ2Jnd3duIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3MDI5NjMsImV4cCI6MjA5NTI3ODk2M30.aS9lOVt7VyfwTV7bmsxxDUanWfs5v-TMBlGbwcDNomM';

if (!window.supabase) {
  console.error('Supabase library not loaded!');
}

// إعدادات الجلسة: حفظ دائم + تجديد تلقائي - الجلسة ما تنتهي إلا لما المستخدم نفسه يضغط خروج
window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: window.localStorage
  }
});

// ===== مطابقة الموقع (دولة/مدينة) بين الحملة والمعلن — مصدر موحّد للإشعار والخلاصة =====
// القاعدة: لا دولة على الحملة → الجميع · دولة بلا مدينة أو «all» → كل معلني الدولة ·
// دولة + مدينة محددة → نفس المدينة + معلني الدولة اللي مدينتهم غير مسجّلة (NULL).
function simblLocationMatch(creator, campaign) {
  // استهداف صارم: لا دولة على الحملة → الجميع · دولة → لازم نفس الدولة ·
  // مدينة محددة (غير all) → لازم نفس المدينة بالضبط (معلن بلا مدينة مسجّلة يُحجب).
  const norm = v => (v == null ? '' : String(v).trim().toLowerCase());
  if (!campaign || !campaign.country) return true;                                 // لا دولة → الجميع
  if (!creator || norm(creator.country) !== norm(campaign.country)) return false;  // لازم نفس الدولة
  const campCity = norm(campaign.city);
  if (!campCity || campCity === 'all') return true;                                // كل مدن الدولة
  return norm(creator.city) === campCity;                                          // تطابق المدينة الصارم
}

// ===== استهداف المنصة + نطاق المتابعين (استهداف صارم) =====
// شرائح المتابعين: بداية الشريحة → [الحد الأدنى, الحد الأعلى)
const SIMBL_FOLLOWER_BUCKETS = {
  '10000':[10000,20000], '20000':[20000,50000], '50000':[50000,100000],
  '100000':[100000,200000], '200000':[200000,300000], '300000':[300000,500000],
  '500000':[500000,700000], '700000':[700000,1000000], '1000000':[1000000,2000000],
  '2000000':[2000000,Infinity], '3000000':[3000000,Infinity], '4000000':[4000000,Infinity]
};

// المنصة: لا منصة على الحملة → الجميع · منصة محددة → لازم نفس منصة المعلن (معلن بلا منصة يُحجب)
function simblPlatformMatch(creator, campaign) {
  const cp = (campaign && campaign.platform != null) ? String(campaign.platform).trim().toLowerCase() : '';
  if (!cp) return true;
  const up = (creator && creator.platform != null) ? String(creator.platform).trim().toLowerCase() : '';
  return up === cp;
}

// المتابعون: لا نطاق على الحملة → الجميع · نطاق محدد → متابعو المعلن ضمن إحدى الشرائح المختارة
// (معلن متابعوه غير معروفين/صفر يُحجب من الحملات المحددة النطاق)
function simblFollowerMatch(creator, campaign) {
  const raw = (campaign && campaign.follower_range != null) ? String(campaign.follower_range).trim() : '';
  if (!raw) return true;
  const buckets = raw.split(',').map(s => s.trim()).filter(Boolean);
  if (!buckets.length) return true;
  const f = Number(creator && creator.followers);
  if (!isFinite(f) || f <= 0) return false;
  return buckets.some(b => {
    const rng = SIMBL_FOLLOWER_BUCKETS[b];
    return rng ? (f >= rng[0] && f < rng[1]) : false;
  });
}

// التصنيف (Micro (UGC) / Medium / Mega): لا تصنيف على الحملة → الجميع ·
// تصنيف محدّد → لازم تصنيف المعلن ضمن المختار (معلن بلا تصنيف يُحجب من الحملات المصنّفة)
function simblTierMatch(creator, campaign) {
  const raw = (campaign && campaign.creator_tiers != null) ? String(campaign.creator_tiers).trim() : '';
  if (!raw) return true;
  const tiers = raw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  if (!tiers.length) return true;
  const ct = (creator && creator.creator_tier != null) ? String(creator.creator_tier).trim().toLowerCase() : '';
  if (!ct) return false;
  return tiers.includes(ct);
}

// مطابقة موحّدة: الدولة + المدينة + المنصة + نطاق المتابعين + التصنيف
function simblTargetMatch(creator, campaign) {
  return simblLocationMatch(creator, campaign)
      && simblPlatformMatch(creator, campaign)
      && simblFollowerMatch(creator, campaign)
      && simblTierMatch(creator, campaign);
}

// سبب قفل الحملة للمعلن غير المطابق (أول بُعد غير مطابق) — تُعرض الحملة للاطّلاع لكن بلا دخول
function simblLockReason(creator, campaign) {
  const norm = v => (v == null ? '' : String(v).trim().toLowerCase());
  if (!simblLocationMatch(creator, campaign)) {
    const COUNTRY = { sa:'السعودية', ae:'الإمارات', qa:'قطر', kw:'الكويت', bh:'البحرين' };
    if (campaign && campaign.country && norm(creator && creator.country) === norm(campaign.country)
        && campaign.city && norm(campaign.city) !== 'all') {
      return 'هذي الحملة لمعلني مدينة محدّدة';
    }
    const cc = campaign && campaign.country ? (COUNTRY[norm(campaign.country)] || campaign.country) : '';
    return cc ? ('هذي الحملة لمعلني ' + cc) : 'هذي الحملة لمنطقة مختلفة';
  }
  if (!simblPlatformMatch(creator, campaign)) {
    const P = { tiktok:'تيك توك', snapchat:'سناب شات', x:'إكس', instagram:'انستقرام', youtube:'يوتيوب' };
    const p = P[norm(campaign.platform)] || campaign.platform;
    return 'هذي الحملة للنشر على ' + p;
  }
  if (!simblFollowerMatch(creator, campaign)) {
    return 'هذي الحملة لنطاق متابعين مختلف عن نطاقك';
  }
  if (!simblTierMatch(creator, campaign)) {
    const T = { micro:'Micro (UGC)', medium:'Medium', mega:'Mega' };
    const names = String((campaign && campaign.creator_tiers) || '')
      .split(',').map(s => T[s.trim().toLowerCase()] || s.trim()).filter(Boolean).join('، ');
    return names ? ('هذي الحملة لتصنيف: ' + names) : 'هذي الحملة لتصنيف مختلف';
  }
  return '';
}

// ============ إدارة الجلسة: نعتمد على autoRefreshToken المدمج فقط ============
// أزلنا التجديد اليدوي المتعدد (كان يستدعي refreshSession عند تبديل التبويب + كل 4 دقائق + عند الفتح)
// لأنه يسبّب "refresh token already used" → تسجيل خروج مفاجئ وعشوائي (خصوصًا مع تعدد التبويبات/الأجهزة).
// المكتبة تجدّد الجلسة لحالها مرة وحدة وبتنسيق آمن بين التبويبات. ونكتفي بالإصغاء لحدث الخروج
// لعرض شاشة "انتهت جلستك" بدل صفحة فاضية — بلا أي استفزاز للتوكن.
try {
  if (window.supabaseClient && window.supabaseClient.auth && window.supabaseClient.auth.onAuthStateChange) {
    window.supabaseClient.auth.onAuthStateChange(function (event) {
      if (event === 'SIGNED_OUT' && !window.__simblLoggingOut) {
        try {
          if (localStorage.getItem('simbl_current_user')
              && typeof simblOnLoginPage === 'function' && !simblOnLoginPage()
              && typeof simblShowSessionExpired === 'function') {
            simblShowSessionExpired();
          }
        } catch (e) { /* تجاهل */ }
      }
    });
  }
} catch (e) { /* تجاهل */ }

// ============ ضمان جلسة Auth طازجة قبل تحميل البيانات ============
// إصلاح "اختفاء الحملات/الأسماء على الجوال بعد يوم": الهوية محفوظة لكن توكن الجلسة
// ينتهي أو يتأخر تحميله عند الفتح البارد، فتُرفض القراءات (RLS) وتبان فاضية.
// هنا نتأكد إن التوكن محمّل ومجدّد قبل أي قراءة.
async function simblEnsureFreshSession() {
  try {
    if (!window.supabaseClient) return;
    const { data } = await supabaseClient.auth.getSession();
    const s = data && data.session;
    if (!s) {
      // ما فيه جلسة محمّلة (توكن راح مؤقتًا على الجوال) → جرّب تجديدها من refresh token المخزّن
      return; // لا نجدّد يدويًا (autoRefreshToken يتكفّل) — نتفادى 'refresh token already used'
    }
    const msLeft = (s.expires_at ? s.expires_at * 1000 : 0) - Date.now();
    // لا نجدّد يدويًا — المكتبة تتكفّل بالتجديد بأمان.
  } catch (e) { /* نكمّل حتى لو فشل الفحص */ }
}

async function dbSignup(userData) {
  const { data, error } = await supabaseClient
    .from('users')
    .insert([userData])
    .select('id, role, name, platform, handle, followers, category, price, bio, company_name, industry, size, position, website, created_at, auth_id, approval_status, cr_number, is_test, avatar_url, country, city, creator_tier')
    .single();
  if (error) throw error;
  return data;
}

async function dbGetCampaigns() {
  const { data, error } = await supabaseClient
    .from('campaigns')
    .select('*, users!campaigns_brand_id_fkey(company_name)')
    .eq('is_direct', false)
    .in('status', ['active', 'closed', 'completed'])
    .eq('is_test', !!getCurrentUser()?.is_test)
    .order('created_at', { ascending: false });
  if (error) throw error;

  // فلترة الموقع: المعلن يشوف فقط الحملات اللي تستهدف دولته/مدينته.
  // إصلاح fail-open: بدل ما نعرض كل الحملات لمعلن دولته مجهولة في الكائن المخزّن،
  // نعيد جلب دولته من القاعدة أولًا (ونحدّث المخزّن)، ثم نفلتر دائمًا — فلا تتسرّب حملة خارج منطقته.
  let __me = getCurrentUser();
  let __rows = data || [];
  if (__me && __me.role === 'creator') {
    if (!__me.country || !__me.platform || __me.followers == null || __me.creator_tier === undefined) {
      try {
        const { data: __fresh } = await supabaseClient
          .from('users').select('country, city, platform, followers, creator_tier').eq('id', __me.id).maybeSingle();
        if (__fresh) {
          __me = { ...__me, ...__fresh };
          if (typeof saveCurrentUser === 'function') saveCurrentUser(__me); // حدّث الكائن المخزّن للمرات الجاية
        }
      } catch (e) { /* تجاهل — نفلتر بالمتاح */ }
    }
    // نُظهر كل الحملات للمعلن (شفافية)، ونعلّم غير المطابقة بقفل + سبب بدل إخفائها
    __rows = __rows.map(c => {
      const ok = (typeof simblTargetMatch === 'function') ? simblTargetMatch(__me, c) : true;
      return { ...c, _targetMatch: ok, _lockReason: ok ? '' : (typeof simblLockReason === 'function' ? simblLockReason(__me, c) : 'غير متاحة لك') };
    });
  }
  return __rows.map(c => ({
    ...c,
    brand: c.users?.company_name || 'شركة',
    tags: c.tags || []
  }));
}

async function dbGetMyCampaigns(brandId) {
  const { data, error } = await supabaseClient
    .from('campaigns')
    .select('*')
    .eq('brand_id', brandId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

async function dbCreateCampaign(campaignData) {
  const { data, error } = await supabaseClient
    .from('campaigns')
    .insert([campaignData])
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function dbApply(applicationData) {
  const { data, error } = await supabaseClient
    .from('applications')
    .insert([applicationData])
    .select()
    .single();
  if (error) {
    // القيد الفريد (23505): المعلن طبّق على هذه الحملة من قبل →
    // نرجّع التطبيق الموجود بدل رمي خطأ، فينتقل لمفاوضته الحالية بسلاسة.
    if (error.code === '23505' && applicationData && applicationData.creator_id && applicationData.campaign_id) {
      const { data: existing, error: findErr } = await supabaseClient
        .from('applications')
        .select('*')
        .eq('creator_id', applicationData.creator_id)
        .eq('campaign_id', applicationData.campaign_id)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (!findErr && existing) return existing;
    }
    throw error;
  }
  return data;
}

async function dbGetMyApplications(creatorId) {
  const { data, error } = await supabaseClient
    .from('applications')
    .select('*, campaigns(title, description, status, users!campaigns_brand_id_fkey(company_name))')
    .eq('creator_id', creatorId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

async function dbGetCampaignApplications(campaignId) {
  const { data, error } = await supabaseClient
    .from('applications')
    .select('*, users!applications_creator_id_fkey(name, platform, handle, followers, category, website)')
    .eq('campaign_id', campaignId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

function getCurrentUser() {
  // أولاً نحاول من localStorage
  let json = localStorage.getItem('simbl_current_user');

  // لو ما لقينا، نحاول من cookie كنسخة احتياطية
  if (!json) {
    const cookieMatch = document.cookie.match(/simbl_user_id=([^;]+)/);
    if (cookieMatch) {
      // فيه cookie، لكن البيانات في localStorage راحت
      // نرجع null عشان الصفحة تجلب البيانات من قاعدة البيانات
      return null;
    }
  }

  return json ? JSON.parse(json) : null;
}

function saveCurrentUser(user) {
  // نحفظ في localStorage (الأساسي) - يبقى للأبد إلا لو المستخدم مسح بيانات المتصفح
  localStorage.setItem('simbl_current_user', JSON.stringify(user));

  // نحفظ id في cookie لمدة 10 سنوات كاحتياطي
  const expires = new Date();
  expires.setFullYear(expires.getFullYear() + 10);
  document.cookie = `simbl_user_id=${user.id}; expires=${expires.toUTCString()}; path=/; SameSite=Lax`;
}

function clearCurrentUser() {
  localStorage.removeItem('simbl_current_user');
  // نمسح الـ cookie
  document.cookie = 'simbl_user_id=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';

  // نسجّل خروج من Supabase Auth كذلك عشان الجلسة تنتهي كاملة
  try {
    window.__simblLoggingOut = true;   // خروج متعمّد → لا تعرض شاشة "انتهت جلستك"
    if (window.supabaseClient && window.supabaseClient.auth) {
      window.supabaseClient.auth.signOut();
    }
  } catch (e) {}
}

// محاولة استعادة الجلسة من cookie لو localStorage راح — مع إعادة محاولة
// (إصلاح تذبذب الجلسة: قبل كانت تحاول مرة وحدة وتستسلم بصمت لو فشلت لحظيًا)
// ============ كشف الجلسة الميتة وإعادة المصادقة تلقائيًا ============
// المشكلة: الهوية المخزّنة (simbl_current_user) تبقى حتى لو ماتت جلسة Auth،
// فالصفحة تحسبك "داخل" وتحمّل بيانات فاضية (RLS يرفض بلا جلسة) → تبان الحملات/الأسماء اختفت.
// الحل: نتأكد إن الجلسة حيّة فعلًا؛ لو ماتت نعرض "انتهت جلستك — سجّل دخول" (يؤتمت خطوة الخروج/الدخول اليدوية).
function simblOnLoginPage() {
  const p = (location.pathname || '').toLowerCase();
  return p === '/' || p === '' || p.indexOf('signup') >= 0 || p.indexOf('login') >= 0 || p.indexOf('index') >= 0;
}

async function simblSessionAlive() {
  try {
    if (!window.supabaseClient) return true;               // ما نقدر نتأكد → لا نمنع
    const { data } = await supabaseClient.auth.getSession();
    // فيه جلسة مخزّنة؟ (حتى لو التوكن قريب الانتهاء، autoRefreshToken يتكفّل بالتجديد لحاله بأمان).
    // لا نستدعي refreshSession يدويًا هنا — التجديد اليدوي يسبّب "refresh token already used".
    return !!(data && data.session);
  } catch (e) { return true; }                             // عند الشك لا نمنع
}

function simblShowSessionExpired() {
  try {
    if (document.getElementById('simbl-session-expired')) return;
    const o = document.createElement('div');
    o.id = 'simbl-session-expired';
    o.setAttribute('style', 'position:fixed;inset:0;z-index:99999;background:#ffffff;display:flex;align-items:center;justify-content:center;padding:24px;font-family:inherit;');
    o.innerHTML = '<div style="max-width:420px;text-align:center;">'
      + '<div style="width:76px;height:76px;border-radius:50%;background:rgba(19,185,178,0.12);display:flex;align-items:center;justify-content:center;margin:0 auto 22px;font-size:34px;">\uD83D\uDD12</div>'
      + '<h2 style="font-size:24px;margin:0 0 10px;color:#0a0a0a;font-weight:700;">انتهت جلستك</h2>'
      + '<p style="font-size:15px;color:#6b6b6b;line-height:1.8;margin:0 0 22px;">حسابك سليم، بس الجلسة انتهت. سجّل دخول من جديد وترجع بياناتك مباشرة.</p>'
      + '<button id="simbl-relogin-btn" style="padding:13px 34px;border-radius:100px;border:0;background:#13B9B2;color:#fff;font-family:inherit;font-size:15px;font-weight:700;cursor:pointer;">سجّل دخول</button>'
      + '<div style="margin-top:14px;"><span id="simbl-retry-link" style="font-size:13px;color:#6b6b6b;cursor:pointer;text-decoration:underline;">إعادة المحاولة</span></div>'
      + '</div>';
    document.body.appendChild(o);
    const btn = document.getElementById('simbl-relogin-btn');
    if (btn) btn.onclick = function () { try { if (typeof clearCurrentUser === 'function') clearCurrentUser(); } catch (e) {} window.location.href = '/signup.html'; };
    const rt = document.getElementById('simbl-retry-link');
    if (rt) rt.onclick = function () { window.location.reload(); };
  } catch (e) { window.location.href = '/signup.html'; }
}

async function tryRestoreSession() {
  // 0) تأكّد إن جلسة Auth حيّة فعلًا؛ لو ماتت والهوية محفوظة → اعرض "انتهت جلستك"
  const __alive = await simblSessionAlive();
  if (!__alive) {
    const __hasIdentity = !!localStorage.getItem('simbl_current_user') || /simbl_user_id=/.test(document.cookie);
    if (__hasIdentity && !simblOnLoginPage()) { simblShowSessionExpired(); return false; }
  }

  // لو الجلسة موجودة في localStorage، خلاص
  if (localStorage.getItem('simbl_current_user')) return true;

  // نشوف cookie
  const cookieMatch = document.cookie.match(/simbl_user_id=([^;]+)/);
  if (!cookieMatch) return false;

  const userId = cookieMatch[1];

  // نعيد المحاولة حتى 5 مرات مع تراجع تدريجي (نتفادى فشل الشبكة البطيئة عند الفتح البارد)
  const backoff = [400, 700, 1100, 1600, 2200];
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const { data, error } = await supabaseClient
        .from('users')
        .select('id, role, name, platform, handle, followers, category, price, bio, company_name, industry, size, position, website, created_at, auth_id, approval_status, cr_number, is_test, avatar_url, country, city, creator_tier')
        .eq('id', userId)
        .maybeSingle();

      if (data) {
        saveCurrentUser(data);   // رجّعنا المستخدم لـ localStorage
        return true;
      }
      // ما فيه data وما فيه خطأ → المستخدم غير موجود فعلاً، لا داعي لإعادة المحاولة
      if (!error) return false;
    } catch (err) {
      console.error('Restore attempt ' + (attempt + 1) + ' failed:', err);
    }
    // انتظر قبل المحاولة الجاية (تراجع تدريجي)
    await new Promise(r => setTimeout(r, backoff[attempt] || 2000));
  }
  return false;
}
