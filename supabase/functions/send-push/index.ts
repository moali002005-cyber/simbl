import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "https://esm.sh/web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { title, body, url, target_users } = await req.json();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // اجلب VAPID keys من app_secrets
    const { data: secrets, error: secretsError } = await supabase
      .from("app_secrets")
      .select("key, value");

    if (secretsError) throw secretsError;

    const vapidPublic = secrets.find((s) => s.key === "vapid_public_key")?.value;
    const vapidPrivate = secrets.find((s) => s.key === "vapid_private_key")?.value;
    const vapidSubject = secrets.find((s) => s.key === "vapid_subject")?.value;

    if (!vapidPublic || !vapidPrivate || !vapidSubject) {
      throw new Error("VAPID keys not configured");
    }

    webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);

    // اجلب الاشتراكات
    let query = supabase.from("push_subscriptions").select("*");
    if (target_users && target_users.length > 0) {
      query = query.in("user_id", target_users);
    }

    const { data: subscriptions, error: subError } = await query;
    if (subError) throw subError;

    if (!subscriptions || subscriptions.length === 0) {
      return new Response(
        JSON.stringify({ success: true, sent: 0, message: "No subscriptions" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // أرسل لكل مشترك
    const payload = JSON.stringify({
      title: title || "سيمبل",
      body: body || "",
      url: url || "/",
    });

    const results = await Promise.allSettled(
      subscriptions.map((sub) =>
        webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          payload
        )
      )
    );

    const successful = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.filter((r) => r.status === "rejected").length;

    // احذف الاشتراكات الفاشلة (مثلاً المؤثرة شالت التطبيق)
    for (let i = 0; i < results.length; i++) {
      if (results[i].status === "rejected") {
        const err: any = (results[i] as PromiseRejectedResult).reason;
        if (err?.statusCode === 410 || err?.statusCode === 404) {
          await supabase
            .from("push_subscriptions")
            .delete()
            .eq("endpoint", subscriptions[i].endpoint);
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        sent: successful,
        failed: failed,
        total: subscriptions.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
