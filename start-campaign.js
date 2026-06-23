// Vercel Serverless Function: /api/start-campaign
// تستقبل سلّة الشركة (مؤثرين + شروط كل واحد) وتُنشئ لكل مؤثر:
//   حملة مباشرة (مخفية من تصفّح المعلنين عبر is_direct) + طلب تفاوض + إشعار للمؤثر.
// تعمل بمفتاح service_role (خادم فقط) عشان تتجاوز RLS بأمان وتقرأ سعر المؤثر السري.
// لا تشغّل الوكيل هنا — رسالة الافتتاح تتولّد تلقائياً أول ما يفتح المعلن المحادثة (مثل التدفّق الحالي).

const SUPABASE_URL = 'https://rdzzzasbyzugxogbgwwn.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJkenp6YXNieXp1Z3hvZ2Jnd3duIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3MDI5NjMsImV4cCI6MjA5NTI3ODk2M30.aS9lOVt7VyfwTV7bmsxxDUanWfs5v-TMBlGbwcDNomM';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY;

function headers() {
  return {
    'apikey': SUPABASE_SERVICE_KEY,
    'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json'
  };
}

async function sbGet(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: headers() });
  if (!res.ok) { console.error('sbGet error:', await res.text()); throw new Error('GET failed'); }
  return res.json();
}

async function sbInsert(table, data) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: { ...headers(), 'Prefer': 'return=representation' },
    body: JSON.stringify(data)
  });
  if (!res.ok) { console.error(`sbInsert ${table} error:`, await res.text()); throw new Error('INSERT failed'); }
  return res.json();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { brandId, items } = req.body || {};
  if (!brandId || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'بيانات ناقصة' });
  }
  if (items.length > 50) {
    return res.status(400).json({ error: 'الحد الأقصى ٥٠ مؤثر في المرة' });
  }

  // تحقق إن المرسِل شركة فعلاً
  let brand;
  try {
    const brands = await sbGet(`users?id=eq.${brandId}&select=id,role,company_name,industry,is_test`);
    brand = brands && brands[0];
  } catch (e) {
    return res.status(500).json({ error: 'تعذّر التحقق من الحساب' });
  }
  if (!brand || brand.role !== 'brand') {
    return res.status(403).json({ error: 'غير مصرّح' });
  }

  let created = 0;
  const results = [];

  for (const it of items) {
    const creatorId = it && it.creatorId;
    try {
      const ceiling = parseInt(String((it && it.budget) || '').replace(/[^\d]/g, ''), 10);
      if (!creatorId || !ceiling || ceiling <= 0) {
        results.push({ creatorId, ok: false, reason: 'ميزانية غير صحيحة' });
        continue;
      }
      const timing = (it.timing) || '1w';
      const date = it.date || null;
      const brief = String(it.brief || '').slice(0, 1000);

      // اجلب المؤثر (السعر السري + المنصة) عبر مفتاح الخدمة
      const crs = await sbGet(`users?id=eq.${creatorId}&select=id,name,platform,followers,price,is_test,role`);
      const cr = crs && crs[0];
      if (!cr || cr.role !== 'creator') {
        results.push({ creatorId, ok: false, reason: 'مؤثر غير موجود' });
        continue;
      }

      // الميزانية المُدخلة = السقف. نعطي الوكيل مجالاً يفتح أقل (≈٧٠٪) ويقفل تحت السقف.
      const low = Math.max(50, Math.round(ceiling * 0.7));
      const budgetRange = (low < ceiling) ? (low + ' - ' + ceiling) : String(ceiling);

      // حملة مباشرة (is_direct = مخفية من تصفّح المعلنين، يراها المدعو فقط عبر طلبه)
      const campRows = await sbInsert('campaigns', {
        title: 'حملة ' + (brand.company_name || 'الشركة'),
        description: brief || 'حملة إعلانية',
        brand_industry: brand.industry || null,
        budget: budgetRange,
        publish_timing: timing,
        publish_date: date,
        platform: cr.platform || null,
        follower_range: null,
        campaign_size: 1,
        city: null,
        payment_min_days: 7,
        payment_max_days: 30,
        tags: brand.industry ? [brand.industry] : [],
        brand_id: brandId,
        status: 'active',
        is_direct: true,
        is_test: !!brand.is_test
      });
      const camp = campRows && campRows[0];
      if (!camp || !camp.id) {
        results.push({ creatorId, ok: false, reason: 'تعذّر إنشاء الحملة' });
        continue;
      }

      // طلب التفاوض (نفس شكل تقديم المعلن: السعر سقف مبدئي يحدّده الوكيل)
      await sbInsert('applications', {
        campaign_id: camp.id,
        creator_id: creatorId,
        price: ceiling,
        note: brief || null,
        status: 'pending'
      });

      // إشعار المؤثر بالدعوة
      await sbInsert('notifications', {
        user_id: creatorId,
        type: 'new_campaign',
        title: 'عرض حملة جديد من ' + (brand.company_name || 'شركة'),
        message: brief ? brief.slice(0, 120) : 'لديك دعوة للتفاوض على حملة',
        link: '/creator.html'
      });

      created++;
      results.push({ creatorId, ok: true, campaignId: camp.id });
    } catch (e) {
      console.error('start-campaign item error:', e);
      results.push({ creatorId, ok: false, reason: 'خطأ غير متوقّع' });
    }
  }

  return res.status(200).json({ created, total: items.length, results });
}
