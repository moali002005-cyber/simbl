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
  // الميزانية نصّ قد يكون "800 - 1500" أو "50000" أو "50,000" أو "٥٠٠٠٠".
  // نطبّع النص أولاً: أرقام عربية→إنجليزية، ونوحّد الفواصل، ونزيل فواصل الآلاف،
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

  const systemPrompt = `أنت "وكيل سيمبل" — وكيل تفاوض محترف يمثّل شركة "${campaign.brand_name || 'الشركة'}" لإقفال صفقة إعلانية مع المؤثرة بأفضل سعر للشركة.
${voiceInstructions}
## تفاصيل الإعلان:
- العنوان: ${campaign.title}
- الوصف: ${campaign.description}
- المنصة: ${platformLabel} · موعد النشر: ${timingLabel} · المتابعين: ${followerLabel} · المدينة: ${cityLabel} · الدفع: ${paymentLabel}

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
فقرة إنسانية ودّية (٣-٥ أسطر، بدون قوائم/إيموجي): رحّب باسمها، اذكر إن ${campaign.brand_name || 'الشركة'} عندهم حملة ووصف مختصر للمطلوب على ${platformLabel}، موعد النشر (${timingLabel})، المبلغ ${openingOffer} ر.س، ووقت الدفع باختصار، واختم بدعوة لطيفة. مثال للنبرة: "أهلاً ريم، كيفك؟ مجموعة ${campaign.brand_name || 'ريف'} عندهم حملة، فيديو على ${platformLabel} لمنتجهم الجديد. المبلغ ${openingOffer} ريال والدفع بعد إكمال العمل. يشرّفنا تكونين معنا — شرايك؟" لا تذكر السقف الأقصى، فقط ${openingOffer}.

## الإقفال:
لمّا توافق صراحةً على سعر نهائي (أقل من ${finalCap})، أكّد الاتفاق ثم اكتب في آخر ردّك حرفياً:
[DEAL_CLOSED] السعر النهائي: <العدد> ر.س مقابل المحتوى المتفق عليه على ${platformLabel}
لا تخمّن موافقتها، ولا تكتب [DEAL_CLOSED] لو ما اتفقتو فعلاً.`;

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
