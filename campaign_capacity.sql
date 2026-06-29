-- ============================================================
-- سيمبل — فرض حد عدد المعلنين على مستوى قاعدة البيانات (Supabase)
-- الهدف: ما يتجاوز عدد الصفقات المعتمدة "campaign_size"، وإقفال الحملة تلقائيًا،
--        ومنع أي معلن جديد من الدخول بعد الاكتمال — حتى لو دخلوا بنفس اللحظة.
--
-- "يُحسب ضمن العدد": الصفقة المقفلة والمعتمدة من الشركة فقط
--   (applications.status = 'closed' AND applications.brand_approved = true)
--
-- شغّل هذا الملف مرة واحدة في Supabase: SQL Editor > New query > الصق > Run.
-- آمن لإعادة التشغيل (idempotent).
-- ============================================================

-- 1) منع إنشاء أي عرض جديد على حملة مقفلة/مكتملة
create or replace function simbl_block_full_campaign()
returns trigger
language plpgsql
as $$
declare
  c_status text;
  c_size   int;
  approved int;
begin
  -- قفل صف الحملة لتسلسل العمليات المتزامنة
  select status, campaign_size
    into c_status, c_size
  from campaigns
  where id = new.campaign_id
  for update;

  if c_status in ('closed', 'completed') then
    raise exception 'الحملة مكتملة — اكتمل العدد المطلوب';
  end if;

  -- تحقق إضافي بالعدد (احتياط لو ما انقفلت الحملة بعد)
  if c_size is not null and c_size > 0 then
    select count(*) into approved
    from applications
    where campaign_id = new.campaign_id
      and status = 'closed'
      and brand_approved = true;

    if approved >= c_size then
      update campaigns set status = 'closed' where id = new.campaign_id;
      raise exception 'الحملة مكتملة — اكتمل العدد المطلوب';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_block_full_campaign on applications;
create trigger trg_block_full_campaign
  before insert on applications
  for each row
  execute function simbl_block_full_campaign();


-- 2) إقفال الحملة تلقائيًا أول ما يوصل عدد المعتمدين للحد
create or replace function simbl_autoclose_campaign()
returns trigger
language plpgsql
as $$
declare
  c_size   int;
  c_status text;
  approved int;
begin
  -- يهمّنا فقط لما تصير الصفقة مقفلة + معتمدة
  if new.status = 'closed' and new.brand_approved = true then
    select campaign_size, status
      into c_size, c_status
    from campaigns
    where id = new.campaign_id
    for update;

    if c_size is not null and c_size > 0 and c_status not in ('closed', 'completed') then
      select count(*) into approved
      from applications
      where campaign_id = new.campaign_id
        and status = 'closed'
        and brand_approved = true;

      if approved >= c_size then
        update campaigns set status = 'closed' where id = new.campaign_id;

        -- إيقاف كل العروض اللي لسّه قيد التفاوض/المراجعة (لم تُقفل) لاكتمال العدد
        update applications
        set status = 'campaign_full',
            rejection_reason = coalesce(rejection_reason, 'اكتمل العدد المطلوب للحملة'),
            rejected_at = coalesce(rejected_at, now())
        where campaign_id = new.campaign_id
          and status in ('pending', 'active');
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_autoclose_campaign on applications;
create trigger trg_autoclose_campaign
  after insert or update of status, brand_approved on applications
  for each row
  execute function simbl_autoclose_campaign();


-- 3) (اختياري) إقفال الحملات اللي وصلت الحد أصلاً قبل تركيب التريقرات
update campaigns c
set status = 'closed'
where c.campaign_size is not null
  and c.campaign_size > 0
  and coalesce(c.status, '') not in ('closed', 'completed')
  and (
    select count(*) from applications a
    where a.campaign_id = c.id
      and a.status = 'closed'
      and a.brand_approved = true
  ) >= c.campaign_size;

-- 4) (اختياري) إيقاف العروض المعلّقة على الحملات المكتملة أصلاً (تنظيف الوضع الحالي)
--    هذا اللي يخفي الـ«قيد التفاوض» اللي ما لحقوا من الحملات اللي اكتملت قبل التعديل.
update applications a
set status = 'campaign_full',
    rejection_reason = coalesce(a.rejection_reason, 'اكتمل العدد المطلوب للحملة'),
    rejected_at = coalesce(a.rejected_at, now())
from campaigns c
where a.campaign_id = c.id
  and a.status in ('pending', 'active')
  and c.campaign_size is not null
  and c.campaign_size > 0
  and (
    select count(*) from applications a2
    where a2.campaign_id = c.id
      and a2.status = 'closed'
      and a2.brand_approved = true
  ) >= c.campaign_size;

-- ملاحظة مهمة: نستخدم حالة جديدة للعرض اسمها 'campaign_full'.
-- لو عمود applications.status فيه قيد CHECK أو نوع enum يحصر القيم المسموحة،
-- لازم تضيف 'campaign_full' للقيم المسموحة، وإلا ترفض القاعدة التحديث.
-- للتحقق إن كان فيه قيد:
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--   where conrelid = 'applications'::regclass and contype = 'c';
-- غالبًا العمود نصّي حر بدون قيد، وفي هذي الحالة ما تحتاج تسوي شي.
