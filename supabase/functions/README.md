# Supabase Edge Functions — نشر وأسرار

هذي الوظائف تعيش في Supabase (مو على Vercel). انشرها بـ Supabase CLI:

```bash
supabase login
supabase link --project-ref <NEW_PROJECT_REF>
supabase functions deploy send-push
supabase functions deploy waitlist-cron
supabase functions deploy impersonate
supabase functions deploy tiktok-auth-start
supabase functions deploy tiktok-callback
supabase functions deploy tiktok-refresh-stats
```

## الأسرار المطلوبة (Supabase → Edge Functions → Secrets / أو `supabase secrets set`)
- `SUPABASE_URL` و `SUPABASE_SERVICE_ROLE_KEY` — تُحقن تلقائيًا عادةً؛ إن لزم اضبطها.
- مفاتيح VAPID للـWeb Push: مخزّنة في جدول `app_secrets` (`vapid_public_key`, `vapid_private_key`, `vapid_subject`) — وّلد زوجًا جديدًا وأدخِله هناك، وحدّث المفتاح العام في `push-subscribe.js`.
- تيك توك: `TIKTOK_CLIENT_KEY` و `TIKTOK_CLIENT_SECRET` (من TikTok Developer Portal) — تحتاجها دوال tiktok-*.

## verify_jwt (كما في الإنتاج)
- `send-push`: true · `waitlist-cron`: true · `impersonate`: true
- `tiktok-auth-start` / `tiktok-callback` / `tiktok-refresh-stats`: false

## الجدولة (pg_cron) — بعد نشر الوظائف والدوال
```sql
select cron.schedule('simbl-reminders-15min', '*/15 * * * *', $$select public.simbl_run_reminders();$$);
select cron.schedule('simbl-waitlist-replace', '* * * * *', $$select public.run_waitlist_replace(15);$$);
```

## تخصيص للمشروع الجديد
- `impersonate/index.ts`: بدّل `ADMIN_EMAILS` بإيميل الأدمن الجديد.
- الدوال التي تستدعي `send-push` عبر رابط ثابت داخل SQL (`simbl_run_reminders`, `simbl_push_on_notification`) — بدّل الرابط ومفتاح anon.
