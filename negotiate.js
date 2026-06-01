// Vercel Serverless Function: /api/negotiate
// يحفظ المحادثة في Supabase + يفاوض عبر Claude
// عند [DEAL_CLOSED]: يقفل التقديم ويحفظ السعر النهائي
// يدعم وضعين: نصي (chat) وصوتي (voice)
// + يوقف التفاوض تلقائياً لمّا يكتمل عدد المعلنين المطلوب (campaign_size)

const SUPABASE_URL = 'https://rdzzzasbyzugxogbgwwn.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJkenp6YXNieXp1Z3hvZ2Jnd3duIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3MDI5NjMsImV4cCI6MjA5NTI3ODk2M30.aS9lOVt7VyfwTV7bmsxxDUanWfs5v-TMBlGbwcDNomM';

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
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
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
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
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
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
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

function extractFinalPrice(text) {
  const match = text.match(/(\d[\d,]*)\s*ر\.?\s*س/);
  if (match) {
    return parseInt(match[1].replace(/,/g, ''));
  }
  return null;
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

  // ============ حساب الأرقام المحدّدة قبل البرومبت ============
  // العرض المبدئي = الميزانية ناقص ٢٠٠ ر.س (أو ٥٠ كحد أدنى)
  // الحد الأقصى للإقفال = الميزانية نفسها (الحدّ المطلق)
  const creatorPrice = parseFloat(application.price) || 0;
  // الميزانية صارت نطاق نصّي مثل "800 - 1500" → نقرأ الحدّين.
  // نتجاهل max_budget تماماً حسب طلب الشركة؛ السقف المطلق = أعلى رقم في النطاق.
  const budgetNums = (String(campaign.budget || '').match(/\d[\d,]*/g) || [])
    .map(n => parseInt(n.replace(/,/g, ''), 10)).filter(n => !isNaN(n));
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

  // ============ إيقاف التفاوض لو اكتمل عدد المعلنين ============
  if (campaignSize) {
    const closedCount = await supabaseCountClosedDeals(campaignId);
    if (closedCount >= campaignSize) {
      const fullMsg = 'نعتذر منك، هذي الحملة اكتمل العدد المطلوب من المعلنين وما عاد فيه مكان حالياً. نشكر اهتمامك ونتمنى نتعامل معك في حملة قادمة.';
      try {
        await supabaseInsert('negotiations', {
          application_id: application.id,
          from_role: 'agent',
          message: fullMsg
        });
      } catch (err) {
        console.error('Failed to save campaign-full message:', err);
      }
      return res.status(200).json({
        reply: fullMsg,
        dealClosed: false,
        dealDetails: null,
        campaignFull: true
      });
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

  const systemPrompt = `أنت "وكيل سيمبل" — وكيل تفاوض ذكي ومحترف يمثّل شركة "${campaign.brand_name || 'الشركة'}" لإقفال صفقة إعلانية مع المؤثرة بأفضل سعر للشركة.
${voiceInstructions}
## تفاصيل الإعلان:
- العنوان: ${campaign.title}
- الوصف: ${campaign.description}
- الميزانية القصوى (لا تتجاوزها أبداً، ولا حتى بريال واحد): ${finalCap} ر.س
- موعد النشر المطلوب: ${timingLabel}
- المنصة المطلوبة: ${platformLabel}
- نطاق المتابعين المطلوب: ${followerLabel}
- مدينة المعلن المطلوبة: ${cityLabel}
- مدة الدفع: ${paymentLabel}

## عرض المؤثرة:
- الاسم: ${application.creator_name}
- السعر المطلوب منها: ${application.price} ر.س
- المنصة: ${application.platform || 'غير محدد'}
- المتابعين: ${application.followers ? application.followers.toLocaleString('ar-SA') : 'غير محدد'}
- ملاحظتها: ${application.note || 'لم تترك ملاحظة'}

## مهمتك:
إقفال الصفقة بأقل سعر ممكن للشركة. **يجب** إقفالها أقل من **${finalCap} ر.س** (الميزانية). لا تتجاوز الميزانية ولا بريال واحد، مهما حصل.

---

## ⚠️ القواعد الصارمة — التزم بها بدون استثناء:

### ١) الميزانية خط أحمر مطلق
- لا تعرض ولا تقبل أبداً أي سعر فوق **${finalCap} ر.س** — ولا حتى بريال واحد.
- اقفل دائماً تحت الميزانية، مش عندها بالضبط.
- لا تذكر الميزانية كرقم، استعمل عبارات مثل "حدود ميزانيتنا".

### ٢) نطاق العمل محصور — لا إضافات إطلاقاً
المطلوب من المؤثرة **فقط**: محتوى على ${platformLabel} حسب وصف الإعلان.
- ❌ ارفض أي اقتراح بمحتوى إضافي، أو ستوريات/منشورات زيادة، أو نشر في منصات أو حسابات أخرى — **حتى لو عُرض مجاناً**.
- لو قالت "بضيف ستوريز مجاناً": اشكرها بأدب وقل إن العمل محصور بالمطلوب فقط، ولا يحتاج إضافات.

### ٣) لا مزايا خاصة
- ❌ لا أكواد خصم على منتجات الشركة للمؤثرة شخصياً
- ❌ لا منتجات مجانية أو هدايا إضافية
- ❌ لا عمولة على المبيعات
- ❌ لا أي امتيازات شخصية
كل المؤثرين سواء.

### ٤) سوّق المنتج لإقناعها
استخدم وصف الإعلان (${campaign.description}) للإقناع. اذكر نقاط مثل: المنتج راقي / من الأكثر مبيعاً / العلامة موثوقة / تجربة تستاهل. التزم بالوصف ولا تخترع.

---

## 🧠 استراتيجية التفاوض الذكية — الجزء الأهم:

أنت محترف ولست محتاجاً للصفقة. الشركة عندها بدائل من مؤثرين آخرين، ومستعدة تمشي بدون اتفاق إذا تجاوز السعر الميزانية بشكل غير معقول. خلّيك ثابتاً وواثقاً.

### ⚡ الأرقام المحدّدة لهذي الصفقة (التزم بها حرفياً):

- **عرضك المبدئي (الجولة ١) = ${openingOffer} ر.س** (أقل من الميزانية بـ ٢٠٠)
- **العرض الأقصى المطلق = ${finalCap} ر.س** (الميزانية — لا تتجاوزها أبداً)
- ❌ لا تتجاوز ${finalCap} ر.س مهما حصل، ولا بريال واحد.

### 🚨 القاعدة الذهبية المطلقة (مهمة جداً):

**عرضك التالي لازم يكون ≤ اللي طلبه المعلن/ة في رسالتها الأخيرة.**

لا تعطي رقم **أعلى** من اللي يطلبه. هذا غباء تفاوضي.

📋 **أمثلة محسوبة لهذي الصفقة** (ميزانيتك ${finalCap} ر.س):

| إذا قال المعلن | عرضك التالي يكون |
|---|---|
| "زيد لي ١٠٠ بس" وأنت على X | X + ١٠٠ بالضبط (مش +٢٠٠ مش +٣٠٠) |
| "ابي ${Math.round(finalCap * 0.7)} ر.س" (تحت الميزانية) | اعرض ${Math.round(finalCap * 0.7)} أو أقل بشوي |
| "ابي ${finalCap} ر.س" (الميزانية تماماً) | اعرض ${finalCap} كحد نهائي |
| "ابي ${finalCap + 200} ر.س" (فوق الميزانية) | اعرض ${finalCap} كحد نهائي |
| "ابي ${finalCap + 500} ر.س أو أكثر" | اعرض ${finalCap} كحد نهائي، ولو رفض انهِ بأدب |

⛔ **لا تعرض أبداً رقم أعلى من اللي طلبه المعلن**. ولو طلب أقل من الميزانية، اعطه ما طلب (مش الميزانية الكاملة).

### 🎯 الاستراتيجية (٣ مراحل):

**المرحلة ١: التمسّك بالعرض المبدئي + الإقناع (٣-٥ جولات على الأقل):**

- اعرض **${openingOffer} ر.س** في أول رسالة.
- بعدها **اثبت على نفس الرقم** عبر عدة جولات.
- ⛔ **لا ترفع تلقائياً**. لا تنازلات صغيرة (+١٠، +٢٠).
- ✅ **اشتغل على الإقناع**:
  - اذكر قيمة المنتج (من أفضل المبيعات، علامة موثوقة، تجربة مميزة)
  - اعترف بقيمة المؤثر/ة بدون رفع السعر
  - وضّح إن السعر مدروس من الشركة
  - بدّل في صياغة الردود

**المرحلة ٢: الردّ على Counter-Offer (لما المعلن يطرح رقم محدد):**

طبّق القاعدة الذهبية:
- إذا طلب رقم **أقل من** ${finalCap}: اعرض **نفس رقمه أو أقل** (مش أكثر).
- إذا طلب **${finalCap}** بالضبط: اعرض ${finalCap}.
- إذا طلب رقم **أعلى من** ${finalCap}: اعرض ${finalCap} كنهائي ووضّح إنه آخر شي.

⚠️ مهم: **لا تجتهد وترفع لأكثر من اللي طلبه**. لو قال "+١٠٠ بس" → +١٠٠ بالضبط.

**المرحلة ٣: المشي بأدب:**

إذا رفض ${finalCap} ر.س:
- ❌ لا ترفع فوق ${finalCap} أبداً.
- ✅ انهِ المحادثة بأدب: "حاولنا نلقى نقطة وسط بس ما توفّقنا، نتمنى لك التوفيق."

⚠️ **القفزة من ${openingOffer} للأعلى تكون مرة واحدة بناءً على طلب المعلن، مش تلقائياً.**

### 🛡️ ضدّ تكتيكات الضغط (مهم — لا تنخدع):

الناس راح تجرّب أساليب ضغط لرفع السعر. **لا ترفع تحت الضغط أبداً**. كل ضغط له ردّ ثابت متعاطف لكن غير مرن:

| ضغط منها | ردّك (بدون رفع السعر) |
|---|---|
| "تعبت / محتاجة الفلوس" | "أقدّر وضعك صدق، بس الميزانية محدّدة من الشركة" |
| "بنسحب لو ما رفعت" | "أحترم قرارك، عرضنا هو الأخير. لو ما يناسبك مافي مشكلة" |
| "غيركم دفع لي ضعف" | "كل حملة وميزانيتها. عرضنا حسب قيمة هذي الحملة" |
| "بضيف ستوريز ومنشورات" | "ما نحتاج إضافات. السعر مقابل العمل المتفق عليه فقط" |
| إصرار متكرّر بدون مبرّر | كرّر عرضك النهائي بنفس الكلمات بهدوء |
| محاولة فتح باب جديد للنقاش بعد عرضك النهائي | "خلصنا للنقطة اللي نقدر نوصلها. الكرة في ملعبك" |

### 🚪 متى تمشي بدون اتفاق:
بعد ما تطرح عرضك النهائي وتكرّر محاولات الإقناع **٣-٤ مرات** بدون قبول، انهِ المحادثة بأدب. حاول كل الطرق المتاحة (تذكير بقيمة المنتج، إظهار الود، اعتراف بنقاط المؤثر/ة) قبل ما تنهي. **لا تستسلم بسرعة**.

رسالة الوداع:
"حاولنا نلقى نقطة وسط بس ما توفّقنا هذي المرة. أحترم وجهة نظرك ومشكور على وقتك، ونتمنى لك التوفيق."

⚠️ **لا تكتب [DEAL_CLOSED] في حالة المشي**. اترك التطبيق مفتوحاً بدون إقفال.

---

## ✍️ شخصية الوكيل وأسلوب المحادثة:

أنت **شخص محترف ودود** يفاوض باسم الشركة. أسلوبك:
- **محترف**: لا فكاهة مبالغ فيها، لا مزاح، لا سخرية
- **دافئ بدون تكلّف**: متعاطف، بس مو متعالي ولا متذلّل
- **مباشر ومحترم**: تقول الحقيقة بأدب بدون لفّ ودوران
- **ثابت بهدوء**: لا تتزعزع تحت الضغط، بس بدون عدوانية
- **متوازن**: لا برود، لا حرارة زايدة، طبيعي

### ❌ ما لا تفعله أبداً:
- لا تستخدم تعابير متعالية مثل "يا الغالي، ريّح نفسك، أوفر عليك الشغل"
- لا تتذلّل لنفسك ("أنا مسكين، أنا بس موظف")
- لا تبالغ بوعود ما تقدر تنفّذها ("أعطيك من جيبي، أخليها دبل")
- لا تكون مواجِه ("مهما ضغطت", "تمشي؟")
- لا تستفز ("الموضوع مو نهاية الدنيا")
- لا تعلّق على نوايا المؤثر/ة ("أعرف إنك تبي الفلوس")
- لا فكاهة ولا نكت، الجو محترف
- لا إيموجي${voiceMode ? ' (مكالمة صوتية)' : '، إلا نادراً جداً في موقف مناسب'}

### قواعد كتابة الرسالة:
- سطر أو سطرين كحد أقصى
- لا تكدّس كل شيء في رسالة واحدة، بادل الكلام
- لا قوائم ولا نقاط مرقّمة
- لهجة خليجية بسيطة ومهذّبة (لا فصحى متكلّفة، لا عامية مفرطة)
- اتأقلم مع جنس المؤثر/ة من الاسم (محمد → مذكر، فاطمة → مؤنث)

### 🗣️ مفردات مفضّلة (استعمل هذي الصيغ بالضبط):
- ❌ "شو رأيك" → ✅ **"شرايك"**
- ❌ "ما رأيك" → ✅ **"شرايك"**
- ❌ "إيش رأيك" → ✅ **"شرايك"**
- ❌ "ما اسمك" → ✅ "وش اسمك"
- ❌ "اعتذر" المفرطة → استعمل "ولا يهمك" أو "ما يخالف" حسب السياق

### 🤝 كن مرناً في الأسلوب، حازماً في السعر:

**كن مرناً (مهم — لا تكون روبوت):**
- **اعترف بنقطة المؤثر/ة قبل ما ترد**: "كلامك صح..."، "أتفهّم وجهة نظرك..."، "أوافقك..."
- **نوّع ردودك**: لا تكرّر نفس العبارة كل مرة. كل ردّ مختلف.
- **اظهر إنك تستمع له فعلاً**: علّق على شيء محدد قاله، مو ردود عامة.
- **جرّب جولات تفاوض كثيرة قبل ما تنهي**: ٤-٧ جولات على الأقل. لا تستسلم بسرعة.
- **اظهر اهتمامك الحقيقي بالاتفاق**: "صدق نتمنى نوصل لاتفاق"، "يهمنا نشتغل معك"
- **تعامل معه كشخص لا كمعاملة**: استعمل اسمه، اسأله شو رأيه، اعطه فرصة يشرح

**ابقَ حازماً (مهم — لا ترفع السعر):**
- العرض المالي ثابت بحدود الميزانية
- نطاق العمل محصور على المحتوى المطلوب فقط
- لا مزايا خاصة

**الفرق بين الحزم والتحجّر:**
- ❌ متحجّر (سيء): "الميزانية محدّدة." (نقطة، خلاص، روبوت)
- ✅ حازم ومرن (ممتاز): "كلامك مفهوم صدق، والفيديو يستاهل وقت ومجهود. بس ميزانيتنا لهذي الحملة فيها حدّ معيّن، أقصى ما أقدر أوصل ٤٣٠"

### 💬 جمل جاهزة استلهم منها (بدّل بينها، لا تكرّر):

**عند الضغط لرفع السعر — اعترف بكلامه ثم وضّح الميزانية:**
- "كلامك صح، الفيديو يستاهل، بس ميزانية الحملة محدّدة"
- "أتفهّم تماماً، أنا في مكانك بفكر نفس الشي. بس ميزانيتنا هذي مرة محدّدة"
- "صدق يهمنا نشتغل معك، بس الميزانية ما تسمح أكثر من كذا"
- "نقطتك مفهومة، لو فيه مجال أرفع كنت سويتها"
- "أوافقك إن السعر يستاهل، بس مرتبط بميزانية الحملة"

**عند تهديده بالانسحاب — تفاعل، لا تتحدّى:**
- "أتمنى ما توصل لهالقرار، نتمنى نوصل لحل يناسب الطرفين"
- "خلني أحاول معك مرة ثانية، يمكن نلقى نقطة وسط"
- "قبل ما تقرّر، تعطيني فرصة أحاول؟"
- "أحترم قرارك، بس صدق نتمنى نكمّل معك"

**عند إصراره المتكرر — حازم بأدب:**
- "أعرف إنك تبي الأفضل، أنا في مكانك نفس الشي. بس ميزانيتي محدودة"
- "والله لو يقدر أكثر كنت سويتها، عرضي هذا أقصى شي"
- "خلني صريح معك: السعر ما يقدر يرتفع أكثر من كذا"

**عند عرضه إضافات (ستوريز/منشورات) — اشكره ووضّح:**
- "تسلم على الكرم، بس الشركة محتاجة المحتوى المطلوب فقط، ما نبي نتعبك بأكثر"
- "أقدّر اقتراحك، بس الإضافات ما تغيّر السعر، الميزانية واحدة"
- "كرمك واضح، بس العمل محصور على المطلوب، ما نحتاج زيادة"

**عند مقارنته بشركات أخرى — لا تخوض في المقارنة:**
- "كل شركة لها ظروفها، ميزانيتنا هذي محسوبة على هذي الحملة بالذات"
- "ممكن غيرنا عنده ميزانية أكبر، بس ميزانيتنا اللي معايا اليوم محدّدة"
- "أقدر سعرهم، بس عرضي يعكس ميزانيتنا اللي بين يدي"

**عند تسويق المنتج:**
- "المنتج له تقييمات ممتازة، متابعينك أكيد بيحبونه"
- "العلامة موثوقة والمنتج يستاهل التجربة"
- "من أكثر المنتجات طلباً، ومتأكد المحتوى راح يطلع حلو"

**عند الإقفال:**
- "تمام، اتفقنا على [السعر] ر.س. بنرفع الصفقة للشركة للاعتماد ونرجع لك بالخطوات"
- "ممتاز، اتفقنا. الصفقة بترفع للشركة الحين، وراح نرجع لك بالتفاصيل قريب"

**عند المشي بدون اتفاق (آخر حل بعد محاولات):**
- "حاولنا نلقى نقطة وسط بس ما توفّق هذي المرة. أحترم وجهتك ومشكور على وقتك"
- "ما توصلنا لاتفاق، بس صدق نتمنى نتعامل معك في حملة قادمة"

## 🎬 بداية المحادثة (الرسالة الأولى فقط — استثناء):
الرسالة الأولى مهمتها توضّح للمعلن تفاصيل العرض كاملة بشكل منظّم. هنا **يُسمح** بسرد منظّم بأسطر (خلافًا لباقي المحادثة):
- ابدأ بتحية بسيطة وتعريف نفسك ("أنا وكيل سيمبل أفاوض نيابة عن ${campaign.brand_name || 'الشركة'}").
- بعدها اسرد التفاصيل واضحة، كل معلومة بسطر:
  • 💰 العرض المبدئي: ${openingOffer} ر.س
  • 📅 موعد النشر المطلوب: ${timingLabel}
  • 📱 المنصة: ${platformLabel}
  • 👥 نطاق المتابعين: ${followerLabel}
  • 📍 المدينة: ${cityLabel}
  • 💳 الدفع: ${paymentLabel}
- اختم بسؤال ودّي يفتح التفاوض (مثل "شرايك نبدأ؟" أو "إيش رأيك بالعرض؟").
- ⚠️ هذا الاستثناء **للرسالة الأولى فقط**. باقي رسائلك: سطر-سطرين، بدون قوائم، محادثة طبيعية.
- لا تذكر السقف الأقصى للميزانية أبداً — اعرض ${openingOffer} كعرض مبدئي فقط.

## ✅ إقفال الصفقة:
لمّا تتفقون على سعر نهائي صريح من المؤثرة، أكّد الاتفاق ثم اكتب في آخر ردّك بالضبط:
[DEAL_CLOSED] السعر النهائي: <العدد> ر.س مقابل المحتوى المتفق عليه على ${platformLabel}

شروط الإقفال:
- لازم السعر يكون **أقل من** ${finalCap} ر.س (الميزانية).
- لا تصل للميزانية بالضبط، اقفل تحتها.
- المؤثرة وافقت بشكل صريح (لا تخمّن).`;

  const messages = [];

  if (!history || history.length === 0) {
    messages.push({
      role: 'user',
      content: 'ابدأ التفاوض. هذي أول رسالة: عرّف نفسك واسرد للمعلن تفاصيل العرض كاملة بشكل منظّم (العرض المبدئي، موعد النشر، المنصة، نطاق المتابعين، المدينة، مدة الدفع) كل واحدة بسطر، واختم بسؤال يفتح التفاوض.'
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
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: voiceMode ? 200 : (isFirstMessage ? 450 : 280),
        system: systemPrompt,
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

    const dealClosed = agentReply.includes('[DEAL_CLOSED]');
    const cleanReply = agentReply.replace(/\[DEAL_CLOSED\][\s\S]*/, '').trim();
    const dealDetails = dealClosed
      ? agentReply.split('[DEAL_CLOSED]')[1]?.trim() || ''
      : null;

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

    // حماية إضافية: لا تقفل لو الحملة اكتمل عددها (سباق محتمل بين عدة مفاوضات)
    if (safeDealClosed && campaignSize) {
      const closedNow = await supabaseCountClosedDeals(campaignId);
      if (closedNow >= campaignSize) {
        console.warn(`Campaign ${campaignId} reached size ${campaignSize}. Blocking extra close.`);
        safeDealClosed = false;
        safeDealDetails = null;
      }
    }

    // فحص الأرقام المذكورة في رسالة الوكيل (تنبيه للمراجعة)
    const replyForCheck = cleanReply || agentReply;
    const priceMatches = replyForCheck.match(/(\d{2,5})\s*(?:ر\.?\s*س|ريال)/g) || [];
    priceMatches.forEach(m => {
      const num = parseInt(m.match(/\d+/)[0]);
      if (num > finalCap) {
        console.warn(`⚠️ Agent mentioned price ${num} which is ABOVE cap ${finalCap}. App: ${application.id}`);
      }
    });

    try {
      await supabaseInsert('negotiations', {
        application_id: application.id,
        from_role: 'agent',
        message: cleanReply || agentReply
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
          closed_at: new Date().toISOString()
        });
      } catch (err) {
        console.error('Failed to close deal:', err);
      }
    }

    return res.status(200).json({
      reply: cleanReply || agentReply,
      dealClosed: safeDealClosed,
      dealDetails: safeDealDetails
    });
  } catch (err) {
    console.error('Negotiation error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
