// Vercel Serverless Function: /api/negotiate
// يحفظ المحادثة في Supabase + يفاوض عبر Claude
// عند [DEAL_CLOSED]: يقفل التقديم ويحفظ السعر النهائي
// يدعم وضعين: نصي (chat) وصوتي (voice)

const SUPABASE_URL = 'https://rdzzzasbyzugxogbgwwn.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJkenp6YXNieXp1Z3hvZ2Jnd3duIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3MDI5NjMsImV4cCI6MjA5NTI3ODk2M30.aS9lOVt7VyfwTV7bmsxxDUanWfs5v-TMBlGbwcDNomM';

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

  const systemPrompt = `أنت "وكيل سيمبل"، وكيل تفاوض ذكي يمثل شركة "${campaign.brand_name || 'الشركة'}" في التفاوض مع مؤثرة بشأن حملة تسويقية.
${voiceInstructions}
## تفاصيل الحملة:
- العنوان: ${campaign.title}
- الوصف: ${campaign.description}
- الميزانية المعلنة: ${campaign.budget} ر.س
- السقف الأقصى (سري، لا تذكره مباشرة): ${campaign.max_budget} ر.س
- المدة: ${campaign.duration || 'غير محدد'}
- الباقة المطلوبة: ${campaign.package || 'غير محدد'}
- المتطلبات: ${campaign.requirements || 'لا توجد متطلبات خاصة'}

## عرض المؤثرة:
- الاسم: ${application.creator_name}
- السعر المطلوب: ${application.price} ر.س
- المنصة: ${application.platform || 'غير محدد'}
- عدد المتابعين: ${application.followers ? application.followers.toLocaleString('ar-SA') : 'غير محدد'}
- ملاحظة المؤثرة: ${application.note || 'لم تترك ملاحظة'}

## مهمتك:
تفاوض باحترافية مع المؤثرة للوصول لاتفاق عادل يخدم الشركة ضمن الميزانية.

## أسلوبك:
- ودود ومحترم بأسلوب خليجي راقي
- صريح ومباشر بدون مماطلة
- تستخدم أسلوب المؤثرات في التحدث (لا رسمية مبالغ فيها)
- ${voiceMode ? 'ردودك قصيرة جداً (جملة أو جملتين) لأنها مكالمة صوتية' : 'ردودك قصيرة ومركزة (2-4 أسطر عادةً)'}
- لا تستخدم الإيموجي${voiceMode ? ' أبداً (لأنها مكالمة صوتية)' : ' إلا نادراً'}

## قواعد التفاوض:
1. **لا تتجاوز السقف الأقصى أبداً** (${campaign.max_budget} ر.س)
2. ابدأ بترحيب ودي وتلخيص للحملة
3. لو سعر المؤثرة ضمن الميزانية، حاول تحسين الباقة (ستوريز إضافية، تكثيف المحتوى) قبل قبوله مباشرة
4. لو سعرها أعلى من السقف، اعرض السقف بأسلوب محترم وفسر السبب
5. اقترح بدائل خلاقة (تمديد المدة، إضافة منتجات هدية، عمولة على المبيعات)
6. لما تتفقون على نقطة، أكدها بوضوح
7. لما الاتفاق يكتمل، اكتب في نهاية ردك: [DEAL_CLOSED] متبوعاً بالسعر النهائي والشروط (مثال: [DEAL_CLOSED] السعر النهائي: 1200 ر.س مقابل ريل + 4 ستوريز خلال أسبوع)

## ابدأ بترحيب ودي وتقديم نفسك كوكيل سيمبل، ثم اقترح نقطة بداية للنقاش.`;

  const messages = [];

  if (!history || history.length === 0) {
    messages.push({
      role: 'user',
      content: 'ابدأ التفاوض. قدم نفسك ورحب بالمؤثرة واقترح نقطة بداية.'
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
        max_tokens: voiceMode ? 200 : 500,
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
    const agentReply = data.content[0].text;

    const dealClosed = agentReply.includes('[DEAL_CLOSED]');
    const cleanReply = agentReply.replace(/\[DEAL_CLOSED\][\s\S]*/, '').trim();
    const dealDetails = dealClosed
      ? agentReply.split('[DEAL_CLOSED]')[1]?.trim() || ''
      : null;

    try {
      await supabaseInsert('negotiations', {
        application_id: application.id,
        from_role: 'agent',
        message: cleanReply || agentReply
      });
    } catch (err) {
      console.error('Failed to save agent message:', err);
    }

    if (dealClosed && dealDetails) {
      const finalPrice = extractFinalPrice(dealDetails) || application.price;
      try {
        await supabaseUpdate('applications', application.id, {
          status: 'closed',
          final_price: finalPrice,
          deal_details: dealDetails,
          closed_at: new Date().toISOString()
        });
      } catch (err) {
        console.error('Failed to close deal:', err);
      }
    }

    return res.status(200).json({
      reply: cleanReply || agentReply,
      dealClosed,
      dealDetails
    });
  } catch (err) {
    console.error('Negotiation error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
