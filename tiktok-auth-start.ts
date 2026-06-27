// ============================================================
//  tiktok-auth-start
//  يبدأ ربط حساب المؤثر بتيك توك: يبني رابط تفويض تيك توك
//  ويحوّل المتصفّح إليه. المفتاح يجي من الأسرار (env) فالواجهة
//  ما تحتاجه.
//  افتحه هكذا:  /functions/v1/tiktok-auth-start?creator=<معرّف_المؤثر>
// ============================================================

const CLIENT_KEY = Deno.env.get("TIKTOK_CLIENT_KEY")!;
const STATE_SECRET = Deno.env.get("CRON_SECRET") || "simbl-state";
const REDIRECT_URI =
  "https://rdzzzasbyzugxogbgwwn.supabase.co/functions/v1/tiktok-callback";

// توقيع بسيط للـstate عشان ما أحد يعبث فيه
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
  const creator = (url.searchParams.get("creator") || "").trim();
  if (!creator) {
    return new Response("missing creator id", { status: 400 });
  }

  const state = `${creator}.${await sign(creator)}`;

  const auth = new URL("https://www.tiktok.com/v2/auth/authorize/");
  auth.searchParams.set("client_key", CLIENT_KEY);
  auth.searchParams.set("scope", "user.info.basic,video.list");
  auth.searchParams.set("response_type", "code");
  auth.searchParams.set("redirect_uri", REDIRECT_URI);
  auth.searchParams.set("state", state);

  return Response.redirect(auth.toString(), 302);
});
