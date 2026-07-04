-- ============================================================
--  سيمبل · روابط مشاركة الحملة (عرض للقراءة فقط بدون تسجيل دخول)
--  شغّل هذا الملف في Supabase → SQL Editor (قاعدة البيانات أولًا ثم الملفات).
-- ============================================================

-- 1) جدول اللقطات: يخزّن نسخة ثابتة من حالة الحملة وقت المشاركة.
create table if not exists public.shared_snapshots (
  token       uuid primary key default gen_random_uuid(),
  campaign_id uuid,
  title       text not null,
  data        jsonb not null,
  created_by  uuid,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz default (now() + interval '7 days'),  -- صلاحية أسبوع (عدّلها كما تحب)
  active      boolean not null default true
);

-- 2) RLS مفعّل بلا سياسات = لا أحد يقرأ/يكتب الجدول مباشرةً (ولا حتى anon).
--    كل الوصول يتم فقط عبر الدالتين أدناه.
alter table public.shared_snapshots enable row level security;

-- 3) إنشاء لقطة (تُستدعى من صفحة الحملة عند ضغط «شارك»).
create or replace function public.create_snapshot(
  p_campaign uuid,
  p_title    text,
  p_data     jsonb,
  p_owner    uuid default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_token uuid;
begin
  insert into public.shared_snapshots(campaign_id, title, data, created_by)
  values (p_campaign, p_title, p_data, p_owner)
  returning token into v_token;
  return v_token;
end;
$$;
grant execute on function public.create_snapshot(uuid, text, jsonb, uuid) to anon, authenticated;

-- 4) قراءة لقطة بالرمز (تستدعيها الصفحة العامة share.html).
--    تُرجع البيانات فقط إذا كان الرمز فعّالًا وغير منتهٍ. الرموز uuid عشوائية (تخمينها غير عملي).
create or replace function public.get_snapshot(p_token uuid)
returns table(title text, data jsonb, created_at timestamptz)
language sql
security definer
set search_path = public
as $$
  select s.title, s.data, s.created_at
  from public.shared_snapshots s
  where s.token = p_token
    and s.active = true
    and (s.expires_at is null or s.expires_at > now())
  limit 1;
$$;
grant execute on function public.get_snapshot(uuid) to anon, authenticated;

-- ============================================================
--  إلغاء رابط (متى ما بغيت توقف مشاركة):
--    update public.shared_snapshots set active = false where token = 'ضع_الرمز_هنا';
--  حذف اللقطات المنتهية (تنظيف اختياري):
--    delete from public.shared_snapshots where expires_at < now();
-- ============================================================
