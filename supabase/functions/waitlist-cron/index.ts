// supabase/functions/waitlist-cron/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const DEADLINE_MINUTES = 15; // مهلة الرد قبل الاستبدال التلقائي

serve(async (_req) => {
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const cutoff = new Date(Date.now() - DEADLINE_MINUTES * 60 * 1000).toISOString();
    const funcBase = Deno.env.get("SUPABASE_URL")!.replace(/\/$/, "");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // 1) المنتظرون المُرقّون (لهم pending_since) اللي تجاوزوا المهلة ولم يقفلوا صفقة
    const { data: overdue, error: e1 } = await supabase
      .from("applications")
      .select("id, campaign_id")
      .eq("status", "pending")
      .not("pending_since", "is", null)
      .lt("pending_since", cutoff);
    if (e1) throw e1;

    console.log("overdue found:", (overdue || []).length);

    let replaced = 0, promoted = 0;

    for (const app of overdue || []) {
      // استبدال المتجاوز (نعيد استخدام حالة rejected الموجودة = يظهر "تم الاستبدال")
      const { data: rjRows, error: rjErr } = await supabase
        .from("applications")
        .update({
          status: "rejected",
          rejection_reason: "انتهت مهلة الرد (" + DEADLINE_MINUTES + " دقيقة) — تم الاستبدال تلقائيًا",
          rejected_at: new Date().toISOString(),
        })
        .eq("id", app.id)
        .eq("status", "pending")
        .select("id");
      if (rjErr) { console.error("replace failed", rjErr); continue; }
      if (!rjRows || rjRows.length === 0) continue; // تغيّرت حالته للتو (أقفل مثلًا) — تخطّاه
      replaced++;

      // ترقية التالي من قائمة الانتظار (الأقدم) لنفس الحملة
      const { data: nexts, error: e2 } = await supabase
        .from("applications")
        .select("id, creator_id")
        .eq("campaign_id", app.campaign_id)
        .eq("status", "waitlisted")
        .order("created_at", { ascending: true })
        .limit(1);
      if (e2) { console.error(e2); continue; }
      const next = nexts && nexts[0];
      if (!next) continue;

      const { error: prErr } = await supabase
        .from("applications")
        .update({ status: "pending", pending_since: new Date().toISOString() })
        .eq("id", next.id)
        .eq("status", "waitlisted");
      if (prErr) { console.error("promote failed", prErr); continue; }
      promoted++;

      // إشعار «جاك دورك» للمُرقّى الجديد
      if (next.creator_id) {
        try {
          await fetch(funcBase + "/functions/v1/send-push", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": "Bearer " + serviceKey },
            body: JSON.stringify({
              title: "جاك دورك! 🌿",
              body: "انفتح لك مكان في الحملة — افتح المحادثة الآن عشان يبدأ الوكيل يفاوضك (لديك " + DEADLINE_MINUTES + " دقيقة).",
              url: "/creator.html",
              target_users: [next.creator_id],
            }),
          });
        } catch (e) { console.error("push failed", e); }
      }
    }

    return new Response(JSON.stringify({ ok: true, replaced, promoted }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, error: (error as Error).message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
