-- ============================================================
-- مجموعة اختبارات سيمبل (Production Self-Test)
-- الغرض: كشف الأعطال الحرجة والانحدارات (regressions) تلقائياً.
-- التشغيل:  select category, check_name, passed, detail from public.simbl_selftest();
-- شغّلها بعد أي تعديل أمني/RLS/صلاحيات، ويُفضّل جدولتها يومياً مع تنبيه عند أي FAIL.
--
-- يغطّي:
--  1) ثابت الصلاحيات: anon/authenticated لديهم SELECT+INSERT على الجداول العامة
--     (هذا الفحص يكشف عطل «محد يقدر ينشئ حساب» الذي سببه سحب GRANT عن users).
--  2) صحة التسجيل الحيّة: لا حسابات مصادقة يتيمة (بلا ملف) في آخر 24 ساعة.
--  3) وجود سياسة «allow signup insert».
--  4) تفعيل RLS على الجداول الحسّاسة.
--  5) وجود الدوال الحرجة.
--  6) وجود Triggers الفريق (الصلاحيات + سجل النشاط).
--  7) وجود سياسات عزل الفريق (workspace isolation).
--  8) سلامة البيانات (وجود معلنين وشركات).
-- ============================================================

CREATE OR REPLACE FUNCTION public.simbl_selftest()
 RETURNS TABLE(category text, check_name text, passed boolean, detail text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  locked_tables text[] := array['brands','groups','memberships','org_codes','organizations','teams'];
  missing_grants text;
  orphan_cnt int;
  bad_rls text;
  miss_fn text;
  miss_tg text;
begin
  -- 1) ثابت الصلاحيات: كل جدول عام (عدا المقفلة عمداً) لازم anon+authenticated عندهم SELECT+INSERT
  select string_agg(t.tablename || ' (' || t.who || ')', ', ')
    into missing_grants
  from (
    select p.tablename,
      (case when not exists (select 1 from information_schema.role_table_grants g
              where g.table_schema='public' and g.table_name=p.tablename and g.grantee='anon' and g.privilege_type='SELECT') then 'anon:SELECT ' else '' end ||
       case when not exists (select 1 from information_schema.role_table_grants g
              where g.table_schema='public' and g.table_name=p.tablename and g.grantee='anon' and g.privilege_type='INSERT') then 'anon:INSERT ' else '' end ||
       case when not exists (select 1 from information_schema.role_table_grants g
              where g.table_schema='public' and g.table_name=p.tablename and g.grantee='authenticated' and g.privilege_type='SELECT') then 'auth:SELECT ' else '' end ||
       case when not exists (select 1 from information_schema.role_table_grants g
              where g.table_schema='public' and g.table_name=p.tablename and g.grantee='authenticated' and g.privilege_type='INSERT') then 'auth:INSERT ' else '' end) as who
    from pg_tables p
    where p.schemaname='public' and not (p.tablename = any(locked_tables))
  ) t
  where t.who <> '';
  category:='الصلاحيات'; check_name:='anon/authenticated لديهم SELECT+INSERT على الجداول العامة';
  passed := missing_grants is null; detail := coalesce('ناقص: '||missing_grants, 'كل الجداول سليمة'); return next;

  -- 2) صحة التسجيل: لا حسابات مصادقة يتيمة (بلا ملف) أُنشئت آخر 24 ساعة
  select count(*) into orphan_cnt
  from auth.users au left join public.users u on u.auth_id=au.id
  where u.id is null and au.created_at > now() - interval '24 hours';
  category:='التسجيل'; check_name:='لا حسابات يتيمة جديدة (آخر 24 ساعة)';
  passed := orphan_cnt = 0; detail := orphan_cnt || ' حساب يتيم في آخر 24 ساعة'; return next;

  -- 3) سياسة إدراج التسجيل موجودة
  category:='RLS'; check_name:='سياسة «allow signup insert» موجودة على users';
  passed := exists(select 1 from pg_policies where schemaname='public' and tablename='users' and policyname='allow signup insert');
  detail := case when passed then 'موجودة' else 'مفقودة!' end; return next;

  -- 4) RLS مفعّل على الجداول الحسّاسة
  select string_agg(x, ', ') into bad_rls from (
    select c.relname as x from pg_class c join pg_namespace n on n.oid=c.relnamespace and n.nspname='public'
    where c.relkind='r' and c.relname = any(array['users','applications','campaigns','payments','team_members','negotiations']) and not c.relrowsecurity
  ) q;
  category:='RLS'; check_name:='RLS مفعّل على الجداول الحسّاسة';
  passed := bad_rls is null; detail := coalesce('غير مفعّل على: '||bad_rls, 'مفعّل على الكل'); return next;

  -- 5) الدوال الحرجة موجودة
  select string_agg(f, ', ') into miss_fn from (
    select f from unnest(array['team_activity_list','my_perm_on','my_workspace_brand_ids','simbl_find_own_profile','team_my_workspace','simbl_email_exists','enforce_team_app_perms']) f
    where not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace and n.nspname='public' where p.proname=f)
  ) q;
  category:='الدوال'; check_name:='الدوال الحرجة موجودة';
  passed := miss_fn is null; detail := coalesce('مفقودة: '||miss_fn, 'كلها موجودة'); return next;

  -- 6) الـTriggers الحرجة موجودة (صلاحيات الفريق + سجل النشاط)
  select string_agg(t, ', ') into miss_tg from (
    select t from unnest(array['trg_enforce_team_app_perms','trg_log_team_app_activity','trg_log_team_campaign_activity']) t
    where not exists (select 1 from pg_trigger where tgname=t and not tgisinternal)
  ) q;
  category:='Triggers'; check_name:='Triggers الفريق موجودة';
  passed := miss_tg is null; detail := coalesce('مفقودة: '||miss_tg, 'كلها موجودة'); return next;

  -- 7) عزل RLS: للمعلن سياسة قراءة، وللفريق سياسة مساحة
  category:='العزل'; check_name:='سياسات عزل الفريق على الحملات والعروض';
  passed := exists(select 1 from pg_policies where schemaname='public' and tablename='campaigns' and policyname='team_select_campaigns')
        and exists(select 1 from pg_policies where schemaname='public' and tablename='applications' and policyname='team_select_applications');
  detail := case when passed then 'موجودة' else 'ناقصة!' end; return next;

  -- 8) سلامة البيانات: يوجد معلنون وشركات
  category:='البيانات'; check_name:='توجد بيانات (معلنون + شركات)';
  passed := (select count(*) from public.users where role='creator') > 0
        and (select count(*) from public.users where role='brand') > 0;
  detail := (select count(*)::text from public.users where role='creator')||' معلن، '||
            (select count(*)::text from public.users where role='brand')||' شركة'; return next;

  return;
end;
$function$;

revoke execute on function public.simbl_selftest() from public, anon, authenticated;

-- للتشغيل:
-- select category, check_name, case when passed then 'PASS' else 'FAIL' end as result, detail
-- from public.simbl_selftest();
