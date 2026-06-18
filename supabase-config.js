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

// ============ تجديد جلسة الدخول استباقيًا ============
// يتفادى رفض العمليات (حذف/تعديل/إضافة) بسبب انتهاء التوكن مؤقتًا قبل تجديده.
// يشتغل عند العودة لتبويب الصفحة + كل ٤ دقائق + فحص أوّلي. إضافة فقط — ما تغيّر أي سلوك موجود.
async function simblKeepSessionFresh() {
  try {
    if (!window.supabaseClient) return;
    const { data } = await supabaseClient.auth.getSession();
    const s = data && data.session;
    if (!s) return; // ما فيه جلسة (المستخدم غير مسجّل) — نتركه
    const msLeft = (s.expires_at ? s.expires_at * 1000 : 0) - Date.now();
    if (msLeft > 0 && msLeft < 120000) { // أقل من دقيقتين على الانتهاء → جدّد الآن
      await supabaseClient.auth.refreshSession();
    }
  } catch (e) { /* تجاهل بصمت */ }
}
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') simblKeepSessionFresh();
  });
  setInterval(simblKeepSessionFresh, 4 * 60 * 1000);
  setTimeout(simblKeepSessionFresh, 1500);
}

async function dbSignup(userData) {
  const { data, error } = await supabaseClient
    .from('users')
    .insert([userData])
    .select('id, role, name, platform, handle, followers, category, price, bio, company_name, industry, size, position, website, created_at, auth_id, approval_status, cr_number, is_test')
    .single();
  if (error) throw error;
  return data;
}

async function dbGetCampaigns() {
  const { data, error } = await supabaseClient
    .from('campaigns')
    .select('*, users!campaigns_brand_id_fkey(company_name)')
    .eq('status', 'active')
    .eq('is_test', !!getCurrentUser()?.is_test)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data.map(c => ({
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
  if (error) throw error;
  return data;
}

async function dbGetMyApplications(creatorId) {
  const { data, error } = await supabaseClient
    .from('applications')
    .select('*, campaigns(title, users!campaigns_brand_id_fkey(company_name))')
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

  // نحفظ id في cookie لمدة ١٠ سنوات كاحتياطي
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
    if (window.supabaseClient && window.supabaseClient.auth) {
      window.supabaseClient.auth.signOut();
    }
  } catch (e) {}
}

// محاولة استعادة الجلسة من cookie لو localStorage راح
async function tryRestoreSession() {
  // لو الجلسة موجودة في localStorage، خلاص
  if (localStorage.getItem('simbl_current_user')) return true;

  // نشوف cookie
  const cookieMatch = document.cookie.match(/simbl_user_id=([^;]+)/);
  if (!cookieMatch) return false;

  const userId = cookieMatch[1];
  try {
    const { data, error } = await supabaseClient
      .from('users')
      .select('id, role, name, platform, handle, followers, category, price, bio, company_name, industry, size, position, website, created_at, auth_id, approval_status, cr_number, is_test')
      .eq('id', userId)
      .maybeSingle();

    if (data) {
      saveCurrentUser(data);
      return true;
    }
  } catch (err) {
    console.error('Failed to restore session:', err);
  }
  return false;
}
