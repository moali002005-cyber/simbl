-- ============================================================
-- سيمبل — تحديث دالة تعديل الملف الشخصي للمعلن
-- إضافة حقول: الدولة، السعر المرجعي، نطاق المتابعين، المدينة
-- آمن لإعادة التشغيل. الصق كامل الملف في Supabase SQL Editor ثم Run.
--
-- تأكد أن الأعمدة موجودة (إن لم تكن، شغّل هذا أولاً):
--   alter table public.users add column if not exists country text;
--   alter table public.users add column if not exists city text;
-- ============================================================

-- نحذف أي نسخ سابقة من الدالة (بأي توقيع) لتفادي تعدّد النسخ المتعارضة
drop function if exists public.update_my_profile(text,text,text,text,text,text);
drop function if exists public.update_my_profile(text,text,text,text,text,text,text,integer,integer);
drop function if exists public.update_my_profile(text,text,text,text,text,text,text,integer,integer,text);

create or replace function public.update_my_profile(
  p_name      text,
  p_handle    text,
  p_website   text,
  p_platform  text,
  p_category  text,
  p_bio       text,
  p_country   text default null,
  p_price     integer default null,
  p_followers integer default null,
  p_city      text default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  update public.users set
    name      = coalesce(nullif(p_name, ''), name),
    handle    = p_handle,
    website   = p_website,
    platform  = p_platform,
    category  = p_category,
    bio       = p_bio,
    country   = coalesce(p_country, country),
    price     = coalesce(p_price, price),
    followers = coalesce(p_followers, followers),
    city      = coalesce(p_city, city)
  where auth_id = auth.uid();
end;
$function$;
