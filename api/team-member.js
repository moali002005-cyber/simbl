// Vercel Serverless Function: /api/team-member
// المالك (حساب شركة) ينشئ عضو فريق بإيميل وكلمة سر وصلاحيات محددة.
// إنشاء حساب المصادقة يتطلب Admin API (مفتاح الخدمة) — خادم فقط.
// الهوية تُشتقّ من توكن الجلسة (لا من جسم الطلب) لمنع الانتحال.

const SUPABASE_URL = 'https://rdzzzasbyzugxogbgwwn.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJkenp6YXNieXp1Z3hvZ2Jnd3duIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3MDI5NjMsImV4cCI6MjA5NTI3ODk2M30.aS9lOVt7VyfwTV7bmsxxDUanWfs5v-TMBlGbwcDNomM';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY;
const ALLOWED_PERMS = ['campaigns', 'deals', 'payments'];

function svcHeaders() {
  return { 'apikey': SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`, 'Content-Type': 'application/json' };
}
async function sbGet(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: svcHeaders() });
  if (!res.ok) { console.error('sbGet error:', await res.text()); throw new Error('GET failed'); }
  return res.json();
}
async function sbInsert(table, data) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST', headers: { ...svcHeaders(), 'Prefer': 'return=representation' }, body: JSON.stringify(data)
  });
  const txt = await res.text();
  if (!res.ok) { console.error(`sbInsert ${table} error:`, txt); throw new Error('INSERT failed'); }
  return txt ? JSON.parse(txt) : [];
}
async function getAuthedUser(req) {
  try {
    const authz = req.headers['authorization'] || req.headers['Authorization'] || '';
    const token = authz.startsWith('Bearer ') ? authz.slice(7).trim() : '';
    if (!token) return null;
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${token}` } });
    if (!r.ok) return null;
    const au = await r.json();
    if (!au || !au.id) return null;
    const rows = await sbGet(`users?auth_id=eq.${au.id}&select=id,role,company_name,is_test`);
    return (rows && rows[0]) || null;
  } catch (e) { console.error('getAuthedUser error:', e); return null; }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const owner = await getAuthedUser(req);
  if (!owner) return res.status(401).json({ error: 'يلزم تسجيل الدخول من جديد' });
  if (owner.role !== 'brand') return res.status(403).json({ error: 'مساحات الفرق مخصّصة لحسابات الشركات' });

  let { name, email, password, permissions } = req.body || {};
  name = String(name || '').trim();
  email = String(email || '').trim().toLowerCase();
  password = String(password || '');
  permissions = Array.isArray(permissions) ? permissions.filter(p => ALLOWED_PERMS.includes(p)) : [];

  if (!name) return res.status(400).json({ error: 'اكتب اسم العضو' });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'الإيميل غير صحيح' });
  if (password.length < 6) return res.status(400).json({ error: 'كلمة السر يجب أن تكون 6 أحرف على الأقل' });

  // 1) إنشاء حساب المصادقة (Admin API)
  let authId;
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
      method: 'POST', headers: svcHeaders(),
      body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { name, team_member: true } })
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.id) {
      const msg = (j && (j.msg || j.message || j.error_description || '')) || '';
      if (/already|exists|registered|duplicate/i.test(msg)) return res.status(409).json({ error: 'الإيميل مستخدم من قبل' });
      console.error('admin.createUser error:', j);
      return res.status(400).json({ error: 'تعذّر إنشاء الحساب' });
    }
    authId = j.id;
  } catch (e) { console.error(e); return res.status(500).json({ error: 'خطأ في إنشاء الحساب' }); }

  // 2) ملف المستخدم + عضوية الفريق (مع تنظيف حساب المصادقة عند الفشل)
  try {
    const profRows = await sbInsert('users', {
      role: 'brand', name, email, company_name: name,
      auth_id: authId, approval_status: 'approved', is_test: !!owner.is_test
    });
    const prof = profRows && profRows[0];
    if (!prof || !prof.id) throw new Error('profile insert returned empty');

    await sbInsert('team_members', {
      owner_id: owner.id, member_id: prof.id,
      role: 'member', status: 'active',
      permissions: permissions.length ? permissions : ALLOWED_PERMS
    });

    return res.status(200).json({ ok: true, member: { id: prof.id, name, email, permissions: permissions.length ? permissions : ALLOWED_PERMS } });
  } catch (e) {
    console.error('profile/membership error, rolling back auth user:', e);
    try { await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${authId}`, { method: 'DELETE', headers: svcHeaders() }); } catch (e2) {}
    return res.status(500).json({ error: 'تعذّر إكمال إضافة العضو' });
  }
}
