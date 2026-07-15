-- =====================================================================
-- SimpleAI / Simbl — Full database schema (structure only, no data)
-- مخطط قاعدة بيانات سيمبل كاملاً (بنية فقط، بدون بيانات)
--
-- كيف تستخدمه لمشروع مستقل جديد:
--   1) أنشئ مشروع Supabase جديد.
--   2) افتح SQL Editor → الصق هذا الملف كاملاً → Run (نفّذه مرة واحدة على مشروع فاضٍ).
--   3) بعده حدّث في الكود:
--        - supabase-config.js: SUPABASE_URL و SUPABASE_ANON_KEY بقيم المشروع الجديد.
--        - متغيّرات Vercel: SUPABASE_SERVICE_ROLE_KEY و ANTHROPIC_API_KEY.
--   4) ملاحظات مهمة داخل القاعدة تحتاج تعديل يدوي بعد التنفيذ:
--        - الدالتان simbl_run_reminders() و simbl_push_on_notification() فيهما
--          رابط المشروع القديم ومفتاح anon قديم (لاستدعاء Edge Function اسمه send-push).
--          بدّلهما برابط ومفتاح مشروعك الجديد، وانشر Edge Function للإشعارات، أو
--          احذف منطق الدفع لو ما تبي إشعارات push الآن.
--        - جدولة pg_cron (تشغيل التذكيرات/الاستبدال) غير مضمّنة هنا — أضِفها لو تبيها.
--   5) صناديق التخزين وسياساتها مضمّنة بالأسفل.
--
-- ترتيب التنفيذ: امتدادات → جداول → قيود → فهارس → Views → دوال → Triggers
--                → تفعيل RLS → سياسات → تخزين → منع تنفيذ دوال داخلية.
-- =====================================================================

-- ===== EXTENSIONS =====
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
-- pg_cron اختياري (للتذكيرات المجدولة). فعّله من Dashboard → Database → Extensions لو تبيه.
-- CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ===== TABLES =====
CREATE TABLE IF NOT EXISTS public._backup_deleted_apps (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  campaign_id uuid,
  creator_id uuid,
  price integer NOT NULL,
  note text,
  status text DEFAULT 'pending'::text,
  created_at timestamp with time zone DEFAULT now(),
  final_price integer,
  deal_details text,
  closed_at timestamp with time zone,
  stage integer DEFAULT 1,
  stage_data jsonb DEFAULT '{}'::jsonb,
  brand_approved boolean DEFAULT false,
  payment_status text DEFAULT 'unpaid'::text,
  completed_at timestamp with time zone,
  paid_marked_at timestamp with time zone,
  received_confirmed_at timestamp with time zone,
  content_views bigint,
  content_likes bigint,
  content_comments bigint,
  content_shares bigint,
  content_fetched_at timestamp with time zone,
  tiktok_video_id text,
  rejection_reason text,
  rejected_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.app_secrets (
  key text NOT NULL,
  value text NOT NULL
);

CREATE TABLE IF NOT EXISTS public.applications (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  campaign_id uuid,
  creator_id uuid,
  price integer NOT NULL,
  note text,
  status text DEFAULT 'pending'::text,
  created_at timestamp with time zone DEFAULT now(),
  final_price integer,
  deal_details text,
  closed_at timestamp with time zone,
  stage integer DEFAULT 1,
  stage_data jsonb DEFAULT '{}'::jsonb,
  brand_approved boolean DEFAULT false,
  payment_status text DEFAULT 'unpaid'::text,
  completed_at timestamp with time zone,
  paid_marked_at timestamp with time zone,
  received_confirmed_at timestamp with time zone,
  content_views bigint,
  content_likes bigint,
  content_comments bigint,
  content_shares bigint,
  content_fetched_at timestamp with time zone,
  tiktok_video_id text,
  rejection_reason text,
  rejected_at timestamp with time zone,
  reminder_stage integer,
  reminder_level text,
  reminder_sent_at timestamp with time zone,
  is_reserve boolean DEFAULT false NOT NULL,
  pending_since timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.brands (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  group_id uuid NOT NULL,
  org_id uuid,
  name text NOT NULL,
  manager_id uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.campaigns (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  brand_id uuid,
  title text NOT NULL,
  description text NOT NULL,
  brand_industry text,
  budget text NOT NULL,
  max_budget integer,
  duration text,
  package text,
  requirements text,
  tags text[],
  status text DEFAULT 'active'::text,
  created_at timestamp with time zone DEFAULT now(),
  payment_min_days integer DEFAULT 7,
  payment_max_days integer DEFAULT 30,
  city text,
  publish_timing text,
  publish_date date,
  platform text,
  follower_range text,
  campaign_size integer,
  is_test boolean DEFAULT false NOT NULL,
  is_direct boolean DEFAULT false,
  org_id uuid,
  country text,
  campaign_type text DEFAULT 'home'::text NOT NULL,
  visit_location text,
  visit_date date,
  visit_time_from text,
  visit_time_to text,
  visit_dates text,
  creator_tiers text
);

CREATE TABLE IF NOT EXISTS public.creator_ratings (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  application_id uuid NOT NULL,
  creator_id uuid NOT NULL,
  brand_id uuid NOT NULL,
  stars integer NOT NULL,
  comment text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  q_content integer,
  q_punctuality integer,
  q_communication integer,
  q_results integer
);

CREATE TABLE IF NOT EXISTS public.creator_socials (
  creator_id uuid NOT NULL,
  platform text DEFAULT 'tiktok'::text NOT NULL,
  open_id text,
  access_token text,
  refresh_token text,
  expires_at timestamp with time zone,
  refresh_expires_at timestamp with time zone,
  scope text,
  connected_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.groups (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  owner_id uuid,
  gm_id uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.impersonation_log (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  admin_email text NOT NULL,
  target_id uuid,
  target_role text,
  target_name text,
  started_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.memberships (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  group_id uuid,
  brand_id uuid,
  team_id uuid,
  role text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.negotiations (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  application_id uuid,
  from_role text NOT NULL,
  message text NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid,
  type text NOT NULL,
  title text NOT NULL,
  message text,
  link text,
  is_read boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.org_codes (
  code text NOT NULL,
  org_id uuid NOT NULL,
  role text NOT NULL,
  label text,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.organizations (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  owner_id uuid,
  join_code text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.payments (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  campaign_id uuid NOT NULL,
  brand_id uuid NOT NULL,
  creator_id uuid NOT NULL,
  amount numeric(10,2) NOT NULL,
  payment_min_days integer NOT NULL,
  payment_max_days integer NOT NULL,
  due_date date NOT NULL,
  iban text,
  bank_name text,
  account_holder_name text,
  bank_details_submitted_at timestamp with time zone,
  status text DEFAULT 'pending'::text,
  brand_paid_at timestamp with time zone,
  creator_received_at timestamp with time zone,
  brand_notes text,
  creator_notes text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.shared_snapshots (
  token uuid DEFAULT gen_random_uuid() NOT NULL,
  campaign_id uuid,
  title text NOT NULL,
  data jsonb NOT NULL,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  expires_at timestamp with time zone DEFAULT (now() + '7 days'::interval),
  active boolean DEFAULT true NOT NULL
);

CREATE TABLE IF NOT EXISTS public.team_activity (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  owner_id uuid NOT NULL,
  actor_id uuid,
  actor_name text,
  action text NOT NULL,
  detail text,
  target_creator text,
  amount numeric,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.team_members (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  owner_id uuid NOT NULL,
  member_id uuid,
  invited_email text,
  role text DEFAULT 'member'::text NOT NULL,
  status text DEFAULT 'active'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  permissions text[] DEFAULT '{campaigns,deals,workflow,payments,analytics}'::text[] NOT NULL
);

CREATE TABLE IF NOT EXISTS public.teams (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  brand_id uuid NOT NULL,
  platform text NOT NULL,
  name text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.users (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  role text NOT NULL,
  name text NOT NULL,
  email text NOT NULL,
  whatsapp text,
  platform text,
  handle text,
  followers integer,
  category text,
  price integer,
  bio text,
  company_name text,
  industry text,
  size text,
  "position" text,
  phone text,
  website text,
  created_at timestamp with time zone DEFAULT now(),
  auth_id uuid,
  approval_status text DEFAULT 'approved'::text NOT NULL,
  cr_number text,
  is_test boolean DEFAULT false NOT NULL,
  avatar_url text,
  country text DEFAULT 'SA'::text,
  tiktok_connected boolean DEFAULT false,
  org_id uuid,
  org_role text,
  city text,
  creator_tier text,
  account_holder text,
  iban text,
  bank_name text,
  team_code text
);

CREATE TABLE IF NOT EXISTS public.workflow_stages (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  application_id uuid,
  current_stage text DEFAULT 'address'::text NOT NULL,
  shipping_address text,
  address_completed_at timestamp with time zone,
  tracking_number text,
  shipping_note text,
  shipped_at timestamp with time zone,
  received_at timestamp with time zone,
  content_url text,
  content_note text,
  content_uploaded_at timestamp with time zone,
  approval_status text,
  revision_note text,
  approved_at timestamp with time zone,
  published_url text,
  published_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  promo_code text,
  payment_id uuid
);

-- ===== CONSTRAINTS (PK / UNIQUE / CHECK / FK) =====
ALTER TABLE public.memberships ADD CONSTRAINT memberships_pkey PRIMARY KEY (id);
ALTER TABLE public.notifications ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);
ALTER TABLE public.organizations ADD CONSTRAINT organizations_pkey PRIMARY KEY (id);
ALTER TABLE public.team_members ADD CONSTRAINT team_members_pkey PRIMARY KEY (id);
ALTER TABLE public.payments ADD CONSTRAINT payments_pkey PRIMARY KEY (id);
ALTER TABLE public.groups ADD CONSTRAINT groups_pkey PRIMARY KEY (id);
ALTER TABLE public.app_secrets ADD CONSTRAINT app_secrets_pkey PRIMARY KEY (key);
ALTER TABLE public._backup_deleted_apps ADD CONSTRAINT _backup_deleted_apps_pkey PRIMARY KEY (id);
ALTER TABLE public.creator_socials ADD CONSTRAINT creator_socials_pkey PRIMARY KEY (creator_id, platform);
ALTER TABLE public.users ADD CONSTRAINT users_pkey PRIMARY KEY (id);
ALTER TABLE public.push_subscriptions ADD CONSTRAINT push_subscriptions_pkey PRIMARY KEY (id);
ALTER TABLE public.negotiations ADD CONSTRAINT negotiations_pkey PRIMARY KEY (id);
ALTER TABLE public.impersonation_log ADD CONSTRAINT impersonation_log_pkey PRIMARY KEY (id);
ALTER TABLE public.workflow_stages ADD CONSTRAINT workflow_stages_pkey PRIMARY KEY (id);
ALTER TABLE public.shared_snapshots ADD CONSTRAINT shared_snapshots_pkey PRIMARY KEY (token);
ALTER TABLE public.org_codes ADD CONSTRAINT org_codes_pkey PRIMARY KEY (code);
ALTER TABLE public.applications ADD CONSTRAINT applications_pkey PRIMARY KEY (id);
ALTER TABLE public.creator_ratings ADD CONSTRAINT creator_ratings_pkey PRIMARY KEY (id);
ALTER TABLE public.teams ADD CONSTRAINT teams_pkey PRIMARY KEY (id);
ALTER TABLE public.team_activity ADD CONSTRAINT team_activity_pkey PRIMARY KEY (id);
ALTER TABLE public.campaigns ADD CONSTRAINT campaigns_pkey PRIMARY KEY (id);
ALTER TABLE public.brands ADD CONSTRAINT brands_pkey PRIMARY KEY (id);
ALTER TABLE public.users ADD CONSTRAINT users_team_code_key UNIQUE (team_code);
ALTER TABLE public.organizations ADD CONSTRAINT organizations_join_code_key UNIQUE (join_code);
ALTER TABLE public.memberships ADD CONSTRAINT memberships_user_id_team_id_role_key UNIQUE (user_id, team_id, role);
ALTER TABLE public.push_subscriptions ADD CONSTRAINT push_subscriptions_endpoint_key UNIQUE (endpoint);
ALTER TABLE public.team_members ADD CONSTRAINT team_members_owner_id_member_id_key UNIQUE (owner_id, member_id);
ALTER TABLE public.users ADD CONSTRAINT users_email_key UNIQUE (email);
ALTER TABLE public.workflow_stages ADD CONSTRAINT workflow_stages_application_id_key UNIQUE (application_id);
ALTER TABLE public.creator_ratings ADD CONSTRAINT creator_ratings_application_id_key UNIQUE (application_id);
ALTER TABLE public.applications ADD CONSTRAINT applications_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'active'::text, 'closed'::text, 'rejected'::text, 'campaign_full'::text, 'waitlisted'::text])));
ALTER TABLE public.negotiations ADD CONSTRAINT negotiations_from_role_check CHECK ((from_role = ANY (ARRAY['agent'::text, 'creator'::text])));
ALTER TABLE public.workflow_stages ADD CONSTRAINT workflow_stages_approval_status_check CHECK ((approval_status = ANY (ARRAY['approved'::text, 'revision_requested'::text])));
ALTER TABLE public.workflow_stages ADD CONSTRAINT workflow_stages_current_stage_check CHECK ((current_stage = ANY (ARRAY['address'::text, 'shipping'::text, 'received'::text, 'content_upload'::text, 'approval'::text, 'published'::text, 'completed'::text])));
ALTER TABLE public.org_codes ADD CONSTRAINT org_codes_role_check CHECK ((role = ANY (ARRAY['owner'::text, 'manager'::text, 'employee'::text])));
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK ((type = ANY (ARRAY['new_campaign'::text, 'new_application'::text, 'new_message'::text, 'workflow_update'::text, 'deal_closed'::text, 'deal_approved'::text, 'deal_rejected'::text, 'payment_marked'::text, 'campaign_full'::text, 'waitlist_promoted'::text, 'profile_reminder'::text])));
ALTER TABLE public.memberships ADD CONSTRAINT memberships_role_check CHECK ((role = ANY (ARRAY['group_owner'::text, 'gm'::text, 'brand_manager'::text, 'employee'::text])));
ALTER TABLE public.users ADD CONSTRAINT users_org_role_chk CHECK (((org_role IS NULL) OR (org_role = ANY (ARRAY['owner'::text, 'manager'::text, 'employee'::text]))));
ALTER TABLE public.users ADD CONSTRAINT users_role_check CHECK ((role = ANY (ARRAY['creator'::text, 'brand'::text])));
ALTER TABLE public._backup_deleted_apps ADD CONSTRAINT applications_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'active'::text, 'closed'::text, 'rejected'::text])));
ALTER TABLE public.campaigns ADD CONSTRAINT campaigns_campaign_type_check CHECK ((campaign_type = ANY (ARRAY['home'::text, 'visit'::text])));
ALTER TABLE public.campaigns ADD CONSTRAINT campaigns_status_check CHECK ((status = ANY (ARRAY['active'::text, 'closed'::text, 'paused'::text])));
ALTER TABLE public.creator_ratings ADD CONSTRAINT creator_ratings_q_communication_check CHECK (((q_communication >= 1) AND (q_communication <= 5)));
ALTER TABLE public.creator_ratings ADD CONSTRAINT creator_ratings_q_content_check CHECK (((q_content >= 1) AND (q_content <= 5)));
ALTER TABLE public.creator_ratings ADD CONSTRAINT creator_ratings_q_punctuality_check CHECK (((q_punctuality >= 1) AND (q_punctuality <= 5)));
ALTER TABLE public.creator_ratings ADD CONSTRAINT creator_ratings_q_results_check CHECK (((q_results >= 1) AND (q_results <= 5)));
ALTER TABLE public.creator_ratings ADD CONSTRAINT creator_ratings_stars_check CHECK (((stars >= 1) AND (stars <= 5)));
ALTER TABLE public.payments ADD CONSTRAINT payments_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE;
ALTER TABLE public.payments ADD CONSTRAINT payments_creator_id_fkey FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.groups ADD CONSTRAINT groups_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES users(id);
ALTER TABLE public.team_members ADD CONSTRAINT team_members_member_id_fkey FOREIGN KEY (member_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.team_members ADD CONSTRAINT team_members_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.groups ADD CONSTRAINT groups_gm_id_fkey FOREIGN KEY (gm_id) REFERENCES users(id);
ALTER TABLE public.notifications ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.campaigns ADD CONSTRAINT campaigns_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.workflow_stages ADD CONSTRAINT workflow_stages_payment_id_fkey FOREIGN KEY (payment_id) REFERENCES payments(id);
ALTER TABLE public.campaigns ADD CONSTRAINT campaigns_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id);
ALTER TABLE public.brands ADD CONSTRAINT brands_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id);
ALTER TABLE public.creator_socials ADD CONSTRAINT creator_socials_creator_id_fkey FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.brands ADD CONSTRAINT brands_manager_id_fkey FOREIGN KEY (manager_id) REFERENCES users(id);
ALTER TABLE public.creator_ratings ADD CONSTRAINT creator_ratings_application_id_fkey FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE;
ALTER TABLE public.brands ADD CONSTRAINT brands_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE;
ALTER TABLE public.creator_ratings ADD CONSTRAINT creator_ratings_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.creator_ratings ADD CONSTRAINT creator_ratings_creator_id_fkey FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.teams ADD CONSTRAINT teams_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE CASCADE;
ALTER TABLE public.workflow_stages ADD CONSTRAINT workflow_stages_application_id_fkey FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE;
ALTER TABLE public.applications ADD CONSTRAINT applications_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE;
ALTER TABLE public.applications ADD CONSTRAINT applications_creator_id_fkey FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.push_subscriptions ADD CONSTRAINT push_subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.users ADD CONSTRAINT users_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id);
ALTER TABLE public.organizations ADD CONSTRAINT organizations_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES users(id);
ALTER TABLE public.memberships ADD CONSTRAINT memberships_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.negotiations ADD CONSTRAINT negotiations_application_id_fkey FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE;
ALTER TABLE public.memberships ADD CONSTRAINT memberships_team_id_fkey FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE;
ALTER TABLE public.memberships ADD CONSTRAINT memberships_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE;
ALTER TABLE public.org_codes ADD CONSTRAINT org_codes_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE public.memberships ADD CONSTRAINT memberships_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE CASCADE;
ALTER TABLE public.payments ADD CONSTRAINT payments_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES users(id) ON DELETE CASCADE;

-- ===== INDEXES =====
CREATE INDEX negotiations_application_idx ON public.negotiations USING btree (application_id);
CREATE INDEX workflow_application_idx ON public.workflow_stages USING btree (application_id);
CREATE INDEX idx_teams_brand ON public.teams USING btree (brand_id);
CREATE INDEX idx_brands_group ON public.brands USING btree (group_id);
CREATE INDEX notifications_user_idx ON public.notifications USING btree (user_id, created_at DESC);
CREATE INDEX notifications_unread_idx ON public.notifications USING btree (user_id, is_read);
CREATE INDEX idx_memb_user ON public.memberships USING btree (user_id);
CREATE INDEX idx_memb_brand ON public.memberships USING btree (brand_id);
CREATE INDEX idx_memb_team ON public.memberships USING btree (team_id);
CREATE INDEX idx_push_subscriptions_user_id ON public.push_subscriptions USING btree (user_id);
CREATE INDEX idx_users_auth_id ON public.users USING btree (auth_id);
CREATE INDEX _backup_deleted_apps_campaign_id_idx ON public._backup_deleted_apps USING btree (campaign_id);
CREATE INDEX _backup_deleted_apps_creator_id_idx ON public._backup_deleted_apps USING btree (creator_id);
CREATE INDEX idx_payments_due_date ON public.payments USING btree (due_date);
CREATE INDEX idx_payments_brand ON public.payments USING btree (brand_id);
CREATE INDEX idx_payments_creator ON public.payments USING btree (creator_id);
CREATE INDEX idx_payments_status ON public.payments USING btree (status);
CREATE INDEX idx_team_members_member ON public.team_members USING btree (member_id);
CREATE INDEX idx_team_members_owner ON public.team_members USING btree (owner_id);
CREATE INDEX idx_campaigns_brand_id ON public.campaigns USING btree (brand_id);
CREATE INDEX idx_campaigns_status ON public.campaigns USING btree (status);
CREATE INDEX idx_team_activity_owner ON public.team_activity USING btree (owner_id, created_at DESC);
CREATE INDEX idx_creator_ratings_creator ON public.creator_ratings USING btree (creator_id);
CREATE INDEX idx_applications_campaign_id ON public.applications USING btree (campaign_id);
CREATE INDEX idx_applications_creator_id ON public.applications USING btree (creator_id);
CREATE UNIQUE INDEX applications_creator_campaign_uniq ON public.applications USING btree (creator_id, campaign_id);

-- ===== VIEWS (ordered by dependency) =====
CREATE OR REPLACE VIEW public.creator_directory AS
  SELECT id, name, handle, platform, followers, category, bio, website, created_at, avatar_url, country
  FROM users
  WHERE role = 'creator'::text AND approval_status = 'approved'::text AND COALESCE(is_test, false) = false;

CREATE OR REPLACE VIEW public.creator_trust AS
  SELECT id AS creator_id,
    (SELECT count(*) FROM applications a WHERE a.creator_id = u.id AND a.status = 'closed'::text AND a.brand_approved = true AND COALESCE(a.stage, 1) >= 9) AS deals_count,
    (SELECT count(*) FROM creator_ratings r WHERE r.creator_id = u.id) AS ratings_count,
    (SELECT COALESCE(round(avg(r.stars), 1), 0::numeric) FROM creator_ratings r WHERE r.creator_id = u.id) AS avg_rating,
    (SELECT COALESCE(round(avg(r.q_content), 1), 0::numeric) FROM creator_ratings r WHERE r.creator_id = u.id) AS avg_content,
    (SELECT COALESCE(round(avg(r.q_punctuality), 1), 0::numeric) FROM creator_ratings r WHERE r.creator_id = u.id) AS avg_punctuality,
    (SELECT COALESCE(round(avg(r.q_communication), 1), 0::numeric) FROM creator_ratings r WHERE r.creator_id = u.id) AS avg_communication,
    (SELECT COALESCE(round(avg(r.q_results), 1), 0::numeric) FROM creator_ratings r WHERE r.creator_id = u.id) AS avg_results
  FROM users u
  WHERE role = 'creator'::text;

CREATE OR REPLACE VIEW public.brand_reputation AS
  SELECT u.id AS brand_id, u.company_name,
    count(p.id) AS total_payments,
    count(CASE WHEN p.status = 'completed'::text THEN 1 ELSE NULL::integer END) AS completed_payments,
    count(CASE WHEN p.status = 'overdue'::text OR p.status = 'disputed'::text THEN 1 ELSE NULL::integer END) AS problematic_payments,
    count(CASE WHEN p.status = 'completed'::text AND p.brand_paid_at::date <= p.due_date THEN 1 ELSE NULL::integer END) AS on_time_payments,
    CASE WHEN count(p.id) = 0 THEN 100::numeric
      ELSE round(count(CASE WHEN p.status = 'completed'::text AND p.brand_paid_at::date <= p.due_date THEN 1 ELSE NULL::integer END)::numeric / NULLIF(count(CASE WHEN p.status = 'completed'::text THEN 1 ELSE NULL::integer END), 0)::numeric * 100::numeric, 0) END AS on_time_percentage,
    CASE WHEN count(p.id) = 0 THEN 'new'::text
      WHEN count(CASE WHEN p.status = 'completed'::text THEN 1 ELSE NULL::integer END) >= 10 AND (count(CASE WHEN p.status = 'completed'::text AND p.brand_paid_at::date <= p.due_date THEN 1 ELSE NULL::integer END)::numeric / NULLIF(count(CASE WHEN p.status = 'completed'::text THEN 1 ELSE NULL::integer END), 0)::numeric) >= 0.95 THEN 'gold'::text
      WHEN count(CASE WHEN p.status = 'completed'::text THEN 1 ELSE NULL::integer END) >= 3 AND (count(CASE WHEN p.status = 'completed'::text AND p.brand_paid_at::date <= p.due_date THEN 1 ELSE NULL::integer END)::numeric / NULLIF(count(CASE WHEN p.status = 'completed'::text THEN 1 ELSE NULL::integer END), 0)::numeric) >= 0.80 THEN 'trusted'::text
      WHEN count(CASE WHEN p.status = 'disputed'::text OR p.status = 'overdue'::text THEN 1 ELSE NULL::integer END) >= 2 THEN 'warning'::text
      ELSE 'new'::text END AS reputation_badge
  FROM users u
    LEFT JOIN payments p ON p.brand_id = u.id
  WHERE u.role = 'brand'::text
  GROUP BY u.id, u.company_name;

CREATE OR REPLACE VIEW public.simbl_creator_performance AS
  WITH deal_times AS (
    SELECT a.creator_id, a.id AS application_id,
      ((a.stage_data -> '1'::text) ->> '_at'::text)::timestamp with time zone AS started_at,
      (SELECT max((v.value ->> '_at'::text)::timestamp with time zone) FROM jsonb_each(a.stage_data) v(key, value) WHERE v.value ? '_at'::text) AS finished_at,
      a.stage >= 9 AS is_completed
    FROM applications a
    WHERE a.brand_approved = true AND a.stage_data IS NOT NULL
  ), per_deal AS (
    SELECT deal_times.creator_id, deal_times.application_id, deal_times.is_completed,
      CASE WHEN deal_times.is_completed AND deal_times.started_at IS NOT NULL AND deal_times.finished_at IS NOT NULL THEN GREATEST(EXTRACT(epoch FROM deal_times.finished_at - deal_times.started_at) / 3600.0, 0.05) ELSE NULL::numeric END AS hours_to_complete
    FROM deal_times
  ), agg AS (
    SELECT per_deal.creator_id,
      count(*) FILTER (WHERE per_deal.is_completed) AS completed_deals,
      count(*) FILTER (WHERE NOT per_deal.is_completed) AS active_deals,
      avg(per_deal.hours_to_complete) FILTER (WHERE per_deal.is_completed) AS avg_hours
    FROM per_deal GROUP BY per_deal.creator_id
  )
  SELECT d.id AS creator_id, d.name,
    COALESCE(g.completed_deals, 0::bigint) AS completed_deals,
    COALESCE(g.active_deals, 0::bigint) AS active_deals,
    round(g.avg_hours, 2) AS avg_hours,
    CASE WHEN g.avg_hours IS NULL THEN NULL::numeric ELSE round(GREATEST(0::numeric, LEAST(100::numeric, 100::numeric - 40::numeric * log(GREATEST(g.avg_hours, 0.5) / 6.0 + 1::numeric))), 1) END AS speed_points,
    CASE WHEN COALESCE(g.completed_deals, 0::bigint) = 0 THEN 0::numeric ELSE round(g.completed_deals::numeric * GREATEST(0::numeric, LEAST(100::numeric, 100::numeric - 40::numeric * log(GREATEST(g.avg_hours, 0.5) / 6.0 + 1::numeric))), 1) END AS achievement
  FROM creator_directory d
    LEFT JOIN agg g ON g.creator_id = d.id;

-- ===== FUNCTIONS =====
CREATE OR REPLACE FUNCTION public.current_app_user_ids()
 RETURNS SETOF uuid
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$ select id from public.users where auth_id = auth.uid() $function$;

CREATE OR REPLACE FUNCTION public.is_platform_admin()
 RETURNS boolean
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$ select lower(coalesce(auth.jwt() ->> 'email','')) = 'hello@agentsimpleai.com' $function$;

CREATE OR REPLACE FUNCTION public.delete_content_file(p_path text)
 RETURNS void
 LANGUAGE sql SECURITY DEFINER SET search_path TO 'public', 'storage'
AS $function$
  delete from storage.objects where bucket_id = 'content' and name = p_path;
$function$;

CREATE OR REPLACE FUNCTION public.create_snapshot(p_campaign uuid, p_title text, p_data jsonb, p_owner uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare v_token uuid;
begin
  insert into public.shared_snapshots(campaign_id, title, data, created_by)
  values (p_campaign, p_title, p_data, p_owner)
  returning token into v_token;
  return v_token;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_snapshot(p_token uuid)
 RETURNS TABLE(title text, data jsonb, created_at timestamp with time zone)
 LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $function$
  select s.title, s.data, s.created_at
  from public.shared_snapshots s
  where s.token = p_token and s.active = true and (s.expires_at is null or s.expires_at > now())
  limit 1;
$function$;

CREATE OR REPLACE FUNCTION public.create_payment_on_completion()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_campaign campaigns%ROWTYPE;
  v_application applications%ROWTYPE;
  v_payment_id UUID;
  v_due_date DATE;
BEGIN
  IF NEW.current_stage = 'completed' AND OLD.current_stage != 'completed' THEN
    SELECT * INTO v_application FROM applications WHERE id = NEW.application_id;
    SELECT * INTO v_campaign FROM campaigns WHERE id = v_application.campaign_id;
    v_due_date := CURRENT_DATE + COALESCE(v_campaign.payment_max_days, 30);
    INSERT INTO payments (campaign_id, brand_id, creator_id, amount, payment_min_days, payment_max_days, due_date, status)
    VALUES (v_campaign.id, v_campaign.brand_id, v_application.creator_id,
      COALESCE(v_application.final_price, v_application.price),
      COALESCE(v_campaign.payment_min_days, 7), COALESCE(v_campaign.payment_max_days, 30),
      v_due_date, 'awaiting_bank_details')
    RETURNING id INTO v_payment_id;
    NEW.payment_id := v_payment_id;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_my_avatar(url text)
 RETURNS void
 LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $function$
  update public.users set avatar_url = url where auth_id = auth.uid();
$function$;

CREATE OR REPLACE FUNCTION public.admin_delete_user(target_id uuid)
 RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare caller_email text; target_auth uuid;
begin
  caller_email := lower(coalesce(nullif(current_setting('request.jwt.claims', true),'')::jsonb ->> 'email',''));
  if caller_email <> 'hello@agentsimpleai.com' then
    raise exception 'not authorized';
  end if;
  select auth_id into target_auth from public.users where id = target_id;
  delete from public.negotiations where application_id in (select id from public.applications where creator_id = target_id);
  delete from public.applications where creator_id = target_id;
  delete from public.negotiations where application_id in (
    select a.id from public.applications a join public.campaigns c on a.campaign_id=c.id where c.brand_id = target_id);
  delete from public.applications where campaign_id in (select id from public.campaigns where brand_id = target_id);
  delete from public.campaigns where brand_id = target_id;
  delete from public.users where id = target_id;
  if target_auth is not null then
    delete from auth.users where id = target_auth;
  end if;
end; $function$;

CREATE OR REPLACE FUNCTION public.mark_my_notifications_read()
 RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
begin
  update public.notifications set is_read = true
  where user_id = (select id from public.users where auth_id = auth.uid()) and is_read = false;
end;
$function$;

CREATE OR REPLACE FUNCTION public.simbl_redeem_code(p_user uuid, p_code text)
 RETURNS TABLE(out_org uuid, out_role text)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare v_org uuid; v_role text;
begin
  select c.org_id, c.role into v_org, v_role from public.org_codes c
  where c.code = upper(btrim(p_code)) and c.is_active;
  if v_org is null then raise exception 'INVALID_CODE'; end if;
  update public.users set org_id = v_org, org_role = v_role where id = p_user;
  if v_role = 'owner' then
    update public.organizations set owner_id = p_user where id = v_org and owner_id is null;
  end if;
  out_org := v_org; out_role := v_role; return next;
end $function$;

CREATE OR REPLACE FUNCTION public.simbl_stage_entered_at(app applications)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql IMMUTABLE
AS $function$
declare prev_key text; entered text;
begin
  if coalesce(app.stage, 1) <= 1 then return app.created_at; end if;
  prev_key := (coalesce(app.stage, 1) - 1)::text;
  begin entered := (app.stage_data::jsonb -> prev_key ->> '_at');
  exception when others then entered := null; end;
  if entered is null or entered = '' then return app.created_at; end if;
  return entered::timestamptz;
end;
$function$;

CREATE OR REPLACE FUNCTION public.simbl_is_creator_turn(stg integer)
 RETURNS boolean
 LANGUAGE sql IMMUTABLE
AS $function$ select stg in (1, 3, 5, 7, 8); $function$;

CREATE OR REPLACE FUNCTION public.simbl_due_reminders()
 RETURNS TABLE(application_id uuid, creator_id uuid, level text, stage integer, title text, body text)
 LANGUAGE plpgsql
AS $function$
declare
  r record; entered timestamptz; entered_txt text; prev_key text;
  hours_in numeric; new_level text; stage_name text; camp_title text; cur_stage integer;
begin
  for r in
    select a.id, a.creator_id, a.stage, a.stage_data, a.created_at, a.reminder_stage, a.reminder_level, c.title as camp_title
    from public.applications a join public.campaigns c on c.id = a.campaign_id
    where a.status = 'closed' and a.brand_approved = true and coalesce(a.stage, 1) < 9
  loop
    cur_stage := coalesce(r.stage, 1);
    if not public.simbl_is_creator_turn(cur_stage) then continue; end if;
    if cur_stage <= 1 then entered := r.created_at;
    else
      prev_key := (cur_stage - 1)::text;
      begin entered_txt := (r.stage_data::jsonb -> prev_key ->> '_at');
      exception when others then entered_txt := null; end;
      if entered_txt is null or entered_txt = '' then entered := r.created_at;
      else entered := entered_txt::timestamptz; end if;
    end if;
    if entered is null then continue; end if;
    hours_in := extract(epoch from (now() - entered)) / 3600.0;
    if hours_in >= 3 then new_level := 'late';
    elsif hours_in >= 2 then new_level := 'alert';
    else continue; end if;
    if r.reminder_stage = cur_stage and r.reminder_level = new_level then continue; end if;
    if new_level = 'alert' and r.reminder_stage = cur_stage and r.reminder_level = 'late' then continue; end if;
    stage_name := case cur_stage
      when 1 then 'العنوان' when 2 then 'الشحن' when 3 then 'الاستلام'
      when 4 then 'البريف' when 5 then 'المحتوى' when 6 then 'الموافقة'
      when 7 then 'النشر' when 8 then 'البيانات البنكية' else 'المرحلة' end;
    camp_title := coalesce(r.camp_title, 'حملتك');
    if new_level = 'late' then
      title := '⚠️ تحذير: أنت متأخّر';
      body := camp_title || ': صار لك أكثر من ٣ ساعات في مرحلة «' || stage_name || '» بدون إجراء. سارِع الآن قبل ما تفوتك الصفقة.';
    else
      title := '⏰ تنبيه: صفقتك تنتظرك';
      body := camp_title || ': مطلوب منك إجراء في مرحلة «' || stage_name || '». أنجزها الحين عشان تمشي الصفقة.';
    end if;
    update public.applications set reminder_stage = cur_stage, reminder_level = new_level, reminder_sent_at = now() where id = r.id;
    insert into public.notifications (user_id, type, title, message, link)
    values (r.creator_id, 'workflow_update', title, body, '/creator.html');
    application_id := r.id; creator_id := r.creator_id; level := new_level; stage := cur_stage; return next;
  end loop;
end;
$function$;

CREATE OR REPLACE FUNCTION public.update_my_profile(p_name text, p_handle text, p_website text, p_platform text, p_category text, p_bio text, p_country text DEFAULT NULL::text, p_price integer DEFAULT NULL::integer, p_followers integer DEFAULT NULL::integer, p_city text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
begin
  update public.users set
    name = coalesce(nullif(p_name, ''), name),
    handle = p_handle, website = p_website, platform = p_platform,
    category = p_category, bio = p_bio,
    country = coalesce(p_country, country), price = coalesce(p_price, price),
    followers = coalesce(p_followers, followers), city = coalesce(p_city, city)
  where auth_id = auth.uid();
end;
$function$;

-- NOTE: بدّل الرابط ومفتاح anon هنا بقيم مشروعك الجديد، وانشر Edge Function اسمه send-push.
CREATE OR REPLACE FUNCTION public.simbl_run_reminders()
 RETURNS integer
 LANGUAGE plpgsql
AS $function$
declare rec record; cnt integer := 0;
begin
  for rec in select * from public.simbl_due_reminders() loop
    perform net.http_post(
      url := 'https://YOUR-NEW-PROJECT.supabase.co/functions/v1/send-push',
      headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer YOUR_NEW_ANON_KEY'),
      body := jsonb_build_object('title', rec.title, 'body', rec.body, 'url', '/creator.html',
        'target_users', jsonb_build_array(rec.creator_id))
    );
    cnt := cnt + 1;
  end loop;
  return cnt;
end;
$function$;

CREATE OR REPLACE FUNCTION public.waitlist_position(p_application_id uuid)
 RETURNS integer
 LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $function$
  with me as (select campaign_id, created_at from public.applications where id = p_application_id and status = 'waitlisted')
  select count(*)::int from public.applications a, me
  where a.campaign_id = me.campaign_id and a.status = 'waitlisted' and a.created_at <= me.created_at;
$function$;

CREATE OR REPLACE FUNCTION public.run_waitlist_replace(deadline_minutes integer DEFAULT 15)
 RETURNS integer
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare v_app record; v_next record; v_count int := 0;
begin
  for v_app in
    select id, campaign_id from public.applications
    where status = 'pending' and pending_since is not null
      and pending_since < now() - make_interval(mins => deadline_minutes)
  loop
    update public.applications
    set status = 'rejected',
        rejection_reason = 'انتهت مهلة الرد (' || deadline_minutes || ' دقيقة) — تم الاستبدال تلقائيًا',
        rejected_at = now()
    where id = v_app.id and status = 'pending';
    if not found then continue; end if;
    v_count := v_count + 1;
    select id, creator_id into v_next from public.applications
    where campaign_id = v_app.campaign_id and status = 'waitlisted' order by created_at asc limit 1;
    if found then
      update public.applications set status = 'pending', pending_since = now()
      where id = v_next.id and status = 'waitlisted';
    end if;
  end loop;
  return v_count;
end;
$function$;

CREATE OR REPLACE FUNCTION public.team_remove(p_member uuid)
 RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare me uuid;
begin
  select id into me from public.users where auth_id=auth.uid();
  if me is null then raise exception 'no user profile'; end if;
  update public.team_members set status='removed' where owner_id=me and member_id=p_member and status='active';
  if not found then raise exception 'العضو غير موجود في فريقك'; end if;
  return jsonb_build_object('ok', true);
end; $function$;

CREATE OR REPLACE FUNCTION public.team_join(p_code text)
 RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare me uuid; my_role text; owner uuid;
begin
  select id, role into me, my_role from public.users where auth_id=auth.uid();
  if me is null then raise exception 'no user profile'; end if;
  if my_role is distinct from 'brand' then raise exception 'مساحات الفرق مخصّصة لحسابات الشركات فقط'; end if;
  select id into owner from public.users where team_code = upper(trim(p_code));
  if owner is null then raise exception 'رمز غير صحيح'; end if;
  if owner = me then raise exception 'لا يمكنك الانضمام لنفسك'; end if;
  insert into public.team_members(owner_id, member_id, role, status)
    values (owner, me, 'member', 'active')
    on conflict (owner_id, member_id) do update set status='active';
  return jsonb_build_object('ok', true, 'owner_id', owner);
end; $function$;

CREATE OR REPLACE FUNCTION public.simbl_app_contacts(p_app_id uuid)
 RETURNS TABLE(creator_whatsapp text, brand_phone text)
 LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $function$
  select cu.whatsapp, bu.phone
  from applications a
  join campaigns c on c.id = a.campaign_id
  join users cu on cu.id = a.creator_id
  join users bu on bu.id = c.brand_id
  join users me on me.auth_id = auth.uid()
  where a.id = p_app_id and (me.id = a.creator_id or me.id = c.brand_id);
$function$;

CREATE OR REPLACE FUNCTION public.simbl_find_own_profile()
 RETURNS SETOF users
 LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $function$
  select * from users
  where auth_id = auth.uid() or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''));
$function$;

CREATE OR REPLACE FUNCTION public.set_my_city(p_city text)
 RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare v_auth uuid := auth.uid();
begin
  if v_auth is null then raise exception 'not authenticated'; end if;
  update public.users set city = nullif(trim(p_city), '') where auth_id = v_auth and role = 'creator';
end;
$function$;

-- NOTE: بدّل الرابط ومفتاح anon هنا بقيم مشروعك الجديد.
CREATE OR REPLACE FUNCTION public.simbl_push_on_notification()
 RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare rec record; chunk uuid[]; i int; batch_size int := 200;
begin
  for rec in
    select title, message, link, array_agg(user_id) as users
    from new_rows where user_id is not null group by title, message, link
  loop
    i := 1;
    while i <= array_length(rec.users, 1) loop
      chunk := rec.users[i : i + batch_size - 1];
      perform net.http_post(
        url := 'https://YOUR-NEW-PROJECT.supabase.co/functions/v1/send-push',
        headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer YOUR_NEW_ANON_KEY'),
        body := jsonb_build_object('title', rec.title, 'body', rec.message, 'url', coalesce(rec.link,'/'), 'target_users', to_jsonb(chunk))
      );
      i := i + batch_size;
    end loop;
  end loop;
  return null;
end;
$function$;

CREATE OR REPLACE FUNCTION public.campaign_fill_counts(p_ids uuid[])
 RETURNS TABLE(campaign_id uuid, approved integer, closed integer, waitlisted integer)
 LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $function$
  select a.campaign_id,
    count(*) filter (where a.status = 'closed' and a.brand_approved = true)::int as approved,
    count(*) filter (where a.status = 'closed')::int as closed,
    count(*) filter (where a.status = 'waitlisted')::int as waitlisted
  from applications a where a.campaign_id = any(p_ids) group by a.campaign_id;
$function$;

CREATE OR REPLACE FUNCTION public.simbl_deal_contacts()
 RETURNS TABLE(creator_id uuid, name text, whatsapp text, phone text)
 LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $function$
  select distinct u.id, u.name, u.whatsapp, u.phone
  from applications a
  join campaigns c on c.id = a.campaign_id
  join users me on me.auth_id = auth.uid()
  join users u on u.id = a.creator_id
  where c.brand_id = me.id;
$function$;

CREATE OR REPLACE FUNCTION public.simbl_email_exists(p_email text)
 RETURNS boolean
 LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $function$
  select exists(select 1 from users where lower(email) = lower(p_email));
$function$;

CREATE OR REPLACE FUNCTION public.public_creator(p_key text)
 RETURNS TABLE(id text, name text, handle text, platform text, followers text, category text, bio text, website text, avatar_url text, country text, deals_count bigint, ratings_count bigint, avg_rating numeric, avg_content numeric, avg_punctuality numeric, avg_communication numeric, avg_results numeric)
 LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $function$
  select u.id::text, u.name, u.handle, u.platform, u.followers::text,
         u.category, u.bio, u.website, u.avatar_url, u.country,
         t.deals_count::bigint, t.ratings_count::bigint, t.avg_rating::numeric,
         t.avg_content::numeric, t.avg_punctuality::numeric, t.avg_communication::numeric, t.avg_results::numeric
  from public.users u
  left join public.creator_trust t on t.creator_id = u.id
  where u.role = 'creator'
    and ( u.id::text = p_key or lower(regexp_replace(coalesce(u.handle,''), '^@', '')) = lower(regexp_replace(p_key, '^@', '')) )
  order by (u.id::text = p_key) desc limit 1;
$function$;

CREATE OR REPLACE FUNCTION public.admin_list_users()
 RETURNS SETOF users
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
begin
  if (auth.jwt() ->> 'email') is distinct from 'hello@agentsimpleai.com' then
    raise exception 'not authorized';
  end if;
  return query select * from public.users order by created_at desc, id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_my_bank(p_account_holder text, p_iban text, p_bank_name text)
 RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE users SET
    account_holder = NULLIF(TRIM(p_account_holder), ''),
    iban = NULLIF(REPLACE(UPPER(TRIM(p_iban)), ' ', ''), ''),
    bank_name = NULLIF(TRIM(p_bank_name), '')
  WHERE auth_id = auth.uid();
END; $function$;

CREATE OR REPLACE FUNCTION public.get_my_bank()
 RETURNS TABLE(account_holder text, iban text, bank_name text)
 LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT account_holder, iban, bank_name FROM users WHERE auth_id = auth.uid();
$function$;

CREATE OR REPLACE FUNCTION public.my_workspace_brand_ids()
 RETURNS SETOF uuid
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  with me as (select id from public.users where auth_id = auth.uid())
  select id from me
  union
  select tm.owner_id from public.team_members tm join me on tm.member_id = me.id where tm.status='active';
$function$;

CREATE OR REPLACE FUNCTION public.team_my_code()
 RETURNS text
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare me uuid; c text;
begin
  select id, team_code into me, c from public.users where auth_id=auth.uid();
  if me is null then raise exception 'no user profile'; end if;
  if c is null or length(c)=0 then
    loop
      c := upper(substr(md5(gen_random_uuid()::text),1,6));
      begin update public.users set team_code=c where id=me; exit;
      exception when unique_violation then c:=null; end;
    end loop;
  end if;
  return c;
end; $function$;

CREATE OR REPLACE FUNCTION public.team_my_workspace()
 RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare me uuid; o record;
begin
  select id into me from public.users where auth_id=auth.uid();
  if me is null then return jsonb_build_object('is_member', false); end if;
  select u.id as owner_id, u.company_name as cname, tm.permissions as perms
    into o
    from public.team_members tm join public.users u on u.id=tm.owner_id
    where tm.member_id=me and tm.status='active'
    order by tm.created_at asc limit 1;
  if o.owner_id is null then return jsonb_build_object('is_member', false); end if;
  return jsonb_build_object('is_member', true, 'owner_id', o.owner_id,
    'owner_company_name', o.cname, 'permissions', to_jsonb(coalesce(o.perms, array['campaigns','deals','payments'])));
end; $function$;

CREATE OR REPLACE FUNCTION public.team_list()
 RETURNS TABLE(member_id uuid, name text, email text, role text, is_owner boolean, joined_at timestamp with time zone, permissions text[])
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare me uuid; ws uuid;
begin
  select id into me from public.users where auth_id=auth.uid();
  if me is null then return; end if;
  select coalesce((select tm.owner_id from public.team_members tm where tm.member_id=me and tm.status='active' order by tm.created_at asc limit 1), me) into ws;
  return query
    select * from (
      select u.id as member_id, u.company_name as name, u.email as email, 'owner'::text as role, true as is_owner, u.created_at as joined_at, array['campaigns','deals','payments']::text[] as permissions
      from public.users u where u.id=ws
      union all
      select u.id, coalesce(u.company_name,u.name), u.email, tm.role, false, tm.created_at, tm.permissions
      from public.team_members tm join public.users u on u.id=tm.member_id
      where tm.owner_id=ws and tm.status='active'
    ) q
    order by q.is_owner desc, q.joined_at asc;
end; $function$;

CREATE OR REPLACE FUNCTION public.team_set_permissions(p_member uuid, p_perms text[])
 RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare me uuid;
begin
  select id into me from public.users where auth_id=auth.uid();
  if me is null then raise exception 'no user profile'; end if;
  update public.team_members set permissions = coalesce(p_perms,'{}')
    where owner_id=me and member_id=p_member and status='active';
  if not found then raise exception 'العضو غير موجود في فريقك'; end if;
  return jsonb_build_object('ok', true);
end; $function$;

CREATE OR REPLACE FUNCTION public.my_perm_on(bid uuid, perm text)
 RETURNS boolean
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  with me as (select id from public.users where auth_id = auth.uid())
  select case
    when exists (select 1 from me where me.id = bid) then true
    when exists (
      select 1 from public.team_members tm join me on tm.member_id = me.id
      where tm.owner_id = bid and tm.status = 'active' and perm = any(tm.permissions)
    ) then true
    else false end;
$function$;

CREATE OR REPLACE FUNCTION public.my_can_write_apps(bid uuid)
 RETURNS boolean
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  select public.my_perm_on(bid,'deals') or public.my_perm_on(bid,'workflow') or public.my_perm_on(bid,'payments');
$function$;

CREATE OR REPLACE FUNCTION public.enforce_team_app_perms()
 RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare me uuid; owner uuid; perms text[];
begin
  select id into me from public.users where auth_id = auth.uid();
  if me is null then return new; end if;
  select brand_id into owner from public.campaigns where id = new.campaign_id;
  if owner is null then return new; end if;
  if me = owner then return new; end if;
  if me = new.creator_id then return new; end if;
  select tm.permissions into perms from public.team_members tm
    where tm.owner_id = owner and tm.member_id = me and tm.status = 'active';
  if perms is null then return new; end if;
  if (new.brand_approved is distinct from old.brand_approved) or (new.status is distinct from old.status) then
    if not ('deals' = any(perms)) then raise exception 'ليس لديك صلاحية اعتماد/رفض الصفقات' using errcode='42501'; end if;
  end if;
  if (new.stage is distinct from old.stage) or (new.stage_data is distinct from old.stage_data) then
    if not ('workflow' = any(perms) or 'deals' = any(perms)) then raise exception 'ليس لديك صلاحية إدارة التنفيذ' using errcode='42501'; end if;
  end if;
  if (new.payment_status is distinct from old.payment_status)
     or (new.paid_marked_at is distinct from old.paid_marked_at)
     or (new.received_confirmed_at is distinct from old.received_confirmed_at) then
    if not ('payments' = any(perms)) then raise exception 'ليس لديك صلاحية إدارة المستحقات والدفع' using errcode='42501'; end if;
  end if;
  return new;
end; $function$;

CREATE OR REPLACE FUNCTION public.log_team_app_activity()
 RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare me uuid; owner uuid; nm text; cname text; act text; det text; amt numeric;
begin
  select id into me from public.users where auth_id = auth.uid();
  if me is null then return new; end if;
  select brand_id into owner from public.campaigns where id = new.campaign_id;
  if owner is null then return new; end if;
  if me = new.creator_id then return new; end if;
  if me <> owner and not exists (select 1 from public.team_members tm where tm.owner_id=owner and tm.member_id=me and tm.status='active') then
    return new;
  end if;
  select coalesce(company_name, name) into nm from public.users where id = me;
  select coalesce(u.name,'مؤثر') into cname from public.users u where u.id = new.creator_id;
  amt := coalesce(new.final_price, new.price);
  if (new.brand_approved is distinct from old.brand_approved) and new.brand_approved then
    act:='approve'; det:='اعتمد صفقة مع '||cname;
  elsif (new.status is distinct from old.status) and new.status='rejected' then
    act:='reject'; det:='استبدل/رفض المعلن '||cname;
  elsif (new.payment_status is distinct from old.payment_status) and new.payment_status='marked_paid' then
    act:='pay'; det:='أكّد تحويل دفعة لـ'||cname;
  elsif (new.stage is distinct from old.stage) then
    act:='stage'; det:='حدّث مرحلة التنفيذ مع '||cname||' (مرحلة '||coalesce(new.stage,0)::text||')';
  else
    return new;
  end if;
  begin
    insert into public.team_activity(owner_id, actor_id, actor_name, action, detail, target_creator, amount)
      values(owner, me, nm, act, det, cname, case when act in ('approve','pay') then amt else null end);
  exception when others then null; end;
  return new;
end; $function$;

CREATE OR REPLACE FUNCTION public.team_activity_list()
 RETURNS TABLE(actor_id uuid, actor_name text, action text, detail text, target_creator text, amount numeric, created_at timestamp with time zone, is_me boolean)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare me uuid; ws uuid;
begin
  select id into me from public.users where auth_id = auth.uid();
  if me is null then return; end if;
  select coalesce((select tm.owner_id from public.team_members tm where tm.member_id=me and tm.status='active' order by tm.created_at asc limit 1), me) into ws;
  return query
    select ta.actor_id, ta.actor_name, ta.action, ta.detail, ta.target_creator, ta.amount, ta.created_at, (ta.actor_id = me)
    from public.team_activity ta where ta.owner_id = ws
    order by ta.created_at desc limit 100;
end; $function$;

CREATE OR REPLACE FUNCTION public.log_team_campaign_activity()
 RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare me uuid; owner uuid; nm text; act text; det text;
begin
  owner := coalesce(new.brand_id, old.brand_id);
  select id into me from public.users where auth_id = auth.uid();
  if me is null or owner is null then return coalesce(new, old); end if;
  if me <> owner and not exists (
    select 1 from public.team_members tm where tm.owner_id=owner and tm.member_id=me and tm.status='active'
  ) then
    return coalesce(new, old);
  end if;
  select coalesce(company_name, name) into nm from public.users where id = me;
  if TG_OP='INSERT' then act:='camp_create'; det:='أنشأ حملة «'||coalesce(new.title,'')||'»';
  elsif TG_OP='DELETE' then act:='camp_delete'; det:='حذف حملة «'||coalesce(old.title,'')||'»';
  else
    if (new.title is distinct from old.title) or (new.status is distinct from old.status) or (new.budget is distinct from old.budget) then
      act:='camp_edit'; det:='عدّل حملة «'||coalesce(new.title,'')||'»';
    else return new; end if;
  end if;
  begin
    insert into public.team_activity(owner_id, actor_id, actor_name, action, detail)
    values(owner, me, nm, act, det);
  exception when others then null; end;
  return coalesce(new, old);
end; $function$;

-- NOTE: الدالتان التاليتان خاصّتان بلوحة الأدمن الحالية (فيهما إيميلات علامات محدّدة:
--       reef / osma / buyar). للمشروع الجديد بدّل الإيميلات أو احذف الدالتين لو ما تبي نفس اللوحة.
CREATE OR REPLACE FUNCTION public.team_brand_detail(p_label text)
 RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  caller_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_email text; v_brand uuid; awaiting jsonb; stuck jsonb;
begin
  if caller_email not in ('hello@agentsimpleai.com') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  v_email := case lower(p_label)
    when 'reef'  then 'mohamed.alali@reef.sa'
    when 'osma'  then 'mohamed.alali.osma@gmail.com'
    when 'buyar' then 'mohamed.alali.buyar@gmail.com'
    else null end;
  if v_email is null then raise exception 'unknown label'; end if;
  select id into v_brand from users where lower(email) = v_email limit 1;
  if v_brand is null then
    return jsonb_build_object('linked', false, 'awaiting', '[]'::jsonb, 'stuck', '[]'::jsonb);
  end if;
  select coalesce(jsonb_agg(x order by (x->>'closed_at')), '[]'::jsonb) into awaiting
  from (
    select jsonb_build_object('campaign', c.title, 'creator', coalesce(u.name,'—'), 'price', a.final_price, 'closed_at', a.closed_at) as x
    from applications a join campaigns c on c.id = a.campaign_id left join users u on u.id = a.creator_id
    where c.brand_id = v_brand and a.status='closed' and coalesce(a.brand_approved,false)=false and coalesce(a.is_reserve,false)=false
    limit 100
  ) s;
  select coalesce(jsonb_agg(x order by (x->>'closed_at')), '[]'::jsonb) into stuck
  from (
    select jsonb_build_object('campaign', c.title, 'creator', coalesce(u.name,'—'), 'stage', a.stage, 'closed_at', a.closed_at) as x
    from applications a join campaigns c on c.id = a.campaign_id left join users u on u.id = a.creator_id
    where c.brand_id = v_brand and coalesce(a.brand_approved,false)=true and coalesce(a.stage,1) < 9
      and coalesce(a.is_reserve,false)=false and a.closed_at is not null and a.closed_at < now() - interval '5 days'
    limit 100
  ) s;
  return jsonb_build_object('linked', true, 'awaiting', awaiting, 'stuck', stuck);
end;
$function$;

CREATE OR REPLACE FUNCTION public.team_overview()
 RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare caller_email text := lower(coalesce(auth.jwt() ->> 'email', '')); arr jsonb; daily jsonb;
begin
  if caller_email not in ('hello@agentsimpleai.com') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  with brand_map(label, sort, email) as (
    values ('reef',1,'mohamed.alali@reef.sa'), ('osma',2,'mohamed.alali.osma@gmail.com'), ('buyar',3,'mohamed.alali.buyar@gmail.com')
  ),
  b as (
    select bm.label, bm.sort, u.id as brand_id, coalesce(u.company_name, bm.label) as company_name
    from brand_map bm left join users u on lower(u.email) = bm.email
  ),
  ap as (
    select a.stage, a.status, a.brand_approved, a.completed_at, a.closed_at, a.rejected_at, a.is_reserve, c.brand_id
    from applications a join campaigns c on c.id = a.campaign_id
    where c.brand_id in (select brand_id from b where brand_id is not null)
  )
  select jsonb_agg(row_to_json(t)::jsonb order by t.sort) into arr from (
    select b.label, b.sort, b.company_name, (b.brand_id is not null) as linked,
      coalesce((select count(*) from campaigns c where c.brand_id=b.brand_id and c.status='active'),0) as active_campaigns,
      coalesce((select count(*) from ap a where a.brand_id=b.brand_id and a.status='closed' and coalesce(a.brand_approved,false)=false and coalesce(a.is_reserve,false)=false),0) as awaiting_approval,
      coalesce((select count(*) from ap a where a.brand_id=b.brand_id and coalesce(a.brand_approved,false)=true and coalesce(a.stage,1)<9 and coalesce(a.is_reserve,false)=false),0) as in_progress,
      coalesce((select count(*) from ap a where a.brand_id=b.brand_id and coalesce(a.brand_approved,false)=true and coalesce(a.stage,1)<9 and coalesce(a.is_reserve,false)=false and a.closed_at is not null and a.closed_at < now()-interval '5 days'),0) as stuck,
      coalesce((select count(*) from ap a where a.brand_id=b.brand_id and coalesce(a.stage,0)>=9 and (a.completed_at at time zone 'Asia/Riyadh')::date=(now() at time zone 'Asia/Riyadh')::date),0) as completed_today,
      coalesce((select count(*) from ap a where a.brand_id=b.brand_id and coalesce(a.stage,0)>=9 and (a.completed_at at time zone 'Asia/Riyadh')>=date_trunc('week',now() at time zone 'Asia/Riyadh')),0) as completed_week,
      coalesce((select count(*) from ap a where a.brand_id=b.brand_id and coalesce(a.stage,0)>=9),0) as completed_total,
      coalesce((select count(*) from ap a where a.brand_id=b.brand_id and a.status='rejected' and a.rejected_at is not null and (a.rejected_at at time zone 'Asia/Riyadh')>=date_trunc('week',now() at time zone 'Asia/Riyadh')),0) as rejected_week,
      coalesce((select jsonb_object_agg(s::text, cnt) from (
          select coalesce(a2.stage,1) as s, count(*) as cnt from ap a2
          where a2.brand_id=b.brand_id and coalesce(a2.brand_approved,false)=true and coalesce(a2.stage,1)<9 and coalesce(a2.is_reserve,false)=false
          group by coalesce(a2.stage,1)
      ) sd), '{}'::jsonb) as stages
    from b
  ) t;
  select coalesce(jsonb_agg(jsonb_build_object('d', d, 'n', n) order by d), '[]'::jsonb) into daily
  from (
    select (a.completed_at at time zone 'Asia/Riyadh')::date as d, count(*) as n
    from applications a join campaigns c on c.id = a.campaign_id
    where c.brand_id in (select id from users where lower(email) in ('mohamed.alali@reef.sa','mohamed.alali.osma@gmail.com','mohamed.alali.buyar@gmail.com'))
      and coalesce(a.stage,0) >= 9 and a.completed_at is not null
      and (a.completed_at at time zone 'Asia/Riyadh')::date >= (now() at time zone 'Asia/Riyadh')::date - 6
    group by 1
  ) x;
  return jsonb_build_object('generated_at', now(), 'brands', coalesce(arr,'[]'::jsonb), 'daily', daily);
end;
$function$;

-- ===== TRIGGERS =====
CREATE TRIGGER workflow_completion_trigger BEFORE UPDATE ON public.workflow_stages FOR EACH ROW EXECUTE FUNCTION create_payment_on_completion();
CREATE TRIGGER simbl_push_after_insert AFTER INSERT ON public.notifications REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION simbl_push_on_notification();
CREATE TRIGGER trg_enforce_team_app_perms BEFORE UPDATE ON public.applications FOR EACH ROW EXECUTE FUNCTION enforce_team_app_perms();
CREATE TRIGGER trg_log_team_app_activity AFTER UPDATE ON public.applications FOR EACH ROW EXECUTE FUNCTION log_team_app_activity();
CREATE TRIGGER trg_log_team_campaign_activity AFTER INSERT OR DELETE OR UPDATE ON public.campaigns FOR EACH ROW EXECUTE FUNCTION log_team_campaign_activity();

-- ===== ENABLE ROW LEVEL SECURITY =====
ALTER TABLE public.negotiations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._backup_deleted_apps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creator_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shared_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.impersonation_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creator_socials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;

-- ===== POLICIES =====
CREATE POLICY anyone_insert_negotiations ON public.negotiations AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((EXISTS ( SELECT 1 FROM (applications a JOIN campaigns c ON ((c.id = a.campaign_id)))
  WHERE ((a.id = negotiations.application_id) AND ((a.creator_id IN ( SELECT users.id FROM users WHERE (users.auth_id = auth.uid()))) OR (c.brand_id IN ( SELECT users.id FROM users WHERE (users.auth_id = auth.uid()))))))));

CREATE POLICY users_can_insert_self ON public.users AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((auth.uid() = auth_id));

CREATE POLICY "allow signup insert" ON public.users AS PERMISSIVE FOR INSERT TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY brand_delete_own_campaigns ON public.campaigns AS PERMISSIVE FOR DELETE TO authenticated
  USING ((brand_id IN ( SELECT users.id FROM users WHERE (users.auth_id = auth.uid()))));

CREATE POLICY brand_update_own_campaigns ON public.campaigns AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((brand_id IN ( SELECT users.id FROM users WHERE (users.auth_id = auth.uid()))))
  WITH CHECK ((brand_id IN ( SELECT users.id FROM users WHERE (users.auth_id = auth.uid()))));

CREATE POLICY brand_delete_campaign_applications ON public.applications AS PERMISSIVE FOR DELETE TO authenticated
  USING ((campaign_id IN ( SELECT campaigns.id FROM campaigns WHERE (campaigns.brand_id IN ( SELECT users.id FROM users WHERE (users.auth_id = auth.uid()))))));

CREATE POLICY brand_delete_campaign_negotiations ON public.negotiations AS PERMISSIVE FOR DELETE TO authenticated
  USING ((application_id IN ( SELECT a.id FROM (applications a JOIN campaigns c ON ((a.campaign_id = c.id))) WHERE (c.brand_id IN ( SELECT users.id FROM users WHERE (users.auth_id = auth.uid()))))));

CREATE POLICY brand_update_campaign_applications ON public.applications AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((campaign_id IN ( SELECT campaigns.id FROM campaigns WHERE (campaigns.brand_id IN ( SELECT users.id FROM users WHERE (users.auth_id = auth.uid()))))))
  WITH CHECK ((campaign_id IN ( SELECT campaigns.id FROM campaigns WHERE (campaigns.brand_id IN ( SELECT users.id FROM users WHERE (users.auth_id = auth.uid()))))));

CREATE POLICY creator_update_own_applications ON public.applications AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((creator_id IN ( SELECT users.id FROM users WHERE (users.auth_id = auth.uid()))))
  WITH CHECK ((creator_id IN ( SELECT users.id FROM users WHERE (users.auth_id = auth.uid()))));

CREATE POLICY payments_read_parties ON public.payments AS PERMISSIVE FOR SELECT TO public
  USING (((brand_id IN ( SELECT users.id FROM users WHERE (users.auth_id = auth.uid()))) OR (creator_id IN ( SELECT users.id FROM users WHERE (users.auth_id = auth.uid())))));

CREATE POLICY payments_update_parties ON public.payments AS PERMISSIVE FOR UPDATE TO public
  USING (((brand_id IN ( SELECT users.id FROM users WHERE (users.auth_id = auth.uid()))) OR (creator_id IN ( SELECT users.id FROM users WHERE (users.auth_id = auth.uid())))));

CREATE POLICY creator_insert_own_application ON public.applications AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((creator_id IN ( SELECT users.id FROM users WHERE (users.auth_id = auth.uid()))));

CREATE POLICY parties_read_applications ON public.applications AS PERMISSIVE FOR SELECT TO authenticated
  USING (((creator_id IN ( SELECT users.id FROM users WHERE (users.auth_id = auth.uid()))) OR (campaign_id IN ( SELECT c.id FROM campaigns c WHERE (c.brand_id IN ( SELECT users.id FROM users WHERE (users.auth_id = auth.uid())))))));

CREATE POLICY read_own_notifications ON public.notifications AS PERMISSIVE FOR SELECT TO authenticated
  USING ((user_id IN ( SELECT users.id FROM users WHERE (users.auth_id = auth.uid()))));

CREATE POLICY "creator_ratings read" ON public.creator_ratings AS PERMISSIVE FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY parties_read_negotiations ON public.negotiations AS PERMISSIVE FOR SELECT TO authenticated
  USING ((application_id IN ( SELECT a.id FROM applications a WHERE ((a.creator_id IN ( SELECT users.id FROM users WHERE (users.auth_id = auth.uid()))) OR (a.campaign_id IN ( SELECT c.id FROM campaigns c WHERE (c.brand_id IN ( SELECT users.id FROM users WHERE (users.auth_id = auth.uid())))))))));

CREATE POLICY own_push_subscriptions ON public.push_subscriptions AS PERMISSIVE FOR ALL TO authenticated
  USING ((user_id IN ( SELECT users.id FROM users WHERE (users.auth_id = auth.uid()))))
  WITH CHECK ((user_id IN ( SELECT users.id FROM users WHERE (users.auth_id = auth.uid()))));

CREATE POLICY authenticated_read_users ON public.users AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY auth_insert_notifications ON public.notifications AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY admin_read_users ON public.users AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_platform_admin());

CREATE POLICY admin_read_campaigns ON public.campaigns AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_platform_admin());

CREATE POLICY admin_read_applications ON public.applications AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_platform_admin());

CREATE POLICY admin_read_negotiations ON public.negotiations AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_platform_admin());

CREATE POLICY admin_read_notifications ON public.notifications AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_platform_admin());

CREATE POLICY admin_update_users ON public.users AS PERMISSIVE FOR UPDATE TO authenticated
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());

CREATE POLICY anyone_read_campaigns ON public.campaigns AS PERMISSIVE FOR SELECT TO public
  USING (true);

CREATE POLICY anyone_insert_campaigns ON public.campaigns AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((brand_id IN ( SELECT users.id FROM users WHERE (users.auth_id = auth.uid()))));

CREATE POLICY admin_manage_campaigns ON public.campaigns AS PERMISSIVE FOR ALL TO authenticated
  USING (((auth.jwt() ->> 'email'::text) = 'hello@agentsimpleai.com'::text))
  WITH CHECK (((auth.jwt() ->> 'email'::text) = 'hello@agentsimpleai.com'::text));

CREATE POLICY admin_manage_applications ON public.applications AS PERMISSIVE FOR ALL TO authenticated
  USING (((auth.jwt() ->> 'email'::text) = 'hello@agentsimpleai.com'::text))
  WITH CHECK (((auth.jwt() ->> 'email'::text) = 'hello@agentsimpleai.com'::text));

CREATE POLICY admin_manage_negotiations ON public.negotiations AS PERMISSIVE FOR ALL TO authenticated
  USING (((auth.jwt() ->> 'email'::text) = 'hello@agentsimpleai.com'::text))
  WITH CHECK (((auth.jwt() ->> 'email'::text) = 'hello@agentsimpleai.com'::text));

CREATE POLICY "creator_ratings insert" ON public.creator_ratings AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((EXISTS ( SELECT 1 FROM users u WHERE ((u.id = creator_ratings.brand_id) AND (u.auth_id = ( SELECT auth.uid() AS uid))))) AND (EXISTS ( SELECT 1 FROM (applications a JOIN campaigns c ON ((a.campaign_id = c.id))) WHERE ((a.id = creator_ratings.application_id) AND (c.brand_id = c.brand_id) AND (a.creator_id = a.creator_id))))));

CREATE POLICY team_select_campaigns ON public.campaigns AS PERMISSIVE FOR SELECT TO authenticated
  USING ((brand_id IN ( SELECT my_workspace_brand_ids() AS my_workspace_brand_ids)));

CREATE POLICY team_select_applications ON public.applications AS PERMISSIVE FOR SELECT TO authenticated
  USING ((campaign_id IN ( SELECT campaigns.id FROM campaigns WHERE (campaigns.brand_id IN ( SELECT my_workspace_brand_ids() AS my_workspace_brand_ids)))));

CREATE POLICY team_select_negotiations ON public.negotiations AS PERMISSIVE FOR SELECT TO authenticated
  USING ((application_id IN ( SELECT a.id FROM (applications a JOIN campaigns c ON ((a.campaign_id = c.id))) WHERE (c.brand_id IN ( SELECT my_workspace_brand_ids() AS my_workspace_brand_ids)))));

CREATE POLICY team_insert_negotiations ON public.negotiations AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((application_id IN ( SELECT a.id FROM (applications a JOIN campaigns c ON ((a.campaign_id = c.id))) WHERE (c.brand_id IN ( SELECT my_workspace_brand_ids() AS my_workspace_brand_ids)))));

CREATE POLICY team_delete_negotiations ON public.negotiations AS PERMISSIVE FOR DELETE TO authenticated
  USING ((application_id IN ( SELECT a.id FROM (applications a JOIN campaigns c ON ((a.campaign_id = c.id))) WHERE (c.brand_id IN ( SELECT my_workspace_brand_ids() AS my_workspace_brand_ids)))));

CREATE POLICY team_insert_campaigns ON public.campaigns AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (my_perm_on(brand_id, 'campaigns'::text));

CREATE POLICY team_update_campaigns ON public.campaigns AS PERMISSIVE FOR UPDATE TO authenticated
  USING (my_perm_on(brand_id, 'campaigns'::text))
  WITH CHECK (my_perm_on(brand_id, 'campaigns'::text));

CREATE POLICY team_delete_campaigns ON public.campaigns AS PERMISSIVE FOR DELETE TO authenticated
  USING (my_perm_on(brand_id, 'campaigns'::text));

CREATE POLICY team_update_applications ON public.applications AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((EXISTS ( SELECT 1 FROM campaigns c WHERE ((c.id = applications.campaign_id) AND my_can_write_apps(c.brand_id)))))
  WITH CHECK ((EXISTS ( SELECT 1 FROM campaigns c WHERE ((c.id = applications.campaign_id) AND my_can_write_apps(c.brand_id)))));

CREATE POLICY team_delete_applications ON public.applications AS PERMISSIVE FOR DELETE TO authenticated
  USING ((EXISTS ( SELECT 1 FROM campaigns c WHERE ((c.id = applications.campaign_id) AND my_can_write_apps(c.brand_id)))));

-- ===== STORAGE BUCKETS =====
INSERT INTO storage.buckets (id, name, public) VALUES ('cr-docs', 'cr-docs', false) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('content', 'content', true) ON CONFLICT (id) DO NOTHING;

-- ===== STORAGE POLICIES (on storage.objects) =====
CREATE POLICY "avatars read" ON storage.objects AS PERMISSIVE FOR SELECT TO public
  USING ((bucket_id = 'avatars'::text));
CREATE POLICY "avatars update" ON storage.objects AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((bucket_id = 'avatars'::text));
CREATE POLICY "avatars upload" ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((bucket_id = 'avatars'::text));
CREATE POLICY "content insert" ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((bucket_id = 'content'::text));
CREATE POLICY "content read" ON storage.objects AS PERMISSIVE FOR SELECT TO public
  USING ((bucket_id = 'content'::text));
CREATE POLICY cr_docs_admin_read ON storage.objects AS PERMISSIVE FOR SELECT TO authenticated
  USING (((bucket_id = 'cr-docs'::text) AND is_platform_admin()));
CREATE POLICY cr_docs_insert ON storage.objects AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((bucket_id = 'cr-docs'::text));

-- ===== HARDENING: منع تنفيذ دوال داخلية/تسجيل من العملاء =====
REVOKE EXECUTE ON FUNCTION public.team_activity_list() FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.team_activity_list() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.log_team_app_activity() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_team_campaign_activity() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_team_app_perms() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.simbl_push_on_notification() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_payment_on_completion() FROM public, anon, authenticated;

-- =====================================================================
-- انتهى المخطط. تذكّر:
--  • عدّل simbl_run_reminders / simbl_push_on_notification برابط ومفتاح مشروعك.
--  • فعّل leaked password protection من Supabase → Authentication.
--  • حساب الأدمن معرّف بالإيميل hello@agentsimpleai.com داخل الدوال والسياسات —
--    بدّله بإيميل الأدمن الجديد (بحث/استبدال) لو تبي أدمن مختلف.
-- =====================================================================
