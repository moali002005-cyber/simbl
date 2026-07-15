// Vercel Serverless Function: /api/generate-brief
// يقترح "البريف الإعلاني" للشركة تلقائيًا بالذكاء الاصطناعي.
// المدخلات: عنوان الحملة + التصنيف + نوع الحملة + المنصة (+ ملاحظة اختيارية).
// الهوية تُشتقّ من توكن الجلسة (حسابات الشركات فقط) لمنع الإساءة واستهلاك التكلفة.

const SUPABASE_URL = 'https://rdzzzasbyzugxogbgwwn.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJkenp6YXNieXp1Z3hvZ2Jnd3duIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3MDI5NjMsImV4cCI6MjA5NTI3ODk2M30.aS9lOVt7VyfwTV7bmsxxDUanWfs5v-TMBlGbwcDNomM';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY;

const INDUSTRY_LABELS = { perfumes: 'عطور', fashion: 'موضة', beauty: 'جمال وعناية', food: 'طعام ومطاعم', tech: 'تقنية', other: 'عام' };
const PLATFORM_LABELS = { tiktok: 'تيك توك', snapchat: 'سناب شات', x: 'إكس', instagram: 'انستقرام', youtube: 'يوتيوب' };

function svcHeaders() {
  return { 'apikey': SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`, 'Content-Type': 'application/json' };
}
async function sbGet(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: svcHeaders() });
  if (!res.ok) { console.error('sbGet error:', await res.text()); throw new Error('GET failed'); }
  return res.json();
}
async function getAuthedUser(req) {
  try {
    const authz = req.headers['authorization'] || req.headers['Authorization'] || '';
    const token = authz.startsWith('Bearer ') ? authz.slice(7).trim() : '';
    if (!token) return null;
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${token}` } });
    if (!r.ok) return null;
    const au = await r.json();
    if (!au || !au.id) return null;
    const rows = await sbGet(`users?auth_id=eq.${au.id}&select=id,role,company_name`);
    return (rows && rows[0]) || null;
  } catch (e) { console.error('getAuthedUser error:', e); return null; }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await getAuthedUser(req);
  if (!user) return res.status(401).json({ error: 'يلزم تسجيل الدخول من جديد' });
  if (user.role !== 'brand') return res.status(403).json({ error: 'هذه الميزة مخصّصة لحسابات الشركات' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'الخدمة غير مهيّأة حاليًا' });

  let { title, industry, campaign_type, platform, note } = req.body || {};
  title = String(title || '').trim().slice(0, 200);
  note = String(note || '').trim().slice(0, 400);
  if (!title) return res.status(400).json({ error: 'اكتب عنوان الحملة أولاً عشان أقترح لك البريف' });

  const brand = String(user.company_name || 'الشركة').slice(0, 80);
  const industryLabel = INDUSTRY_LABELS[industry] || 'عام';
  const platformLabel = PLATFORM_LABELS[platform] || 'المنصة المختارة';
  const isVisit = campaign_type === 'visit';
  const typeLabel = isVisit ? 'زيارة ميدانية للمكان/الفرع وتصوير المحتوى هناك' : 'محتوى منزلي (المنتج يوصل للمعلن ويصوّره)';

  const systemPrompt = `أنت خبير تسويق مؤثرين سعودي تكتب "بريف إعلاني" احترافي وواضح للمعلن (المؤثر) نيابةً عن شركة.
البريف هو التعليمات اللي المؤثر يقرأها قبل ما يجهّز المحتوى.

اكتب بريف عربي عملي وجاهز للإرسال، منظّم في نقاط قصيرة تحت هذي العناوين بالضبط (بدون أي مقدمة أو خاتمة خارجها):
الهدف من الحملة:
الجمهور المستهدف:
المحاور والنقاط الأساسية:
نوع المحتوى المطلوب:
كلمات ورسائل مفتاحية:
نبرة المحتوى:
ملاحظات مهمة:

القواعد:
- لهجة عربية فصيحة مبسّطة ومهنية، واضحة ومباشرة.
- كل عنوان يتبعه سطر أو نقطتين مختصرة (شرطة "-" لكل نقطة). لا تكتب فقرات طويلة.
- محدّد وقابل للتنفيذ — لا كلام عام ممكن ينطبق على أي حملة.
- استنتج التفاصيل بذكاء من عنوان الحملة والتصنيف والمنصة، ولا تخترع أرقام أسعار أو مواعيد أو أكواد خصم.
- لا تذكر سعر ولا ميزانية ولا عمولة إطلاقًا.
- إجمالي البريف بين 110 و 190 كلمة تقريبًا.
- أخرج نص البريف فقط، بدون عناوين ماركداون ولا رموز نجمية ولا تعليق منك.`;

  const userPrompt = `اكتب البريف الإعلاني لهذي الحملة:
- الشركة: ${brand} (تصنيف: ${industryLabel})
- عنوان الحملة: ${title}
- نوع الحملة: ${typeLabel}
- منصة النشر: ${platformLabel}${note ? `\n- ملاحظات من الشركة: ${note}` : ''}`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 700,
        system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: userPrompt }]
      })
    });
    if (!response.ok) {
      console.error('Anthropic API error:', await response.text());
      return res.status(502).json({ error: 'تعذّر توليد البريف، جرّب مرة ثانية' });
    }
    const data = await response.json();
    const brief = ((data.content && data.content[0] && data.content[0].text) || '').trim();
    if (!brief) return res.status(502).json({ error: 'تعذّر توليد البريف، جرّب مرة ثانية' });
    return res.status(200).json({ ok: true, brief });
  } catch (err) {
    console.error('generate-brief error:', err);
    return res.status(500).json({ error: 'خطأ غير متوقّع، جرّب مرة ثانية' });
  }
}
