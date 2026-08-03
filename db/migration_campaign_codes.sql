-- ============================================================
-- سيمبل — حملات «كود الخصم» (التسليم الرقمي بدل الشحن)
-- ينفَّذ في SQL Editor لمشروع سيمبل rdzzzasbyzugxogbgwwn فقط
-- الفكرة: الشركة تخزّن مخزون أكواد للحملة، ولحظة اعتماد أي معلن
-- تسحب القاعدة أول كود غير مستخدم وتربطه به (كود واحد لكل معلن،
-- ولا اعتماد بدون كود متاح) ثم تُشعر المعلن.
-- ============================================================

-- 1) أعمدة الحملة
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS fulfillment_mode text NOT NULL DEFAULT 'shipping';
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS product_url text;

-- 2) مخزون الأكواد
CREATE TABLE IF NOT EXISTS public.campaign_codes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  code text NOT NULL,
  application_id uuid REFERENCES public.applications(id) ON DELETE SET NULL,
  assigned_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  UNIQUE (campaign_id, code)
);
CREATE UNIQUE INDEX IF NOT EXISTS campaign_codes_one_per_app
  ON public.campaign_codes(application_id) WHERE application_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS campaign_codes_campaign_idx ON public.campaign_codes(campaign_id);

ALTER TABLE public.campaign_codes ENABLE ROW LEVEL SECURITY;

-- 3) سياسات الحماية
DROP POLICY IF EXISTS brand_manage_campaign_codes ON public.campaign_codes;
CREATE POLICY brand_manage_campaign_codes ON public.campaign_codes
  AS PERMISSIVE FOR ALL TO authenticated
  USING (campaign_id IN (
    SELECT c.id FROM campaigns c
    WHERE c.brand_id IN (SELECT users.id FROM users WHERE users.auth_id = auth.uid())))
  WITH CHECK (campaign_id IN (
    SELECT c.id FROM campaigns c
    WHERE c.brand_id IN (SELECT users.id FROM users WHERE users.auth_id = auth.uid())));

DROP POLICY IF EXISTS creator_read_own_code ON public.campaign_codes;
CREATE POLICY creator_read_own_code ON public.campaign_codes
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (application_id IN (
    SELECT a.id FROM applications a
    WHERE a.creator_id IN (SELECT users.id FROM users WHERE users.auth_id = auth.uid())));

-- 4) دالة التوزيع الذرّي (كود واحد لكل معلن — آمنة ضد التزامن)
CREATE OR REPLACE FUNCTION public.assign_campaign_code(p_application_id uuid)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_app applications%ROWTYPE;
  v_mode text; v_title text;
  v_code_id uuid; v_code text;
  v_is_brand boolean;
BEGIN
  SELECT * INTO v_app FROM applications WHERE id = p_application_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'APP_NOT_FOUND'; END IF;

  SELECT fulfillment_mode, title INTO v_mode, v_title
    FROM campaigns WHERE id = v_app.campaign_id;
  IF v_mode IS DISTINCT FROM 'code' THEN RETURN NULL; END IF;

  -- المستدعي لازم يكون شركة الحملة نفسها
  SELECT EXISTS (
    SELECT 1 FROM campaigns c
    WHERE c.id = v_app.campaign_id
      AND c.brand_id IN (SELECT u.id FROM users u WHERE u.auth_id = auth.uid())
  ) INTO v_is_brand;
  IF NOT v_is_brand THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;

  -- لو له كود مسبقاً نرجعه (استدعاء متكرر آمن)
  SELECT code INTO v_code FROM campaign_codes WHERE application_id = p_application_id;
  IF FOUND THEN RETURN v_code; END IF;

  -- أول كود غير مستخدم — مع قفل يمنع سحب نفس الكود لشخصين
  SELECT id, code INTO v_code_id, v_code
    FROM campaign_codes
   WHERE campaign_id = v_app.campaign_id AND application_id IS NULL
   ORDER BY created_at, id
   FOR UPDATE SKIP LOCKED
   LIMIT 1;
  IF v_code_id IS NULL THEN RAISE EXCEPTION 'NO_CODES_LEFT'; END IF;

  UPDATE campaign_codes
     SET application_id = p_application_id, assigned_at = now()
   WHERE id = v_code_id;

  INSERT INTO notifications (user_id, type, title, message, link)
  VALUES (v_app.creator_id, 'code_assigned', '🎁 وصلك كود المنتج',
          COALESCE(v_title, 'حملة') || ': كودك الخاص ' || v_code ||
          ' — افتح صفقتك لتشوف رابط المنتج وخطوات الطلب.', '/creator.html');

  RETURN v_code;
END $$;

-- 5) التوزيع التلقائي لحظة الاعتماد (يمنع الاعتماد لو نفدت الأكواد)
CREATE OR REPLACE FUNCTION public.trg_assign_code_on_approval()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.brand_approved = true AND COALESCE(OLD.brand_approved, false) = false THEN
    PERFORM assign_campaign_code(NEW.id);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS assign_code_on_approval ON public.applications;
CREATE TRIGGER assign_code_on_approval
  AFTER UPDATE OF brand_approved ON public.applications
  FOR EACH ROW EXECUTE FUNCTION public.trg_assign_code_on_approval();
