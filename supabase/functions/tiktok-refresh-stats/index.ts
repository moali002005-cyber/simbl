// ============================================================
//  tiktok-refresh-stats   (تشتغل كل ساعة عبر Cron)
//  - تجدّد التوكن لكل مؤثر مربوط عند الحاجة
//  - تطابق رابط منشور كل صفقة (stage_data["7"].publish_link)
//    بمعرّف فيديو، وتطلب إحصاءاته من تيك توك
//  - تحدّث applications.content_views/likes/comments/shares
//  محمية بمفتاح: تُستدعى هكذا  ...?key=<CRON_SECRET>
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CLIENT_KEY = Deno.env.get("TIKTOK_CLIENT_KEY")!;
const CLIENT_SECRET = Deno.env.get("TIKTOK_CLIENT_SECRET")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

function parseVideoId(link: string): string | null {
  if (!link) return null;
  const m = link.match(/\/video\/(\d+)/);
  return m ? m[1] : null;
}

// لو الرابط مختصر (vm.tiktok.com) نتبع التحويل ونستخرج المعرّف
async function resolveVideoId(link: string): Promise<string | null> {
  const direct = parseVideoId(link);
  if (direct) return direct;
  try {
    const r = await fetch(link, { redirect: "follow" });
    return parseVideoId(r.url);
  } catch {
    return null;
  }
}

async function refreshToken(row: any): Promise<string | null> {
  const body = new URLSearchParams({
    client_key: CLIENT_KEY,
    client_secret: CLIENT_SECRET,
    grant_type: "refresh_token",
    refresh_token: row.refresh_token,
  });
  const r = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const j = await r.json();
  const d = j.data || j;
  if (!d.access_token) {
    console.error("refresh failed for", row.creator_id, JSON.stringify(j));
    return null;
  }
  const now = Date.now();
  await supabase
    .from("creator_socials")
    .update({
      access_token: d.access_token,
      refresh_token: d.refresh_token || row.refresh_token,
      expires_at: new Date(now + (Number(d.expires_in) || 86400) * 1000)
        .toISOString(),
      refresh_expires_at: new Date(
        now + (Number(d.refresh_expires_in) || 31536000) * 1000,
      ).toISOString(),
    })
    .eq("creator_id", row.creator_id)
    .eq("platform", "tiktok");
  return d.access_token;
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (CRON_SECRET && url.searchParams.get("key") !== CRON_SECRET) {
    return new Response("unauthorized", { status: 401 });
  }

  const { data: socials } = await supabase
    .from("creator_socials")
    .select("*")
    .eq("platform", "tiktok");

  let updated = 0;

  for (const row of socials || []) {
    // 1) جدّد التوكن لو خلص أو قرب
    let token = row.access_token;
    const exp = row.expires_at ? Date.parse(row.expires_at) : 0;
    if (!token || exp - Date.now() < 5 * 60 * 1000) {
      token = await refreshToken(row);
      if (!token) continue;
    }

    // 2) اجمع فيديوهات صفقات هذا المؤثر المنشورة
    const { data: apps } = await supabase
      .from("applications")
      .select("id, stage, stage_data")
      .eq("creator_id", row.creator_id)
      .gte("stage", 7);

    const idToApps: Record<string, string[]> = {};
    for (const a of apps || []) {
      const sd = (a.stage_data && typeof a.stage_data === "object")
        ? a.stage_data
        : {};
      const link = sd["7"]?.publish_link;
      if (!link) continue;
      const vid = await resolveVideoId(String(link));
      if (!vid) continue;
      (idToApps[vid] = idToApps[vid] || []).push(a.id);
    }

    const videoIds = Object.keys(idToApps).slice(0, 20);
    if (!videoIds.length) continue;

    // 3) اطلب إحصاءات الفيديوهات المعروفة
    const q = await fetch(
      "https://open.tiktokapis.com/v2/video/query/?fields=id,view_count,like_count,comment_count,share_count",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ filters: { video_ids: videoIds } }),
      },
    );
    const qj = await q.json();
    const vids = qj?.data?.videos || [];

    for (const v of vids) {
      const appIds = idToApps[String(v.id)] || [];
      for (const appId of appIds) {
        await supabase
          .from("applications")
          .update({
            content_views: v.view_count ?? null,
            content_likes: v.like_count ?? null,
            content_comments: v.comment_count ?? null,
            content_shares: v.share_count ?? null,
            tiktok_video_id: String(v.id),
            content_fetched_at: new Date().toISOString(),
          })
          .eq("id", appId);
        updated++;
      }
    }
  }

  return new Response(JSON.stringify({ ok: true, updated }), {
    headers: { "Content-Type": "application/json" },
  });
});
