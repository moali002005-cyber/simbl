// Vercel Serverless Function: /api/negotiate
// يحفظ المحادثة في Supabase + يفاوض عبر Claude
// عند [DEAL_CLOSED]: يقفل التقديم ويحفظ السعر النهائي
// يدعم وضعين: نصي (chat) وصوتي (voice)
// + يوقف التفاوض تلقائياً لمّا يكتمل عدد المعلنين المطلوب (campaign_size)

const SUPABASE_URL = 'https://rdzzzasbyzugxogbgwwn.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJkenp6YXNieXp1Z3hvZ2Jnd3duIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3MDI5NjMsImV4cCI6MjA5NTI3ODk2M30.aS9lOVt7VyfwTV7bmsxxDUanWfs5v-TMBlGbwcDNomM';

// مفتاح service_role (يُقرأ من متغيّرات Vercel فقط — لا يُكتب في الكود ولا يصل للمتصفّح).
// يتجاوز RLS بأمان لأن هذا كود خادم. نستخدمه لعمليات الكتابة (إقفال الصفقة، حفظ المفاوضات)
// عشان نقدر نشدّد سياسات RLS للمتصفّح بدون ما نكسر عمل الوكيل.
// لو ما كان موجوداً (مثلاً بيئة محلية)، نرجع للـ anon key.
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY;

// ====== خرائط عرض الحقول (للبرومبت) ======
const PLATFORM_LABELS = { tiktok: 'تيك توك', snapchat: 'سناب شات', x: 'إكس', instagram: 'انستقرام', youtube: 'يوتيوب' };
const FOLLOWER_RANGE_LABELS = {
  '20-50k': 'من ٢٠ ألف إلى ٥٠ ألف متابع',
  '50-200k': 'من ٥٠ ألف إلى ٢٠٠ ألف متابع',
  '200-500k': 'من ٢٠٠ ألف إلى ٥٠٠ ألف متابع',
  '500k+': 'أكثر من ٥٠٠ ألف متابع'
};
const PUBLISH_TIMING_LABELS = {
  '24h': 'خلال ٢٤ ساعة (مستعجل)',
  '3d': 'خلال ٣ أيام',
  '1w': 'خلال أسبوع',
  '2w': 'خلال أسبوعين',
  'custom': 'تاريخ محدّد'
};
const CITY_LABELS = { riyadh: 'الرياض', jeddah: 'جدة', dammam: 'الدمام', all: 'كل المناطق' };
function publishTimingTextSrv(c) {
  if (!c) return 'غير محدد';
  if (c.publish_timing === 'custom' && c.publish_date) return 'بتاريخ ' + c.publish_date;
  return PUBLISH_TIMING_LABELS[c.publish_timing] || c.publish_timing || 'غير محدد';
}
function followerRangeTextSrv(c) {
  if (!c || !c.follower_range) return '';
  return String(c.follower_range).split(',').map(s => s.trim()).filter(Boolean)
    .map(v => FOLLOWER_RANGE_LABELS[v] || v).join('، ');
}

async function supabaseInsert(table, data) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    body: JSON.stringify(data)
  });
  if (!res.ok) {
    const err = await res.text();
    console.error('Supabase insert error:', err);
    throw new Error('Failed to insert');
  }
  return res.json();
}

async function supabaseUpdate(table, id, data) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
    method: 'PATCH',
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(data)
  });
  if (!res.ok) {
    const err = await res.text();
    console.error('Supabase update error:', err);
    throw new Error('Failed to update');
  }
  return true;
}

// عدد الصفقات المقفلة لحملة معيّنة (لمعرفة هل اكتمل العدد المطلوب)
async function supabaseCountClosedDeals(campaignId) {
  if (!campaignId) return 0;
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/applications?campaign_id=eq.${campaignId}&status=eq.closed&select=id`,
      {
        headers: {
          'apikey': SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`
        }
      }
    );
    if (!res.ok) {
      console.error('Supabase count error:', await res.text());
      return 0;
    }
    const rows = await res.json();
    return Array.isArray(rows) ? rows.length : 0;
  } catch (err) {
    console.error('Count closed deals failed:', err);
    return 0;
  }
}

// عدد الصفقات العادية المقفلة (غير الاحتياط) — تحدد متى نبدأ الإقفال كاحتياط
async function supabaseCountNonReserveClosed(campaignId) {
  if (!campaignId) return 0;
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/applications?campaign_id=eq.${campaignId}&status=eq.closed&is_reserve=eq.false&select=id`,
      { headers: { 'apikey': SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}` } }
    );
    if (!res.ok) { console.error('count non-reserve error:', await res.text()); return 0; }
    const rows = await res.json();
    return Array.isArray(rows) ? rows.length : 0;
  } catch (err) {
    console.error('Count non-reserve closed failed:', err);
    return 0;
  }
}

// عدد الاحتياط المقفل — لحماية سقف الاحتياط (RESERVE_COUNT)
async function supabaseCountReserveClosed(campaignId) {
  if (!campaignId) return 0;
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/applications?campaign_id=eq.${campaignId}&status=eq.closed&is_reserve=eq.true&select=id`,
      { headers: { 'apikey': SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}` } }
    );
    if (!res.ok) { console.error('count reserve error:', await res.text()); return 0; }
    const rows = await res.json();
    return Array.isArray(rows) ? rows.length : 0;
  } catch (err) {
    console.error('Count reserve closed failed:', err);
    return 0;
  }
}

// جلب طلبات الحملة الحيّة (غير المرفوضة وغير المكتملة) مرتّبة بالأقدم — لتحديد الدفعة وقائمة الانتظار
async function supabaseGetCampaignApps(campaignId) {
  if (!campaignId) return [];
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/applications?campaign_id=eq.${campaignId}&status=not.in.(rejected,campaign_full)&select=id,status,created_at&order=created_at.asc`,
      { headers: { 'apikey': SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}` } }
    );
    if (!res.ok) { console.error('Campaign apps fetch error:', await res.text()); return []; }
    const rows = await res.json();
    return Array.isArray(rows) ? rows : [];
  } catch (err) {
    console.error('Get campaign apps failed:', err);
    return [];
  }
}

// جلب العرض الحقيقي من قاعدة البيانات (للتحقق من وجوده وحالته — حماية من الطلبات الوهمية)
async function supabaseGetApplication(appId) {
  if (!appId) return null;
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/applications?id=eq.${appId}&select=id,campaign_id,status`,
      { headers: { 'apikey': SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}` } }
    );
    if (!res.ok) return null;
    const rows = await res.json();
    return Array.isArray(rows) && rows.length ? rows[0] : null;
  } catch (err) {
    console.error('Get application failed:', err);
    return null;
  }
}

// عدّ رسائل مفاوضة معيّنة خلال نافذة زمنية (حدّ المعدّل ضد الإساءة)
async function supabaseCountRecentMessages(appId, sinceIso) {
  if (!appId) return 0;
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/negotiations?application_id=eq.${appId}&created_at=gte.${encodeURIComponent(sinceIso)}&select=id`,
      { headers: { 'apikey': SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}` } }
    );
    if (!res.ok) return 0;
    const rows = await res.json();
    return Array.isArray(rows) ? rows.length : 0;
  } catch (err) {
    console.error('Count recent messages failed:', err);
    return 0;
  }
}

// تحويل الأرقام العربية/الفارسية إلى إنجليزية (عشان نقدر نقرأها)
function toAsciiDigits(s) {
  const map = { '٠':'0','١':'1','٢':'2','٣':'3','٤':'4','٥':'5','٦':'6','٧':'7','٨':'8','٩':'9',
                '۰':'0','۱':'1','۲':'2','۳':'3','۴':'4','۵':'5','۶':'6','۷':'7','۸':'8','۹':'9' };
  return String(s || '').replace(/[٠-٩۰-۹]/g, d => map[d] || d);
}

function extractFinalPrice(text) {
  // طبّع الأرقام العربية→إنجليزية، وأزل فواصل الآلاف (إنجليزية أو عربية)
  const t = toAsciiDigits(text).replace(/[,،٬]/g, '');
  // يقبل "ر.س" أو "ر س" أو "رس" أو "ريال"
  const match = t.match(/(\d+)\s*(?:ر\.?\s*س|ريال)/);
  if (match) {
    return parseInt(match[1], 10);
  }
  return null;
}

// ============ شبكة أمان الإقفال ============
// كشف موافقة صريحة من المعلن (عشان نقفل تلقائيًا لو الوكيل نسي وسم [DEAL_CLOSED]).
// متحفّظة عمدًا: ترفض أي رسالة فيها استفسار أو استمرار تفاوض أو نفي — عشان ما نقفل بالغلط.
function creatorAcceptedExplicit(text) {
  if (!text) return false;
  const t = toAsciiDigits(String(text)).trim();
  // استفسار أو استمرار تفاوض → مو موافقة نهائية، خلّي الوكيل يكمل
  if (/[؟?]/.test(t)) return false;
  if (/(بس|لكن|زيد|زد|ممكن|لو |إذا|اذا|كم|أكثر|اكثر|نقص|خصم|غير|ثاني|احسب|فكر)/.test(t)) return false;
  // نفي صريح للموافقة → مو موافقة
  if (/(^|[\s،.])(ما|مو|مب|ماني|مهوب|مش|لا)\s+[أاإ]?(موافق|وافق|قبل|أقبل|اقبل)/.test(t)) return false;
  // إشارات موافقة صريحة
  return /(موافقة|موافق|أوافق|اوافق|نوافق|قبلت|أقبل|اقبل|اتفقنا|ماشي|أوكي|اوكي|اوكيه|اوك|زين|تمام|(?:^|\s)تم(?:\s|$)|ok|okay|yes|ايوه|أيوه|(?:^|\s)نعم(?:\s|$))/i.test(t);
}

// آخر سعر عرضه *الوكيل* خلال المحادثة (نقرأ رسائل الوكيل فقط، مو أرقام المعلن).
// نستخدمه كسعر الإقفال في شبكة الأمان — دائمًا ضمن حماية السقف لاحقًا.
function lastAgentOfferedPrice(historyArr, currentAgentReply) {
  const agentTexts = [];
  if (Array.isArray(historyArr)) {
    for (const m of historyArr) {
      if (m && m.from === 'agent' && m.text) agentTexts.push(m.text);
    }
  }
  if (currentAgentReply) agentTexts.push(currentAgentReply);
  let last = null;
  for (const txt of agentTexts) {
    const t = toAsciiDigits(txt).replace(/[,،٬]/g, '');
    const matches = t.match(/(\d{2,6})\s*(?:ر\.?\s*س|ريال)/g) || [];
    if (matches.length) {
      const nums = matches.map(x => parseInt(x.match(/\d+/)[0], 10)).filter(n => n > 0);
      if (nums.length) last = nums[nums.length - 1];
    }
  }
  return last;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { campaign, application, history, creatorMessage, voiceMode } = req.body || {};

  if (!campaign || !application) {
    return res.status(400).json({ error: 'Missing campaign or application data' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  // ============ حماية نقطة الوكيل من الإساءة والتكلفة ============
  // أ) حدّ طول الرسالة (يمنع استهلاك توكنز ضخم / حقن)
  if (creatorMessage && String(creatorMessage).length > 1000) {
    return res.status(400).json({ error: 'Message too long' });
  }
  // ب) تأكّد إن العرض موجود فعلاً وغير مقفل (يمنع نداء الـAI على طلب وهمي أو مقفل)
  const realApp = await supabaseGetApplication(application.id);
  if (!realApp) {
    return res.status(404).json({ error: 'Application not found' });
  }
  if (realApp.status === 'closed') {
    return res.status(200).json({
      reply: 'هذي الصفقة مقفلة بالفعل، ما يصير نكمل تفاوض عليها.',
      dealClosed: false,
      dealDetails: null
    });
  }
  // ج) حدّ المعدّل: لا أكثر من ١٥ رسالة لنفس المفاوضة خلال ٦٠ ثانية (يوقف السبام الآلي)
  const sinceIso = new Date(Date.now() - 60 * 1000).toISOString();
  const recentMsgs = await supabaseCountRecentMessages(application.id, sinceIso);
  if (recentMsgs >= 15) {
    return res.status(429).json({
      error: 'rate_limited',
      reply: 'لحظة من فضلك، الرسائل تنرسل بسرعة. جرّب بعد شوي.',
      dealClosed: false,
      dealDetails: null
    });
  }

  // ============ حساب الأرقام المحدّدة قبل البرومبت ============
  // العرض المبدئي = الميزانية ناقص ٢٠٠ ر.س (أو ٥٠ كحد أدنى)
  // الحد الأقصى للإقفال = الميزانية نفسها (الحدّ المطلق)
  const creatorPrice = parseFloat(application.price) || 0;
  // الميزانية نصّ قد يكون "800 - 1500" أو "50000" أو "50,000" أو "٥٠٠٠٠".
  // نطبّع النص أولاً: أرقام عربية→إنجليزية, ونوحّد الفواصل، ونزيل فواصل الآلاف،
  // عشان ما نقرأ "50.000" أو "50 000" كرقمين (50 و 0).
  function normalizeBudget(raw) {
    let s = String(raw || '');
    // أرقام عربية/فارسية → إنجليزية
    const map = { '٠':'0','١':'1','٢':'2','٣':'3','٤':'4','٥':'5','٦':'6','٧':'7','٨':'8','٩':'9',
                  '۰':'0','۱':'1','۲':'2','۳':'3','۴':'4','۵':'5','۶':'6','۷':'7','۸':'8','۹':'9' };
    s = s.replace(/[٠-٩۰-۹]/g, d => map[d] || d);
    // وحّد فاصل النطاق (إلى/-/–) لمسافة واضحة حول شرطة
    s = s.replace(/\s*(?:الى|إلى|to|–|—|-)\s*/g, ' - ');
    // أزل فواصل الآلاف: فاصلة أو نقطة أو مسافة بين أرقام (50,000 / 50.000 / 50 000 → 50000)
    s = s.replace(/(\d)[,\.\s](?=\d{3}\b)/g, '$1');
    return s;
  }
  const budgetClean = normalizeBudget(campaign.budget);
  // الآن نقرأ الأرقام الصحيحة فقط
  const budgetNums = (budgetClean.match(/\d+/g) || [])
    .map(n => parseInt(n, 10)).filter(n => !isNaN(n) && n > 0);
  const budgetLow = budgetNums.length ? Math.min(...budgetNums) : 0;
  const budgetHigh = budgetNums.length ? Math.max(...budgetNums) : 0;
  const finalCap = budgetHigh;                        // السقف المطلق = أعلى رقم في النطاق
  const openingOffer = Math.max(50, budgetLow - 100); // العرض المبدئي قرب أدنى النطاق

  // ============ حجم الحملة (عدد المعلنين المطلوب) ============
  const campaignId = campaign.id || application.campaign_id;
  const campaignSize = parseInt(campaign.campaign_size) || null;

  // معلومات الحملة (الحقول الجديدة)
  const platformLabel = PLATFORM_LABELS[campaign.platform] || campaign.platform || 'غير محدد';
  const followerLabel = followerRangeTextSrv(campaign) || 'غير محدد';
  const timingLabel = publishTimingTextSrv(campaign);
  // ---- سياق الزيارة (يُطبّق فقط لو campaign_type = visit) ----
  const isVisit = campaign.campaign_type === 'visit';
  const visitWhen = campaign.visit_date
    ? `${campaign.visit_date}${campaign.visit_time_from ? ' من ' + campaign.visit_time_from : ''}${campaign.visit_time_to ? ' إلى ' + campaign.visit_time_to : ''}`
    : 'يُحدَّد داخل المنصة';
  const timingDesc = isVisit ? `موعد الزيارة: ${visitWhen}` : `موعد النشر: ${timingLabel}`;
  const visitLocLine = (isVisit && campaign.visit_location) ? `\n- موقع الزيارة: ${campaign.visit_location}` : '';
  const executionReassure = isVisit
    ? 'كل تفاصيل الزيارة (الموقع والموعد) بتظهر لك خطوة بخطوة داخل المنصة بعد الاتفاق، ما تحتاجين تسوين شي الحين.'
    : 'كل تفاصيل الشحن والتنفيذ بتظهر لك خطوة بخطوة داخل المنصة بعد الاتفاق، ما تحتاجين تسوين شي الحين.';
  const cityLabel = CITY_LABELS[campaign.city] || campaign.city || 'غير محدد';
  const payMin = parseInt(campaign.payment_min_days) || null;
  const payMax = parseInt(campaign.payment_max_days) || null;
  const paymentLabel = (payMin && payMax)
    ? `بعد إكمال العمل، خلال ${payMin} إلى ${payMax} يوم`
    : (payMax ? `بعد إكمال العمل، خلال ${payMax} يوم` : 'بعد إكمال العمل حسب اتفاق الشركة');

  if (creatorMessage) {
    try {
      await supabaseInsert('negotiations', {
        application_id: application.id,
        from_role: 'creator',
        message: creatorMessage
      });
    } catch (err) {
      console.error('Failed to save creator message:', err);
    }
  }

  // ============ نظام الدفعة + قائمة الانتظار (مع احتياط ثابت = 10) ============
  // الوكيل يفاوض أول (campaignSize + RESERVE_COUNT) حسب أولوية التقديم (الأقدم أولاً).
  // أول (campaignSize) مقفولين = صفقات عادية تظهر للشركة.
  // الـ (RESERVE_COUNT) المقفولين بعدهم = احتياط مخفي (is_reserve=true) جاهز للترقية الفورية.
  // من تعدّى (campaignSize + RESERVE_COUNT) → قائمة انتظار (waitlisted).
  const RESERVE_COUNT = campaignSize || 10;   // = حجم الحملة → يضاعف البنك الدافئ (يمتصّ الرفض العالي)
  if (campaignSize) {
    const batchSize = campaignSize + RESERVE_COUNT; // النطاق الكامل اللي يفاوضه الوكيل
    // المقفلون يحجزون أماكنهم دائمًا (أيًّا كانوا). المتبقّي = النطاق − عدد المقفلين.
    // نملأ المتبقّي من أقدم غير المقفلين (قيد التفاوض/الانتظار)، والباقي قائمة انتظار.
    const liveApps = await supabaseGetCampaignApps(campaignId); // غير مرفوض/مكتمل، الأقدم أولاً
    const closedCount = liveApps.filter(a => a.status === 'closed').length;
    const remainingSlots = batchSize - closedCount;
    const candidates = liveApps.filter(a => a.status !== 'closed'); // pending/active/waitlisted بالأقدم
    const myPos = candidates.findIndex(a => a.id === application.id) + 1; // 1-based (0 = غير موجود)
    const inBatch = remainingSlots > 0 && myPos > 0 && myPos <= remainingSlots;

    if (!inBatch) {
      // خارج الدفعة → قائمة الانتظار
      if (realApp.status !== 'waitlisted') {
        try { await supabaseUpdate('applications', application.id, { status: 'waitlisted' }); }
        catch (e) { console.error('waitlist mark failed:', e); }
      }
      // مهم: لا نحفظ رسالة الانتظار في جدول negotiations — نرجّعها كرد لحظي فقط.
      // السبب: campaign.html يفتح التفاوض تلقائيًا *فقط لو السجل فاضٍ*. لو خزّنّا رسالة
      // الانتظار، يبقى السجل غير فاضٍ، فلما يترقّى المعلن لاحقًا لا يُفتح له تفاوض جديد
      // (يعلق على رسالة الانتظار القديمة). بإبقاء السجل فاضيًا، ينفتح التفاوض صح بعد الترقية.
      const waitMsg = 'شكراً لاهتمامك بالحملة! العدد المطلوب اكتمل حالياً، وأنت في قائمة الانتظار حسب أولوية تقديمك. إذا انفتح مكان بننبّهك فورًا ونبدأ التفاوض معك 🌿';
      return res.status(200).json({
        reply: waitMsg,
        dealClosed: false,
        dealDetails: null,
        waitlisted: true
      });
    }

    // داخل الدفعة: لو كان في الانتظار وانفتح له مكان، رقّه ليُفاوَض
    if (realApp.status === 'waitlisted') {
      try { await supabaseUpdate('applications', application.id, { status: 'pending' }); }
      catch (e) { console.error('promote failed:', e); }
    }
  }

  // تعليمات خاصة بالوضع الصوتي
  const voiceInstructions = voiceMode ? `

## ⚠️ مهم جداً - أنت الآن في مكالمة صوتية:
- المؤثرة تتحدث معك بالصوت، وكلامك راح يتحول لصوت تسمعه.
- تكلم بشكل طبيعي وعفوي زي مكالمة هاتفية حقيقية.
- **ردودك قصيرة جداً** (جملة إلى جملتين بحد أقصى) - عشان سهلة السمع.
- لا تستخدم نقاط أو قوائم أو رموز - كلام متواصل طبيعي فقط.
- لا تقل أبداً إنك "وكيل نصي" أو إنك "ما تقدر تتكلم بالصوت" - أنت في مكالمة صوتية طبيعية.
- تجنب الأرقام الطويلة المعقدة، قل "ثمانمية ريال" بدل التفاصيل الكثيرة.
- كن ودود وطبيعي، استخدم لهجة خليجية بسيطة.
` : '';

  const systemPrompt = `أنت "وكيل سيمبل" — وكيل تفاوض محترف يمثّل شركة "${campaign.brand_name || 'الشركة'}" لإقفال صفقة إعلانية مع المؤثرة بأفضل سعر للشركة.
${voiceInstructions}
## تفاصيل الإعلان:
- العنوان: ${campaign.title}
- الوصف: ${campaign.description}
- المنصة: ${platformLabel} · ${timingDesc} · المتابعين: ${followerLabel} · المدينة: ${cityLabel} · الدفع: ${paymentLabel}${visitLocLine}

## عرض المؤثرة:
- الاسم: ${application.creator_name} · المنصة: ${application.platform || 'غير محدد'} · المتابعين: ${application.followers ? application.followers.toLocaleString('ar-SA') : 'غير محدد'}
- ملاحظتها: ${application.note || 'لا يوجد'}

## الأرقام (حرفياً):
- عرضك المبدئي = ${openingOffer} ر.س.
- السقف المطلق = ${finalCap} ر.س. ممنوع تتجاوزه ولا بريال، ولا تذكره كرقم (قل "حدود ميزانيتنا"). اقفل دائماً *تحته* لا عنده.

## القاعدة الذهبية:
عرضك التالي لازم يكون **≤ آخر رقم طلبته المؤثرة**، وأبداً ما يتجاوز ${finalCap}.
- طلبت أقل من ${finalCap} → اعرض رقمها أو أقل بشوي (مو الميزانية الكاملة).
- طلبت ${finalCap} أو أكثر → اعرض ${finalCap} كحدّ نهائي.
- قالت "زيد ١٠٠ بس" → +١٠٠ بالضبط، مو أكثر. لا ترفع أكثر مما طلبت أبداً.

## الاستراتيجية:
1. ابدأ بـ${openingOffer} واثبت عليه ٣-٥ جولات مع الإقناع (قيمة المنتج، الاعتراف بقيمتها بدون رفع السعر). لا ترفع تلقائياً ولا تنازلات صغيرة عشوائية.
2. لو طرحت رقماً، طبّق القاعدة الذهبية.
3. لو رفضت ${finalCap} بعد ٣-٤ محاولات إقناع، أنهِ بأدب بدون [DEAL_CLOSED]: "حاولنا نلقى نقطة وسط بس ما توفّقنا هذي المرة، مشكورة على وقتك ونتمنى لك التوفيق."

## ممنوعات صارمة:
- نطاق العمل محصور: محتوى على ${platformLabel} حسب الوصف فقط. ارفض بلطف أي إضافات (ستوريات/منشورات/منصات أخرى) حتى لو مجانية.
- لا مزايا شخصية إطلاقاً: لا أكواد خصم، لا منتجات مجانية، لا عمولة. كل المؤثرين سواء.

## مهمتك محصورة بالسعر فقط (مهم جداً):
أنت تفاوض على **السعر فقط**. كل ما يخص الشحن، التواصل، تفاصيل المنتج، تسليم المحتوى، والتنفيذ — **يتم داخل المنصة تلقائياً عبر خطوات منظّمة بعد الاتفاق**.
- ❌ لا تسأل أبداً عن "طريقة التواصل" أو "كيف نوصل لك المنتج" أو "تفاصيل الشحن" أو "معلوماتك".
- ❌ لا ترتّب أي شي خارج السعر. ما فيه تواصل خارج المنصة.
- ✅ لو سألت المؤثرة عن الشحن/التواصل/التنفيذ، طمئنها باختصار: "${executionReassure}"
- بمجرد الاتفاق على السعر، مهمتك خلصت — اقفل الصفقة فوراً ولا تفتح مواضيع جديدة.

## مقاومة الضغط (لا ترفع السعر مهما كان):
اعترف بشعورها ثم اثبت. أمثلة للنبرة (نوّع، لا تكرّر حرفياً):
- "محتاجة الفلوس/تعبت" → "أقدّر وضعك، بس الميزانية محدّدة من الشركة."
- "بنسحب" → "أحترم قرارك، وهذا أقصى عرض نقدر عليه."
- "غيركم دفع أكثر" → "كل حملة وميزانيتها، وعرضنا حسب هذي الحملة."
- إصرار متكرر → كرّر عرضك النهائي بهدوء.

## الأسلوب:
- شخص محترف ودود: متعاطف، حازم بهدوء، بدون تذلّل ولا تعالٍ ولا مواجهة ولا فكاهة ولا تعليق على نواياها.
- لهجة خليجية بسيطة مهذّبة. سطر-سطرين كحد أقصى لكل رد. بدون قوائم/نقاط/إيموجي. بادل الكلام ولا تكدّس.
- اعترف بنقطتها قبل ردّك ("كلامك صح..."، "أتفهّمك...") ونوّع صياغتك. تعامل معها كشخص: استعمل اسمها وأعطها فرصة تشرح. تأقلم مع جنسها من الاسم.
- استعمل "شرايك" (مو "شو/ايش/ما رأيك") و"وش اسمك".

## الرسالة الأولى فقط:
فقرة إنسانية ودّية (٣-٥ أسطر، بدون قوائم/إيموجي): رحّب باسمها، اذكر إن ${campaign.brand_name || 'الشركة'} عندهم حملة ووصف مختصر للمطلوب على ${platformLabel}، ${isVisit ? `موعد الزيارة (${visitWhen})` : `موعد النشر (${timingLabel})`}، المبلغ ${openingOffer} ر.س، ووقت الدفع باختصار، واختم بدعوة لطيفة. مثال للنبرة: "أهلاً ريم، كيفك؟ مجموعة ${campaign.brand_name || 'ريف'} عندهم حملة، فيديو على ${platformLabel} لمنتجهم الجديد. المبلغ ${openingOffer} ريال والدفع بعد إكمال العمل. يشرّفنا تكونين معنا — شرايك؟" لا تذكر السقف الأقصى، فقط ${openingOffer}.

## الإقفال:
أول ما توافق المؤثرة صراحةً (مثل "موافق"، "تمام"، "أوكي"، "ماشي") على سعر أقل من أو يساوي ${finalCap}: **اقفل فوراً في نفس الرد**. لا تسأل أسئلة إضافية، لا تطلب تأكيد ثاني، لا تفتح مواضيع شحن/تواصل/تنفيذ. فقط اشكرها بسطر، وأكّد المبلغ، ثم اكتب في آخر ردّك حرفياً:
[DEAL_CLOSED] السعر النهائي: <العدد> ر.س مقابل المحتوى المتفق عليه على ${platformLabel}
- "موافق" على مبلغ مطروح = اتفاق صريح → اقفل فوراً.
- لا تخمّن موافقتها، ولا تكتب [DEAL_CLOSED] لو ما اتفقتو فعلاً على رقم.`;

  const messages = [];

  if (!history || history.length === 0) {
    messages.push({
      role: 'user',
      content: 'ابدأ التفاوض. هذي أول رسالة: رحّب بالمعلن باسمه بطريقة إنسانية ودّية، واشرح له العرض ضمن كلام طبيعي متصل (الحملة والمطلوب، موعد النشر، المبلغ المعروض، ووقت الدفع باختصار)، واختم بدعوة لطيفة للانضمام. فقرة قصيرة بدون قوائم ولا نقاط ولا إيموجي.'
    });
  } else {
    for (const msg of history) {
      messages.push({
        role: msg.from === 'agent' ? 'assistant' : 'user',
        content: msg.text
      });
    }
    if (creatorMessage) {
      messages.push({
        role: 'user',
        content: creatorMessage
      });
    }
  }

  const isFirstMessage = !history || history.length === 0;

  // ============ اختيار الموديل الذكي (توفير التكلفة) ============
  // الردود العادية (الترحيب + المفاوضة) → Haiku: أرخص ٣ مرّات وأسرع، كافٍ تمامًا
  //   لأن الأسعار والاستراتيجية محسوبة بالكود فوق، الموديل يصيغ الكلام فقط.
  // لحظة الإقفال (المعلن يبان موافق في رسالته الأخيرة) → Sonnet: الأقوى، عشان
  //   يقفل الصفقة بدقّة ودفء ويصدر [DEAL_CLOSED] صح في أهم لحظة.
  const ACCEPT_SIGNALS = /(موافق|موافقة|اتفقنا|قبلت|أقبل|اقبل|أوكي|اوكي|اوك|ماشي|تمام)/;
  const isClosingMoment = !!(creatorMessage && ACCEPT_SIGNALS.test(creatorMessage));
  const chosenModel = isClosingMoment ? 'claude-sonnet-4-5' : 'claude-haiku-4-5-20251001';

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: chosenModel,
        max_tokens: voiceMode ? 200 : (isFirstMessage ? 450 : 280),
        system: [
          { type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }
        ],
        messages: messages
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Anthropic API error:', errText);
      return res.status(500).json({ error: 'Failed to get response from AI' });
    }

    const data = await response.json();
    let agentReply = data.content[0].text;

    // ============ استبدال صيغ لهجوية تلقائياً ============
    const phraseReplacements = [
      [/شو\s+رأيك/g, 'شرايك'],
      [/شو\s+رايك/g, 'شرايك'],
      [/إيش\s+رأيك/g, 'شرايك'],
      [/ايش\s+رأيك/g, 'شرايك'],
      [/إيش\s+رايك/g, 'شرايك'],
      [/ايش\s+رايك/g, 'شرايك'],
      [/ما\s+رأيك/g, 'شرايك'],
      [/ما\s+رايك/g, 'شرايك']
    ];
    phraseReplacements.forEach(([pattern, replacement]) => {
      agentReply = agentReply.replace(pattern, replacement);
    });

    let dealClosed = agentReply.includes('[DEAL_CLOSED]');
    const cleanReply = agentReply.replace(/\[DEAL_CLOSED\][\s\S]*/, '').trim();
    let dealDetails = dealClosed
      ? agentReply.split('[DEAL_CLOSED]')[1]?.trim() || ''
      : null;

    // ============ شبكة أمان الإقفال ============
    // لو المعلن وافق صراحةً والوكيل *نسي* وسم [DEAL_CLOSED]، نقفل تلقائيًا
    // بآخر سعر عرضه الوكيل. تمر بعدها بحماية السقف وحجم الحملة زي الإقفال العادي.
    let closedBySafetyNet = false;
    if (!dealClosed && creatorMessage && creatorAcceptedExplicit(creatorMessage)) {
      const offered = lastAgentOfferedPrice(history, cleanReply || agentReply);
      if (offered && (!finalCap || offered <= finalCap)) {
        dealClosed = true;
        closedBySafetyNet = true;
        dealDetails = `السعر النهائي: ${offered} ر.س مقابل المحتوى المتفق عليه (إقفال تلقائي بعد تأكيد موافقة المعلن).`;
        console.warn(`Safety-net close for app ${application.id} at ${offered} (agent missed [DEAL_CLOSED]).`);
      } else {
        console.warn(`Safety-net: creator accepted but no valid agent price found (offered=${offered}, cap=${finalCap}). App ${application.id}. No auto-close.`);
      }
    }

    // حماية إضافية: لو السعر النهائي تجاوز السقف، ألغِ الإقفال
    let safeDealClosed = dealClosed;
    let safeDealDetails = dealDetails;
    if (dealClosed && dealDetails) {
      const finalPrice = extractFinalPrice(dealDetails);
      if (finalPrice && finalCap && finalPrice > finalCap) {
        console.warn(`Agent attempted to close above cap: ${finalPrice} > ${finalCap}. Blocking.`);
        safeDealClosed = false;
        safeDealDetails = null;
      }
    }

    // ============ تحديد: صفقة عادية أم احتياط؟ ============
    // لو عدد الصفقات العادية المقفلة (غير الاحتياط) وصل campaignSize، فهذا المقفول = احتياط.
    // الاحتياط مقفول لكن مخفي عن الشركة (is_reserve=true)، جاهز للترقية الفورية عند نقص.
    let closeAsReserve = false;
    if (safeDealClosed && campaignSize) {
      const closedNonReserve = await supabaseCountNonReserveClosed(campaignId);
      if (closedNonReserve >= campaignSize) {
        closeAsReserve = true; // الصفقات العادية اكتملت → هذا احتياط
        // حماية سقف الاحتياط: لا نقفل أكثر من RESERVE_COUNT احتياطي
        const reserveClosed = await supabaseCountReserveClosed(campaignId);
        if (reserveClosed >= RESERVE_COUNT) {
          console.warn(`Campaign ${campaignId}: reserve full (${reserveClosed}/${RESERVE_COUNT}). Blocking extra close.`);
          safeDealClosed = false;
          safeDealDetails = null;
        }
      }
    }

    // فحص الأرقام المذكورة في رسالة الوكيل (تنبيه للمراجعة) — يدعم الأرقام العربية
    const replyForCheck = toAsciiDigits(cleanReply || agentReply);
    const priceMatches = replyForCheck.match(/(\d{2,5})\s*(?:ر\.?\s*س|ريال)/g) || [];
    priceMatches.forEach(m => {
      const num = parseInt(m.match(/\d+/)[0]);
      if (num > finalCap) {
        console.warn(`⚠️ Agent mentioned price ${num} which is ABOVE cap ${finalCap}. App: ${application.id}`);
      }
    });

    // ============ الرسالة النهائية المعروضة للمعلن ============
    let replyToSend = cleanReply || agentReply;

    // عند الإقفال: أضف تأكيد المبلغ + إعلام مناسب (صفقة عادية أو احتياط) بشكل حتمي.
    if (safeDealClosed && safeDealDetails) {
      const closedPrice = extractFinalPrice(safeDealDetails) || application.price;
      const approvalNote = closeAsReserve
        ? `تم الاتفاق على ${closedPrice} ريال 🎉 أنت الآن ضمن قائمة الاحتياط الجاهزة لهذي الحملة — لو انفتح مكان بنرقّيك فورًا للتعميد بلا أي خطوات إضافية. نشكر تعاونك 🌿`
        : `تم الاتفاق على ${closedPrice} ريال 🎉 صفقتك الآن بانتظار تعميد الشركة، وبنخبرك أول ما تُعتمد ونكمل باقي الخطوات معك 🌿`;
      // لو أقفلنا عبر شبكة الأمان، رد الوكيل ممكن يكون خارج الموضوع → نستبدله بتأكيد واضح.
      replyToSend = closedBySafetyNet ? approvalNote : `${replyToSend}\n\n${approvalNote}`;
    }

    try {
      await supabaseInsert('negotiations', {
        application_id: application.id,
        from_role: 'agent',
        message: replyToSend
      });
    } catch (err) {
      console.error('Failed to save agent message:', err);
    }

    if (safeDealClosed && safeDealDetails) {
      const finalPrice = extractFinalPrice(safeDealDetails) || application.price;
      try {
        await supabaseUpdate('applications', application.id, {
          status: 'closed',
          final_price: finalPrice,
          deal_details: safeDealDetails,
          closed_at: new Date().toISOString(),
          is_reserve: closeAsReserve // احتياط أم صفقة عادية
        });
      } catch (err) {
        console.error('Failed to close deal:', err);
      }
    }

    return res.status(200).json({
      reply: replyToSend,
      dealClosed: safeDealClosed,
      dealDetails: safeDealDetails
    });
  } catch (err) {
    console.error('Negotiation error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
