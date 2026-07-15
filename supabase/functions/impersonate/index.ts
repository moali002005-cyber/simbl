// supabase/functions/impersonate/index.ts
// ====================================================================
// «الدخول كالمستخدم» (Impersonation) — نقطة محميّة بصلاحية الأدمن.
// تصدر جلسة Supabase Auth حقيقية للمستخدم الهدف، فيعامله RLS كأنه هو.
// لا يُرسَل أي إيميل (generateLink توليد فقط).
// الأمان: نتحقق من هوية الطالب من الخادم عبر توكنه (لازم إيميله ضمن ADMIN_EMAILS).
// مفتاح SERVICE_ROLE يُحقن تلقائيًا في بيئة Edge ولا يلمس المتصفح.
// >>> للمشروع الجديد: بدّل ADMIN_EMAILS بإيميل الأدمن الجديد.
// ====================================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ADMIN_EMAILS = ['hello@agentsimpleai.com'];

const USER_COLS =
  'id, role, name, platform, handle, followers, category, price, bio, company_name, industry, size, position, website, created_at, auth_id, approval_status, cr_number, is_test, avatar_url, country, city, email';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // 1) تحقّق من هوية الطالب (لازم أدمن)
    const authHeader = req.headers.get('Authorization') || '';
    const jwt = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!jwt) return json({ error: 'no auth token' }, 401);

    const { data: caller, error: cErr } = await admin.auth.getUser(jwt);
    if (cErr || !caller?.user) return json({ error: 'invalid session' }, 401);
    const callerEmail = (caller.user.email || '').toLowerCase();
    if (!ADMIN_EMAILS.includes(callerEmail)) return json({ error: 'forbidden' }, 403);

    // 2) الهدف
    const bodyIn = await req.json().catch(() => ({}));
    const targetId = bodyIn?.target_id;
    if (!targetId) return json({ error: 'missing target_id' }, 400);

    // 3) اجلب صف المستخدم الهدف كاملًا
    const { data: target, error: tErr } = await admin
      .from('users')
      .select(USER_COLS)
      .eq('id', targetId)
      .maybeSingle();
    if (tErr) return json({ error: 'db error: ' + tErr.message }, 500);
    if (!target) return json({ error: 'المستخدم غير موجود' }, 404);
    if (!target.auth_id) {
      return json({ error: 'هذا الحساب ما عنده حساب دخول (auth) — ما يمكن معاينته' }, 422);
    }

    // 4) إيميل الدخول
    let email: string | null = target.email || null;
    if (!email) {
      const { data: au } = await admin.auth.admin.getUserById(target.auth_id);
      email = au?.user?.email || null;
    }
    if (!email) return json({ error: 'الحساب ما عنده إيميل صالح للدخول' }, 422);

    // 5) ولّد رابطًا سحريًا (بدون إرسال إيميل) واستخرج token_hash
    const { data: link, error: lErr } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email,
    });
    const tokenHash = link?.properties?.hashed_token;
    if (lErr || !tokenHash) {
      return json({ error: 'generateLink failed: ' + (lErr?.message || 'no token') }, 500);
    }

    // 6) سجّل الدخول (best-effort)
    try {
      await admin.from('impersonation_log').insert({
        admin_email: callerEmail,
        target_id: target.id,
        target_role: target.role,
        target_name: target.company_name || target.name || null,
      });
    } catch (_e) { /* لا نُفشل العملية بسبب السجل */ }

    // 7) رجّع التوكن + كائن المستخدم للتطبيق (بدون الإيميل)
    const { email: _drop, ...userForApp } = target as Record<string, unknown>;
    return json({ ok: true, token_hash: tokenHash, user: userForApp });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
