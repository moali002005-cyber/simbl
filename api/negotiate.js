// Vercel Serverless Function: /api/negotiate
// هذا الملف يشتغل على خادم Vercel (مو في متصفح المستخدم)
// مفتاح Claude API محفوظ كـ Environment Variable، ما يظهر للعميل

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { campaign, application, history, creatorMessage } = req.body || {};

  if (!campaign || !application) {
    return res.status(400).json({ error: 'Missing campaign or application data' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  const systemPrompt = `أنت "وكيل سيمبل"، وكيل تفاوض ذكي يمثل شركة "${campaign.brand_name || 'الشركة'}" في التفاوض مع مؤثرة بشأن حملة تسويقية.

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
- ردودك قصيرة ومركزة (2-4 أسطر عادةً)
- لا تستخدم الإيموجي إلا نادراً

## قواعد التفاوض:
1. **لا تتجاوز السقف الأقصى أبداً** (${campaign.max_budget} ر.س)
2. ابدأ بترحيب ودي وتلخيص للحملة
3. لو سعر المؤثرة ضمن الميزانية، حاول تحسين الباقة (ستوريز إضافية، تكثيف المحتوى) قبل قبوله مباشرة
4. لو سعرها أعلى من السقف، اعرض السقف بأسلوب محترم وفسر السبب
5. اقترح بدائل خلاقة (تمديد المدة، إضافة منتجات هدية، عمولة على المبيعات)
6. لما تتفقون على نقطة، أكدها بوضوح
7. لما الاتفاق يكتمل، اكتب في نهاية ردك: [DEAL_CLOSED] متبوعاً بالسعر النهائي والشروط

## ابدأ بترحيب ودي وتقديم نفسك كوكيل سيمبل، ثم اقترح نقطة بداية للنقاش.`;

  const messages = [];

  // إضافة الترحيب الأول من الوكيل لو ما فيه تاريخ
  if (!history || history.length === 0) {
    messages.push({
      role: 'user',
      content: 'ابدأ التفاوض. قدم نفسك ورحب بالمؤثرة واقترح نقطة بداية.'
    });
  } else {
    // إضافة التاريخ السابق
    for (const msg of history) {
      messages.push({
        role: msg.from === 'agent' ? 'assistant' : 'user',
        content: msg.text
      });
    }
    // إضافة رسالة المؤثرة الجديدة
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
        model: 'claude-sonnet-4-20250514',
        max_tokens: 500,
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

    // التحقق من إقفال الصفقة
    const dealClosed = agentReply.includes('[DEAL_CLOSED]');
    const cleanReply = agentReply.replace(/\[DEAL_CLOSED\][\s\S]*/, '').trim();
    const dealDetails = dealClosed
      ? agentReply.split('[DEAL_CLOSED]')[1]?.trim() || ''
      : null;

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
