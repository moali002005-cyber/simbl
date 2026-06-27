// ============================================================
//  tiktok-callback
//  يستقبل رد تيك توك بعد التفويض، يبادل الرمز (code) بتوكن،
//  يخزّنه في creator_socials (بصلاحية الخدمة)، ويضبط علم
//  users.tiktok_connected = true، ثم يرجّع المؤثر للملف الشخصي.
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CLIENT_KEY = Deno.env.get("TIKTOK_CLIENT_KEY")!;
const CLIENT_SECRET = Deno.env.get("TIKTOK_CLIENT_SECRET")!;
const STATE_SECRET = Deno.env.get("CRON_SECRET") || "simbl-state";
const REDIRECT_URI =
  "https://rdzzzasbyzugxogbgwwn.supabase.co/functions/v1/tiktok-callback";
const SITE = "https://www.agentsimpleai.com";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

async function sign(value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(STATE_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(value),
  );
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state") || "";
  const denied = url.searchParams.get("error");

  if (denied) return Response.redirect(`${SITE}/profile.html?tiktok=denied`, 302);
  if (!code || !state.includes(".")) {
    return Response.redirect(`${SITE}/profile.html?tiktok=error`, 302);
  }

  const dot = state.lastIndexOf(".");
  const creator = state.slice(0, dot);
  const sig = state.slice(dot + 1);
  if ((await sign(creator)) !== sig) {
    return Response.redirect(`${SITE}/profile.html?tiktok=error`, 302);
  }

  // تبادل الرمز بالتوكن
  const body = new URLSearchParams({
    client_key: CLIENT_KEY,
    client_secret: CLIENT_SECRET,
    code,
    grant_type: "authorization_code",
    redirect_uri: REDIRECT_URI,
  });

  const res = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const j = await res.json();
  const d = j.data || j; // دعم الشكلين

  if (!d.access_token) {
    console.error("token exchange failed", JSON.stringify(j));
    return Response.redirect(`${SITE}/profile.html?tiktok=error`, 302);
  }

  const now = Date.now();
  const expiresAt = new Date(
    now + (Number(d.expires_in) || 86400) * 1000,
  ).toISOString();
  const refreshExpiresAt = new Date(
    now + (Number(d.refresh_expires_in) || 31536000) * 1000,
  ).toISOString();

  await supabase.from("creator_socials").upsert(
    {
      creator_id: creator,
      platform: "tiktok",
      open_id: d.open_id || null,
      access_token: d.access_token,
      refresh_token: d.refresh_token || null,
      expires_at: expiresAt,
      refresh_expires_at: refreshExpiresAt,
      scope: d.scope || "user.info.basic,video.list",
      connected_at: new Date().toISOString(),
    },
    { onConflict: "creator_id,platform" },
  );

  await supabase.from("users").update({ tiktok_connected: true }).eq(
    "id",
    creator,
  );

  return Response.redirect(`${SITE}/profile.html?tiktok=connected`, 302);
});
