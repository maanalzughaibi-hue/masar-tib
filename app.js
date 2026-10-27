/* =====================================================================
   مَسار طِب — يرافق الطبيب من تقييم الحالة إلى العلاج والمتابعة
   ---------------------------------------------------------------------
   الملف مقسم إلى أجزاء:
   1) الإعداد والاتصال بقاعدة البيانات (Supabase أو الوضع التجريبي)
   2) أدوات مساعدة
   3) طبقة البيانات (db) وطبقة المصادقة (auth)
   4) النماذج (حقول كل نوع سجل)
   5) الصفحات: الدخول، الرئيسية، المرضى، ملف المريض، المتابعات
   6) الأزرار والأحداث، والتقرير المطبوع، والبيانات التجريبية
   ===================================================================== */
(() => {
'use strict';

/* ============ 1) الإعداد والاتصال ============ */
const cfg = window.MASAR_CONFIG || {};
const CLOUD = Boolean(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && window.supabase && window.supabase.createClient);
const sb = CLOUD ? window.supabase.createClient(cfg.SUPABASE_URL.trim(), cfg.SUPABASE_ANON_KEY.trim()) : null;
const TABLES = ['patients', 'assessments', 'diagnoses', 'treatments', 'followups'];
const state = { user: null, ctx: null, records: {}, tabs: {}, fuFilter: 'upcoming', pQuery: '', pStage: '' };
const app = document.getElementById('app');
const modalRoot = document.getElementById('modal-root');
const toastRoot = document.getElementById('toast-root');

/* ============ 2) أدوات مساعدة ============ */
const $ = (s, r = document) => r.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => ymd(new Date());
const addDays = n => { const d = new Date(); d.setDate(d.getDate() + n); return ymd(d); };
const toDate = s => (String(s).length <= 10 ? new Date(s + 'T00:00:00') : new Date(s));
const LOCALE = 'ar-SA-u-ca-gregory-nu-latn';
const fmtDate = s => s ? toDate(s).toLocaleDateString(LOCALE, { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
const monthShort = d => d.toLocaleDateString(LOCALE, { month: 'short' });
const dayDiff = s => Math.round((toDate(s) - toDate(today())) / 864e5);
const dateOnly = s => (s ? String(s).slice(0, 10) : '');
const opts = obj => Object.entries(obj);
const genFileNo = () => 'MT-' + Math.floor(10000 + Math.random() * 90000);
function age(b) {
  if (!b) return null;
  const d = toDate(b), n = new Date();
  let a = n.getFullYear() - d.getFullYear();
  const m = n.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && n.getDate() < d.getDate())) a--;
  return a >= 0 ? a : null;
}
function initials(name) {
  const parts = String(name || '؟').trim().split(/\s+/);
  return (parts[0][0] || '') + (parts[1] ? parts[1][0] : '');
}
function relDay(s) {
  const n = dayDiff(s);
  if (n === 0) return 'اليوم';
  if (n === 1) return 'غداً';
  if (n === -1) return 'أمس';
  return n > 1 ? `بعد ${n} أيام` : `منذ ${-n} أيام`;
}
function msg(e) {
  const m = (e && (e.message || e.error_description)) || String(e);
  const map = [
    [/Invalid login credentials/i, 'البريد الإلكتروني أو كلمة المرور غير صحيحة'],
    [/already registered|already been registered/i, 'هذا البريد مسجل مسبقاً، سجّل الدخول بدلاً من ذلك'],
    [/Email not confirmed/i, 'لم يتم تأكيد البريد الإلكتروني بعد. افتح رسالة التأكيد في بريدك'],
    [/Password should be at least/i, 'كلمة المرور يجب أن تكون 6 أحرف على الأقل'],
    [/Failed to fetch|NetworkError|Load failed/i, 'تعذر الاتصال بالخادم. تأكد من الإنترنت ومن إعدادات Supabase في config.js'],
    [/does not exist|Could not find the table|schema cache/i, 'جداول قاعدة البيانات غير موجودة. شغّل ملف schema.sql في Supabase أولاً'],
    [/row-level security/i, 'ليست لديك صلاحية لهذا الإجراء (سياسات الأمان RLS)'],
    [/rate limit/i, 'محاولات كثيرة، انتظر قليلاً ثم حاول مرة أخرى'],
    [/Invalid API key|JWT/i, 'مفتاح Supabase غير صحيح. راجع config.js']
  ];
  for (const [r, t] of map) if (r.test(m)) return t;
  return m;
}

/* أيقونات SVG */
const ICON = {
  pulse: '<svg viewBox="0 0 24 24"><path d="M3 12h4l2.5-6 5 12 2.5-6h4"/></svg>',
  home: '<svg viewBox="0 0 24 24"><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>',
  users: '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14.6c2.6.1 4.7 1.8 5.5 4.9"/></svg>',
  cal: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
  out: '<svg viewBox="0 0 24 24"><path d="M9 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h4M14 8l4 4-4 4M18 12H8"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  edit: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>',
  print: '<svg viewBox="0 0 24 24"><path d="M7 9V3h10v6M7 17H4v-7h16v7h-3M7 14h10v7H7z"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="M5 12l5 5 9-10"/></svg>',
  x: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>',
  back: '<svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>',
  alert: '<svg viewBox="0 0 24 24"><path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.5"/></svg>',
  arrow: '<svg viewBox="0 0 24 24"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>',
  lock: '<svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
  folder: '<svg viewBox="0 0 24 24"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
  steth: '<svg viewBox="0 0 24 24"><path d="M6 3v6a4 4 0 0 0 8 0V3M10 13v2a5 5 0 0 0 10 0v-2"/><circle cx="20" cy="11" r="2"/></svg>',
  reopen: '<svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 1 0 3-6.2M4 4v4h4"/></svg>'
};
const LOGO = `<span class="logo">${ICON.pulse}</span>`;

/* القيم والتسميات */
const L = {
  gender: { male: 'ذكر', female: 'أنثى' },
  severity: { low: 'منخفضة', medium: 'متوسطة', high: 'عالية', critical: 'حرجة' },
  dxType: { primary: 'رئيسي', secondary: 'ثانوي' },
  dxStatus: { suspected: 'مشتبه به', confirmed: 'مؤكد', resolved: 'تم الشفاء' },
  txStatus: { active: 'جارٍ', completed: 'مكتمل', stopped: 'موقوف' },
  route: { oral: 'عن طريق الفم', iv: 'وريدي', im: 'عضلي', sc: 'تحت الجلد', topical: 'موضعي', inhaled: 'استنشاق', other: 'أخرى' },
  fuType: { clinic: 'زيارة عيادة', phone: 'اتصال هاتفي', lab: 'تحاليل مخبرية', imaging: 'أشعة' },
  fuStatus: { scheduled: 'مجدولة', done: 'تمت', missed: 'لم يحضر', cancelled: 'ملغاة' },
  pStatus: { active: 'نشطة', closed: 'مغلقة' },
  blood: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']
};
const TONE = {
  severity: { low: 'ok', medium: 'warn', high: 'danger', critical: 'crit' },
  dxStatus: { suspected: 'warn', confirmed: 'teal', resolved: 'ok' },
  txStatus: { active: 'teal', completed: 'ok', stopped: '' },
  fuStatus: { scheduled: 'info', done: 'ok', missed: 'danger', cancelled: '' },
  stage: { new: '', assessment: 'info', diagnosis: 'violet', treatment: 'warn', followup: 'teal', closed: '' }
};
const STAGES = [['assessment', 'التقييم', 'assessments'], ['diagnosis', 'التشخيص', 'diagnoses'], ['treatment', 'العلاج', 'treatments'], ['followup', 'المتابعة', 'followups']];
const STAGE_LABEL = { new: 'جديد', assessment: 'التقييم', diagnosis: 'التشخيص', treatment: 'العلاج', followup: 'المتابعة', closed: 'مغلقة' };
const badge = (text, tone = '') => `<span class="badge ${tone}">${esc(text)}</span>`;

/* ============ 3) طبقة البيانات ============ */
// الوضع التجريبي: تخزين في المتصفح (localStorage) مع بديل في الذاكرة
const mem = { data: null, user: null };
const Local = {
  KEY: 'masar_tib_db_v1', UKEY: 'masar_tib_user_v1',
  read() {
    if (mem.data) return mem.data;
    let d = null;
    try { d = JSON.parse(localStorage.getItem(this.KEY)); } catch (e) { /* تجاهل */ }
    if (!d || typeof d !== 'object') d = {};
    TABLES.forEach(t => { if (!Array.isArray(d[t])) d[t] = []; });
    mem.data = d;
    return d;
  },
  write() { try { localStorage.setItem(this.KEY, JSON.stringify(mem.data)); } catch (e) { /* تجاهل */ } }
};

const db = {
  async list(table, eq = {}) {
    if (CLOUD) {
      let q = sb.from(table).select('*');
      for (const [k, v] of Object.entries(eq)) q = q.eq(k, v);
      const { data, error } = await q.order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    }
    return Local.read()[table]
      .filter(r => r.doctor_id === state.user.id && Object.entries(eq).every(([k, v]) => r[k] === v))
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  },
  async get(table, id) {
    if (CLOUD) {
      const { data, error } = await sb.from(table).select('*').eq('id', id).maybeSingle();
      if (error) throw error;
      return data;
    }
    return Local.read()[table].find(r => r.id === id && r.doctor_id === state.user.id) || null;
  },
  async insert(table, obj) {
    if (CLOUD) {
      const { data, error } = await sb.from(table).insert(obj).select().single();
      if (error) throw error;
      return data;
    }
    const row = { id: uid(), doctor_id: state.user.id, created_at: new Date().toISOString(), ...obj };
    Local.read()[table].push(row);
    Local.write();
    return row;
  },
  async update(table, id, obj) {
    if (CLOUD) {
      const { data, error } = await sb.from(table).update(obj).eq('id', id).select().single();
      if (error) throw error;
      return data;
    }
    const row = Local.read()[table].find(r => r.id === id);
    if (!row) throw new Error('السجل غير موجود');
    Object.assign(row, obj);
    Local.write();
    return row;
  },
  async remove(table, id) {
    if (CLOUD) {
      const { error } = await sb.from(table).delete().eq('id', id);
      if (error) throw error;
      return;
    }
    const d = Local.read();
    d[table] = d[table].filter(r => r.id !== id);
    if (table === 'patients') TABLES.slice(1).forEach(t => { d[t] = d[t].filter(r => r.patient_id !== id); });
    if (table === 'assessments') d.diagnoses.forEach(r => { if (r.assessment_id === id) r.assessment_id = null; });
    if (table === 'diagnoses') d.treatments.forEach(r => { if (r.diagnosis_id === id) r.diagnosis_id = null; });
    Local.write();
  }
};

const auth = {
  async current() {
    if (CLOUD) {
      const { data } = await sb.auth.getSession();
      const u = data && data.session && data.session.user;
      return u ? { id: u.id, email: u.email, name: (u.user_metadata && u.user_metadata.full_name) || u.email.split('@')[0] } : null;
    }
    try { const s = localStorage.getItem(Local.UKEY); return s ? JSON.parse(s) : mem.user; } catch (e) { return mem.user; }
  },
  saveLocal(u) { mem.user = u; try { localStorage.setItem(Local.UKEY, JSON.stringify(u)); } catch (e) { /* تجاهل */ } return u; },
  async signIn(email, password) {
    if (CLOUD) {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
      return this.current();
    }
    return this.saveLocal({ id: 'local-doctor', email, name: email.split('@')[0] });
  },
  async signUp(name, email, password) {
    if (CLOUD) {
      const { data, error } = await sb.auth.signUp({ email, password, options: { data: { full_name: name } } });
      if (error) throw error;
      if (!data.session) return { needsConfirm: true };
      return this.current();
    }
    return this.saveLocal({ id: 'local-doctor', email, name });
  },
  async signOut() {
    if (CLOUD) await sb.auth.signOut();
    mem.user = null;
    try { localStorage.removeItem(Local.UKEY); } catch (e) { /* تجاهل */ }
  }
};

async function loadAll() {
  const res = await Promise.all(TABLES.map(t => db.list(t)));
  return Object.fromEntries(TABLES.map((t, i) => [t, res[i]]));
}
function stageOf(p, all) {
  if (p.status === 'closed') return 'closed';
  const has = t => all[t].some(r => r.patient_id === p.id);
  if (has('followups')) return 'followup';
  if (has('treatments')) return 'treatment';
  if (has('diagnoses')) return 'diagnosis';
  if (has('assessments')) return 'assessment';
  return 'new';
}

/* العلامات الحيوية وقيمها الطبيعية */
const bmi = a => (a.weight && a.height) ? Math.round((a.weight / Math.pow(a.height / 100, 2)) * 10) / 10 : null;
const VITALS = [
  ['ضغط الدم', 'mmHg', a => (a.bp_sys != null && a.bp_dia != null) ? `${a.bp_sys}/${a.bp_dia}` : (a.bp_sys != null ? a.bp_sys : null), a => a.bp_sys >= 140 || a.bp_dia >= 90 || (a.bp_sys != null && a.bp_sys < 90)],
  ['النبض', 'ن/د', a => a.heart_rate, a => a.heart_rate > 100 || (a.heart_rate != null && a.heart_rate < 50)],
  ['الحرارة', '°C', a => a.temperature, a => a.temperature >= 38 || (a.temperature != null && a.temperature < 35.5)],
  ['تشبع الأكسجين', '%', a => a.spo2, a => a.spo2 != null && a.spo2 < 94],
  ['التنفس', '/د', a => a.resp_rate, a => a.resp_rate > 20 || (a.resp_rate != null && a.resp_rate < 12)],
  ['الوزن', 'كجم', a => a.weight, () => false],
  ['الطول', 'سم', a => a.height, () => false],
  ['مؤشر كتلة الجسم', '', a => bmi(a), a => { const b = bmi(a); return b != null && (b >= 30 || b < 18.5); }]
];
const abnormalCount = a => VITALS.filter(v => v[2](a) != null && v[3](a)).length;

/* ============ 4) النماذج ============ */
const patientFields = () => [
  { section: 'البيانات الأساسية' },
  { name: 'full_name', label: 'اسم المريض الكامل', required: true, full: true, ph: 'مثال: محمد عبدالله السبيعي' },
  { name: 'file_no', label: 'رقم الملف', ltr: true, def: genFileNo },
  { name: 'gender', label: 'الجنس', type: 'select', options: opts(L.gender), required: true },
  { name: 'birth_date', label: 'تاريخ الميلاد', type: 'date', maxDate: true },
  { name: 'phone', label: 'رقم الجوال', type: 'tel', ltr: true, ph: '05xxxxxxxx' },
  { section: 'المعلومات الطبية' },
  { name: 'blood_type', label: 'فصيلة الدم', type: 'select', options: L.blood.map(b => [b, b]) },
  { name: 'allergies', label: 'الحساسية', type: 'textarea', full: true, ph: 'مثال: البنسلين، المكسرات — اتركه فارغاً إن لم توجد' },
  { name: 'chronic_conditions', label: 'الأمراض المزمنة', type: 'textarea', full: true, ph: 'افصل بينها بفاصلة، مثال: سكري، ارتفاع ضغط الدم' }
];
const assessmentFields = () => [
  { section: 'الزيارة والشكوى' },
  { name: 'visit_date', label: 'تاريخ الزيارة', type: 'date', required: true, def: today, maxDate: true },
  { name: 'severity', label: 'درجة الخطورة', type: 'select', options: opts(L.severity), required: true },
  { name: 'chief_complaint', label: 'الشكوى الرئيسية', required: true, full: true, ph: 'مثال: ألم في الصدر منذ يومين' },
  { name: 'symptoms', label: 'الأعراض والتاريخ المرضي', type: 'textarea', full: true },
  { section: 'العلامات الحيوية' },
  { name: 'bp_sys', label: 'الضغط الانقباضي', type: 'number', int: true, min: 50, max: 260, unit: 'mmHg', q: true },
  { name: 'bp_dia', label: 'الضغط الانبساطي', type: 'number', int: true, min: 30, max: 160, unit: 'mmHg', q: true },
  { name: 'heart_rate', label: 'النبض', type: 'number', int: true, min: 20, max: 250, unit: 'نبضة/د', q: true },
  { name: 'temperature', label: 'الحرارة', type: 'number', step: '0.1', min: 30, max: 45, unit: '°C', q: true },
  { name: 'spo2', label: 'تشبع الأكسجين', type: 'number', int: true, min: 50, max: 100, unit: '%', q: true },
  { name: 'resp_rate', label: 'معدل التنفس', type: 'number', int: true, min: 5, max: 70, unit: '/د', q: true },
  { name: 'weight', label: 'الوزن', type: 'number', step: '0.1', min: 1, max: 400, unit: 'كجم', q: true },
  { name: 'height', label: 'الطول', type: 'number', step: '0.1', min: 30, max: 250, unit: 'سم', q: true },
  { section: 'الفحص السريري' },
  { name: 'exam_notes', label: 'ملاحظات الفحص', type: 'textarea', full: true }
];
const diagnosisFields = ctx => [
  { name: 'title', label: 'التشخيص', required: true, full: true, ph: 'مثال: التهاب رئوي مكتسب من المجتمع' },
  { name: 'icd_code', label: 'رمز ICD-10', ltr: true, ph: 'J18.9' },
  { name: 'assessment_id', label: 'مرتبط بالتقييم', type: 'select', options: ((ctx && ctx.as) || []).map(a => [a.id, `${fmtDate(a.visit_date)} — ${a.chief_complaint}`]) },
  { name: 'type', label: 'نوع التشخيص', type: 'select', options: opts(L.dxType), required: true, def: 'primary' },
  { name: 'status', label: 'حالة التشخيص', type: 'select', options: opts(L.dxStatus), required: true, def: 'confirmed' },
  { name: 'notes', label: 'ملاحظات', type: 'textarea', full: true }
];
const treatmentFields = ctx => [
  ...(ctx && ctx.p && ctx.p.allergies ? [{ note: `تنبيه: المريض لديه حساسية من: ${ctx.p.allergies}` }] : []),
  { name: 'medication', label: 'الدواء أو الإجراء العلاجي', required: true, full: true, ph: 'مثال: أموكسيسيلين' },
  { name: 'dose', label: 'الجرعة', ph: 'مثال: 500 ملغ' },
  { name: 'route', label: 'طريقة الإعطاء', type: 'select', options: opts(L.route), def: 'oral' },
  { name: 'frequency', label: 'التكرار', ph: 'مثال: 3 مرات يومياً' },
  { name: 'duration', label: 'المدة', ph: 'مثال: 7 أيام' },
  { name: 'start_date', label: 'تاريخ البدء', type: 'date', def: today },
  { name: 'status', label: 'حالة العلاج', type: 'select', options: opts(L.txStatus), required: true, def: 'active' },
  { name: 'diagnosis_id', label: 'لعلاج التشخيص', type: 'select', full: true, options: ((ctx && ctx.dx) || []).map(d => [d.id, d.title]) },
  { name: 'instructions', label: 'تعليمات للمريض', type: 'textarea', full: true, ph: 'مثال: يؤخذ بعد الأكل، مع شرب كميات كافية من الماء' }
];
const followupFields = () => [
  { name: 'scheduled_date', label: 'موعد المتابعة', type: 'date', required: true, def: () => addDays(7) },
  { name: 'type', label: 'نوع المتابعة', type: 'select', options: opts(L.fuType), required: true, def: 'clinic', q: true },
  { name: 'status', label: 'الحالة', type: 'select', options: opts(L.fuStatus), required: true, def: 'scheduled', q: true },
  { name: 'reason', label: 'سبب المتابعة', full: true, ph: 'مثال: تقييم الاستجابة للعلاج' },
  { name: 'outcome', label: 'نتيجة المتابعة', type: 'textarea', full: true, ph: 'تُعبأ بعد إتمام المتابعة' }
];
// فحص بسيط للتعارض بين الدواء وحساسية المريض
function allergyCheck(v, ctx) {
  const al = ctx && ctx.p && ctx.p.allergies;
  if (!al || !v.medication) return true;
  const norm = s => String(s).toLowerCase().replace(/[إأآ]/g, 'ا').replace(/^ال/, '');
  const words = al.split(/[،,؛;\s]+/).map(norm).filter(w => w.length >= 3);
  const med = norm(v.medication);
  const hit = words.find(w => med.includes(w) || w.includes(med));
  if (!hit) return true;
  return confirm(`تحذير: الدواء "${v.medication}" قد يتعارض مع حساسية المريض (${al}).\nهل تريد الحفظ على أي حال؟`);
}
const KINDS = {
  assessments: { one: 'التقييم', addTitle: 'تقييم جديد للحالة', addLabel: 'حفظ التقييم', added: 'تم حفظ التقييم', fields: assessmentFields },
  diagnoses: { one: 'التشخيص', addTitle: 'إضافة تشخيص', addLabel: 'حفظ التشخيص', added: 'تم حفظ التشخيص', fields: diagnosisFields },
  treatments: { one: 'العلاج', addTitle: 'إضافة علاج', addLabel: 'حفظ العلاج', added: 'تمت إضافة العلاج', fields: treatmentFields, check: allergyCheck },
  followups: { one: 'المتابعة', addTitle: 'جدولة متابعة', addLabel: 'جدولة المتابعة', added: 'تمت جدولة المتابعة', fields: followupFields }
};

function fieldHtml(f, v) {
  if (f.section) return `<div class="form-section">${esc(f.section)}</div>`;
  if (f.note) return `<div class="alert danger">${ICON.alert}<span>${esc(f.note)}</span></div>`;
  const id = 'f_' + f.name;
  const val = v ?? '';
  const ph = f.ph ? ` placeholder="${esc(f.ph)}"` : '';
  const dir = (f.ltr || f.type === 'number') ? ' dir="ltr"' : '';
  let input;
  if (f.type === 'select') {
    input = `<select id="${id}" name="${f.name}"><option value="">— اختر —</option>${f.options.map(([k, l]) => `<option value="${esc(k)}"${String(val) === String(k) ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  } else if (f.type === 'textarea') {
    input = `<textarea id="${id}" name="${f.name}" rows="3"${ph}>${esc(val)}</textarea>`;
  } else {
    const extra = [
      f.step ? `step="${f.step}"` : (f.type === 'number' ? 'step="1"' : ''),
      f.min != null ? `min="${f.min}"` : '', f.max != null ? `max="${f.max}"` : '',
      f.maxDate ? `max="${today()}"` : '', f.type === 'number' ? 'inputmode="decimal"' : ''
    ].join(' ');
    input = `<input id="${id}" name="${f.name}" type="${f.type || 'text'}" value="${esc(val)}"${ph}${dir} ${extra}>`;
  }
  const cls = f.full ? 'full' : (f.q ? 'q' : '');
  return `<label class="field ${cls}" for="${id}"><span>${esc(f.label)}${f.required ? ' <b class="req">*</b>' : ''}${f.unit ? ` <small>(${esc(f.unit)})</small>` : ''}</span>${input}</label>`;
}

function openForm({ title, fields, values, submitLabel = 'حفظ', onSubmit }) {
  const vals = values || Object.fromEntries(fields.filter(f => f.name && f.def !== undefined).map(f => [f.name, typeof f.def === 'function' ? f.def() : f.def]));
  modalRoot.innerHTML = `<div class="modal-backdrop"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
    <div class="modal-head"><h3 id="modal-title">${esc(title)}</h3><button type="button" class="icon-btn" data-act="closeModal" aria-label="إغلاق">${ICON.x}</button></div>
    <form class="modal-form" id="modal-form" novalidate>
      <div class="form-grid">${fields.map(f => fieldHtml(f, f.name ? vals[f.name] : null)).join('')}</div>
      <div class="form-error" id="form-error"></div>
      <div class="modal-foot"><button type="submit" class="btn primary">${ICON.check}${esc(submitLabel)}</button><button type="button" class="btn ghost" data-act="closeModal">إلغاء</button></div>
    </form></div></div>`;
  const bd = $('.modal-backdrop', modalRoot);
  bd.addEventListener('mousedown', e => { if (e.target === bd) closeModal(); });
  const form = $('#modal-form');
  const firstInput = form.querySelector('input,select,textarea');
  if (firstInput) setTimeout(() => firstInput.focus(), 30);
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const err = $('#form-error');
    err.textContent = '';
    form.querySelectorAll('.invalid').forEach(x => x.classList.remove('invalid'));
    const out = {};
    const problems = [];
    for (const f of fields) {
      if (!f.name) continue;
      const el = form.elements[f.name];
      let v = (el.value || '').trim();
      if (f.required && !v) { problems.push(`«${f.label}» مطلوب`); el.closest('.field').classList.add('invalid'); }
      if (v === '') v = null;
      else if (f.type === 'number') {
        v = Number(v.replace(',', '.'));
        if (Number.isNaN(v)) { problems.push(`«${f.label}» يجب أن يكون رقماً`); el.closest('.field').classList.add('invalid'); v = null; }
        else {
          if (f.int) v = Math.round(v);
          if ((f.min != null && v < f.min) || (f.max != null && v > f.max)) { problems.push(`قيمة «${f.label}» غير منطقية (${f.min}–${f.max})`); el.closest('.field').classList.add('invalid'); }
        }
      } else if (f.maxDate && v > today()) { problems.push(`«${f.label}» لا يمكن أن يكون في المستقبل`); el.closest('.field').classList.add('invalid'); }
      out[f.name] = v;
    }
    if (problems.length) { err.textContent = problems.join(' · '); return; }
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      const r = await onSubmit(out);
      if (r === false) { btn.disabled = false; return; }
      closeModal();
    } catch (ex) {
      console.error(ex);
      err.textContent = msg(ex);
      btn.disabled = false;
    }
  });
}
function closeModal() { modalRoot.innerHTML = ''; }
function toast(text, type = 'ok') {
  const t = document.createElement('div');
  t.className = 'toast ' + (type === 'err' ? 'err' : '');
  t.innerHTML = `${type === 'err' ? ICON.alert : ICON.check}<span>${esc(text)}</span>`;
  toastRoot.appendChild(t);
  setTimeout(() => t.remove(), type === 'err' ? 5000 : 2600);
}
document.addEventListener('keydown', e => { if (e.key === 'Escape' && modalRoot.innerHTML) closeModal(); });

/* ============ 5) الصفحات ============ */
function shell(active, inner) {
  const nav = [['dashboard', 'الرئيسية', ICON.home], ['patients', 'المرضى', ICON.users], ['followups', 'المتابعات', ICON.cal]];
  const u = state.user || {};
  return `<div class="layout">
    <aside class="sidebar">
      <a class="brand" href="#/dashboard">${LOGO}<span><b>مَسار طِب</b><small>رحلة المريض العلاجية</small></span></a>
      <nav class="nav">${nav.map(([k, l, i]) => `<a href="#/${k}" class="${active === k ? 'active' : ''}">${i}<span>${l}</span></a>`).join('')}</nav>
      <div class="side-foot">
        <div class="me"><span class="avatar">${esc(initials(u.name))}</span><span class="me-txt"><b>د. ${esc(u.name)}</b><small class="ltr">${esc(u.email)}</small></span></div>
        <button type="button" class="nav-btn" data-act="logout" title="تسجيل الخروج">${ICON.out}<span>تسجيل الخروج</span></button>
      </div>
    </aside>
    <main class="main">
      ${CLOUD ? '' : `<div class="demo-banner">${ICON.alert}<span><b>وضع تجريبي:</b> البيانات محفوظة في هذا المتصفح فقط. لربط قاعدة البيانات أضف بيانات Supabase في ملف <code>config.js</code>.</span></div>`}
      ${inner}
    </main>
  </div>`;
}
const loading = () => `<div class="loading"><div class="spinner"></div>جارٍ التحميل…</div>`;
const pageHead = (title, sub, actions = '') => `<div class="page-head"><div><h1>${title}</h1>${sub ? `<p>${sub}</p>` : ''}</div><div class="actions">${actions}</div></div>`;
const emptyBox = (icon, title, text, actions = '', small = false) => `<div class="empty ${small ? 'small' : ''}"><div class="ic">${icon}</div><h3>${esc(title)}</h3><p>${esc(text)}</p>${actions ? `<div class="actions">${actions}</div>` : ''}</div>`;
const avatar = (p, cls = '') => `<span class="avatar ${p.gender === 'female' ? 'f' : ''} ${cls}">${esc(initials(p.full_name))}</span>`;
const newPatientBtn = `<button type="button" class="btn primary" data-act="newPatient">${ICON.plus}مريض جديد</button>`;

/* ---- تسجيل الدخول ---- */
function renderLogin(mode = 'login') {
  const signup = mode === 'signup';
  app.innerHTML = `<div class="auth-page"><div class="auth-card">
    <div class="auth-brand">${LOGO}<div><h1>مَسار طِب</h1><p>يرافق الطبيب من تقييم الحالة إلى العلاج والمتابعة</p></div></div>
    <div class="seg" role="tablist">
      <button type="button" data-act="authMode" data-mode="login" class="${signup ? '' : 'on'}">تسجيل الدخول</button>
      <button type="button" data-act="authMode" data-mode="signup" class="${signup ? 'on' : ''}">حساب طبيب جديد</button>
    </div>
    <form class="auth-form" id="auth-form" novalidate>
      ${signup ? `<label class="field"><span>اسم الطبيب</span><input name="name" autocomplete="name" placeholder="مثال: سارة القحطاني"></label>` : ''}
      <label class="field"><span>البريد الإلكتروني</span><input name="email" type="email" dir="ltr" autocomplete="email" placeholder="doctor@example.com"></label>
      <label class="field"><span>كلمة المرور</span><input name="password" type="password" dir="ltr" autocomplete="${signup ? 'new-password' : 'current-password'}" placeholder="6 أحرف على الأقل"></label>
      <div class="form-error" id="auth-error"></div>
      <button class="btn primary block" type="submit">${signup ? 'إنشاء الحساب' : 'دخول'}</button>
    </form>
    ${CLOUD ? '' : `<div class="hint">وضع تجريبي: ادخل بأي بريد وكلمة مرور (6 أحرف أو أكثر)</div>`}
    <div class="auth-points"><span>${ICON.steth}تقييم</span><span>${ICON.folder}تشخيص</span><span>${ICON.check}علاج</span><span>${ICON.cal}متابعة</span></div>
  </div></div>`;
  const form = $('#auth-form');
  const err = $('#auth-error');
  form.addEventListener('submit', async e => {
    e.preventDefault();
    err.className = 'form-error';
    const name = signup ? form.elements.name.value.trim() : '';
    const email = form.elements.email.value.trim().toLowerCase();
    const pw = form.elements.password.value;
    if (signup && !name) { err.textContent = 'اكتب اسم الطبيب'; return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { err.textContent = 'اكتب بريداً إلكترونياً صحيحاً'; return; }
    if (pw.length < 6) { err.textContent = 'كلمة المرور يجب أن تكون 6 أحرف على الأقل'; return; }
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      const r = signup ? await auth.signUp(name, email, pw) : await auth.signIn(email, pw);
      if (r && r.needsConfirm) {
        err.className = 'form-error good';
        err.textContent = 'تم إنشاء الحساب. افتح بريدك واضغط رابط التأكيد ثم سجّل الدخول.';
        btn.disabled = false;
        return;
      }
      state.user = r;
      location.hash = '#/dashboard';
    } catch (ex) {
      err.textContent = msg(ex);
      btn.disabled = false;
    }
  });
}

/* ---- الرئيسية ---- */
async function renderDashboard() {
  app.innerHTML = shell('dashboard', loading());
  const all = await loadAll();
  const t = today();
  const pmap = Object.fromEntries(all.patients.map(p => [p.id, p]));
  const hour = new Date().getHours();
  const greet = (hour < 12 ? 'صباح الخير' : 'مساء الخير') + '، د. ' + esc(state.user.name);
  const dateLabel = new Date().toLocaleDateString(LOCALE, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  if (!all.patients.length) {
    app.innerHTML = shell('dashboard', `${pageHead(greet, dateLabel)}
      <div class="card">${emptyBox(ICON.users, 'لا يوجد مرضى بعد', 'ابدأ بإضافة أول مريض، أو حمّل بيانات تجريبية لاستكشاف النظام.',
        `${newPatientBtn}<button type="button" class="btn ghost" data-act="seed">تحميل بيانات تجريبية</button>`)}</div>`);
    return;
  }

  const sched = all.followups.filter(f => f.status === 'scheduled' && pmap[f.patient_id]);
  const active = all.patients.filter(p => p.status !== 'closed');
  const fuToday = sched.filter(f => f.scheduled_date === t);
  const overdue = sched.filter(f => f.scheduled_date < t);
  const upcoming = sched.filter(f => f.scheduled_date >= t).sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date)).slice(0, 6);
  const stageCounts = {};
  all.patients.forEach(p => { const s = stageOf(p, all); stageCounts[s] = (stageCounts[s] || 0) + 1; });
  const maxStage = Math.max(1, ...Object.values(stageCounts));
  // آخر تقييم لكل مريض نشط إذا كانت خطورته عالية
  const latestAs = {};
  all.assessments.forEach(a => { const cur = latestAs[a.patient_id]; if (!cur || a.visit_date > cur.visit_date) latestAs[a.patient_id] = a; });
  const attention = active.map(p => ({ p, a: latestAs[p.id] })).filter(x => x.a && (x.a.severity === 'high' || x.a.severity === 'critical'))
    .sort((x, y) => (x.a.severity === 'critical' ? -1 : 0) - (y.a.severity === 'critical' ? -1 : 0)).slice(0, 5);
  const recent = [...all.patients].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, 5);

  const stat = (lbl, n, icon, tone, sub) => `<div class="stat t-${tone} ${n ? 'has' : ''}"><div class="ic">${icon}</div><div><div class="num">${n}</div><div class="lbl">${lbl}${sub ? ` · ${sub}` : ''}</div></div></div>`;
  const fuRow = f => {
    const p = pmap[f.patient_id]; const d = toDate(f.scheduled_date);
    return `<a class="row-link" href="#/patient/${p.id}"><div class="date-chip"><b>${d.getDate()}</b><small>${monthShort(d)}</small></div>
      <div class="row-main"><b>${esc(p.full_name)}</b><small>${esc(L.fuType[f.type] || 'متابعة')}${f.reason ? ' · ' + esc(f.reason) : ''}</small></div>${badge(relDay(f.scheduled_date), dayDiff(f.scheduled_date) === 0 ? 'info' : '')}</a>`;
  };

  app.innerHTML = shell('dashboard', `${pageHead(greet, dateLabel, newPatientBtn)}
    <div class="stats">
      ${stat('إجمالي المرضى', all.patients.length, ICON.users, 'teal')}
      ${stat('حالات نشطة', active.length, ICON.pulse, 'warn')}
      ${stat('متابعات اليوم', fuToday.length, ICON.cal, 'info')}
      ${stat('متابعات متأخرة', overdue.length, ICON.alert, 'danger')}
    </div>
    ${overdue.length ? `<div class="alert danger" style="margin-bottom:18px">${ICON.alert}<span>لديك <b>${overdue.length}</b> متابعة متأخرة. <a href="#/followups" data-act="fuFilter" data-f="overdue">عرض المتابعات المتأخرة</a></span></div>` : ''}
    <div class="grid-2">
      <section class="card"><div class="card-head"><h3>المتابعات القادمة</h3><a href="#/followups">عرض الكل</a></div>
        ${upcoming.length ? upcoming.map(fuRow).join('') : emptyBox(ICON.cal, 'لا توجد متابعات قادمة', 'جدول متابعة من ملف أي مريض.', '', true)}
      </section>
      <section class="card"><div class="card-head"><h3>حالات تحتاج انتباهاً</h3></div>
        ${attention.length ? attention.map(({ p, a }) => `<a class="row-link" href="#/patient/${p.id}">${avatar(p)}<div class="row-main"><b>${esc(p.full_name)}</b><small>${esc(a.chief_complaint)} · ${fmtDate(a.visit_date)}</small></div>${badge(L.severity[a.severity], TONE.severity[a.severity])}</a>`).join('')
          : emptyBox(ICON.check, 'لا توجد حالات خطرة', 'كل الحالات النشطة بخطورة منخفضة أو متوسطة.', '', true)}
      </section>
      <section class="card pipeline"><div class="card-head"><h3>توزيع الحالات على المسار</h3></div>
        ${['new', 'assessment', 'diagnosis', 'treatment', 'followup', 'closed'].map(s => `<div class="pl-row"><span>${STAGE_LABEL[s]}</span><div class="bar"><i style="width:${((stageCounts[s] || 0) / maxStage) * 100}%"></i></div><span>${stageCounts[s] || 0}</span></div>`).join('')}
      </section>
      <section class="card"><div class="card-head"><h3>أحدث المرضى</h3><a href="#/patients">كل المرضى</a></div>
        ${recent.map(p => { const s = stageOf(p, all); return `<a class="row-link" href="#/patient/${p.id}">${avatar(p)}<div class="row-main"><b>${esc(p.full_name)}</b><small>${esc(p.file_no || '')} · أضيف ${fmtDate(p.created_at)}</small></div>${badge(STAGE_LABEL[s], TONE.stage[s])}</a>`; }).join('')}
      </section>
    </div>`);
}

/* ---- قائمة المرضى ---- */
async function renderPatients() {
  app.innerHTML = shell('patients', loading());
  const all = await loadAll();
  const t = today();
  const rows = all.patients.map(p => {
    const as = all.assessments.filter(a => a.patient_id === p.id).sort((a, b) => b.visit_date.localeCompare(a.visit_date));
    const next = all.followups.filter(f => f.patient_id === p.id && f.status === 'scheduled').sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date))[0];
    return { p, stage: stageOf(p, all), last: as[0], next };
  });
  app.innerHTML = shell('patients', `${pageHead('المرضى', `${all.patients.length} ملف مريض`, newPatientBtn)}
    <div class="toolbar">
      <div class="search">${ICON.search}<input id="q" type="search" placeholder="ابحث بالاسم أو رقم الملف أو الجوال" value="${esc(state.pQuery)}" aria-label="بحث"></div>
      <select id="stage-filter" aria-label="تصفية حسب المرحلة"><option value="">كل المراحل</option>${Object.entries(STAGE_LABEL).map(([k, l]) => `<option value="${k}"${state.pStage === k ? ' selected' : ''}>${l}</option>`).join('')}</select>
    </div>
    <div class="card flush"><div class="table-wrap"><table class="table">
      <thead><tr><th>المريض</th><th>العمر / الجنس</th><th>المرحلة</th><th>آخر زيارة</th><th>المتابعة القادمة</th><th>حالة الملف</th></tr></thead>
      <tbody id="ptbody"></tbody></table></div></div>`);
  const draw = () => {
    const q = state.pQuery.trim().toLowerCase();
    const list = rows.filter(r => (!state.pStage || r.stage === state.pStage) &&
      (!q || [r.p.full_name, r.p.file_no, r.p.phone].some(x => String(x || '').toLowerCase().includes(q))));
    $('#ptbody').innerHTML = list.length ? list.map(({ p, stage, last, next }) => {
      const a = age(p.birth_date);
      return `<tr class="click" data-act="openPatient" data-id="${p.id}">
        <td><div class="cell-name">${avatar(p)}<div><b>${esc(p.full_name)}</b><small class="ltr">${esc(p.file_no || '—')}</small></div></div></td>
        <td>${a != null ? a + ' سنة' : '—'} · ${esc(L.gender[p.gender] || '—')}</td>
        <td>${badge(STAGE_LABEL[stage], TONE.stage[stage])}</td>
        <td>${last ? fmtDate(last.visit_date) : '<span class="muted">—</span>'}</td>
        <td>${next ? `${fmtDate(next.scheduled_date)} ${next.scheduled_date < t ? badge('متأخرة', 'danger') : ''}` : '<span class="muted">—</span>'}</td>
        <td>${badge(L.pStatus[p.status] || 'نشطة', p.status === 'closed' ? '' : 'teal')}</td></tr>`;
    }).join('') : `<tr><td colspan="6">${all.patients.length
      ? emptyBox(ICON.search, 'لا توجد نتائج', 'جرّب كلمة بحث أخرى أو غيّر المرحلة.', '', true)
      : emptyBox(ICON.users, 'لا يوجد مرضى بعد', 'أضف أول مريض لبدء رحلته العلاجية.', `${newPatientBtn}<button type="button" class="btn ghost" data-act="seed">تحميل بيانات تجريبية</button>`)}</td></tr>`;
  };
  $('#q').addEventListener('input', e => { state.pQuery = e.target.value; draw(); });
  $('#stage-filter').addEventListener('change', e => { state.pStage = e.target.value; draw(); });
  draw();
}

/* ---- ملف المريض ---- */
async function renderPatient(id) {
  app.innerHTML = shell('patients', loading());
  const p = await db.get('patients', id);
  if (!p) {
    app.innerHTML = shell('patients', `<div class="card">${emptyBox(ICON.alert, 'المريض غير موجود', 'ربما تم حذف الملف.', `<a class="btn primary" href="#/patients">العودة للمرضى</a>`)}</div>`);
    return;
  }
  const [as, dx, tx, fu] = await Promise.all(['assessments', 'diagnoses', 'treatments', 'followups'].map(t => db.list(t, { patient_id: id })));
  as.sort((a, b) => b.visit_date.localeCompare(a.visit_date) || String(b.created_at).localeCompare(String(a.created_at)));
  fu.sort((a, b) => {
    const sa = a.status === 'scheduled' ? 0 : 1, sb2 = b.status === 'scheduled' ? 0 : 1;
    if (sa !== sb2) return sa - sb2;
    return sa === 0 ? a.scheduled_date.localeCompare(b.scheduled_date) : b.scheduled_date.localeCompare(a.scheduled_date);
  });
  state.ctx = { p, as, dx, tx, fu };
  state.records = Object.fromEntries([...as, ...dx, ...tx, ...fu].map(r => [r.id, r]));
  const all = { assessments: as, diagnoses: dx, treatments: tx, followups: fu };
  const stage = stageOf(p, all);
  if (!state.tabs[p.id]) state.tabs[p.id] = ({ new: 'assessments', assessment: 'diagnoses', diagnosis: 'treatments', treatment: 'followups', followup: 'followups', closed: 'timeline' })[stage];

  const a = age(p.birth_date);
  const chronic = (p.chronic_conditions || '').split(/[،,؛;\n]+/).map(s => s.trim()).filter(Boolean);
  const nextFu = fu.find(f => f.status === 'scheduled');
  let hint;
  switch (stage) {
    case 'new': hint = ['ابدأ رحلة المريض بتقييم الحالة: الشكوى، العلامات الحيوية، والفحص السريري.', 'add', 'assessments', 'إضافة تقييم']; break;
    case 'assessment': hint = ['تم تقييم الحالة. الخطوة التالية: تسجيل التشخيص.', 'add', 'diagnoses', 'إضافة تشخيص']; break;
    case 'diagnosis': hint = ['التشخيص جاهز. ضع خطة العلاج المناسبة للمريض.', 'add', 'treatments', 'إضافة علاج']; break;
    case 'treatment': hint = ['بدأ العلاج. جدول موعد متابعة لتقييم استجابة المريض.', 'add', 'followups', 'جدولة متابعة']; break;
    case 'followup': hint = nextFu
      ? [`المتابعة القادمة: ${fmtDate(nextFu.scheduled_date)} (${relDay(nextFu.scheduled_date)}) — ${L.fuType[nextFu.type] || ''}`, 'add', 'followups', 'متابعة إضافية']
      : ['لا توجد متابعة قادمة. جدول متابعة جديدة، أو أغلق الحالة إذا اكتمل العلاج.', 'add', 'followups', 'جدولة متابعة']; break;
    default: hint = ['الحالة مغلقة. يمكنك إعادة فتحها عند الحاجة.', 'toggleCase', '', 'إعادة فتح الحالة'];
  }
  const stageIdx = STAGES.findIndex(s => s[0] === stage);

  app.innerHTML = shell('patients', `
    <div class="back"><a href="#/patients">${ICON.back}كل المرضى</a></div>
    <section class="card patient-head">
      <div class="ph-top">
        <div class="ph-main">${avatar(p, 'lg')}<div>
          <h2>${esc(p.full_name)} ${badge(L.pStatus[p.status] || 'نشطة', p.status === 'closed' ? '' : 'teal')} ${badge('المرحلة: ' + STAGE_LABEL[stage], TONE.stage[stage])}</h2>
          <div class="meta"><span>رقم الملف: <b class="ltr">${esc(p.file_no || '—')}</b></span><span>العمر: <b>${a != null ? a + ' سنة' : '—'}</b></span><span>الجنس: <b>${esc(L.gender[p.gender] || '—')}</b></span><span>الفصيلة: <b class="ltr">${esc(p.blood_type || '—')}</b></span><span>الجوال: <b class="ltr">${esc(p.phone || '—')}</b></span></div>
        </div></div>
        <div class="actions ph-actions">
          <button type="button" class="btn ghost sm" data-act="editPatient">${ICON.edit}<span>تعديل</span></button>
          <button type="button" class="btn ghost sm" data-act="print">${ICON.print}<span>طباعة التقرير</span></button>
          <button type="button" class="btn ghost sm" data-act="toggleCase">${p.status === 'closed' ? ICON.reopen + '<span>إعادة فتح</span>' : ICON.lock + '<span>إغلاق الحالة</span>'}</button>
          <button type="button" class="btn danger sm" data-act="deletePatient">${ICON.trash}<span>حذف</span></button>
        </div>
      </div>
      ${p.allergies ? `<div class="alert danger">${ICON.alert}<span><b>حساسية:</b> ${esc(p.allergies)}</span></div>` : ''}
      ${chronic.length ? `<div class="chips"><b>أمراض مزمنة:</b>${chronic.map(c => `<span class="chip">${esc(c)}</span>`).join('')}</div>` : ''}
    </section>
    <section class="card journey">
      <div class="stepper">${STAGES.map(([k, l, tab], i) => {
        const count = all[tab].length;
        const done = count > 0;
        const cur = i === stageIdx;
        return `<button type="button" class="step ${done ? 'done' : ''} ${cur ? 'current' : ''}" data-act="tab" data-tab="${tab}"><span class="dot">${done ? ICON.check : i + 1}</span><b>${l}</b><small>${count ? count + ' سجل' : 'لم يبدأ'}</small></button>`;
      }).join('')}</div>
      <div class="next-step"><p>${ICON.arrow}${esc(hint[0])}</p><button type="button" class="btn primary sm" data-act="${hint[1]}" data-kind="${hint[2]}">${hint[1] === 'add' ? ICON.plus : ICON.reopen}${esc(hint[3])}</button></div>
    </section>
    <div id="ptabs"></div>`);
  drawPatientTabs();
}

function drawPatientTabs() {
  const { p, as, dx, tx, fu } = state.ctx;
  const tab = state.tabs[p.id];
  const defs = [['assessments', 'التقييم', as.length], ['diagnoses', 'التشخيص', dx.length], ['treatments', 'العلاج', tx.length], ['followups', 'المتابعة', fu.length], ['timeline', 'السجل الكامل', as.length + dx.length + tx.length + fu.length]];
  $('#ptabs').innerHTML = `<div class="tabs" role="tablist">${defs.map(([k, l, c]) => `<button type="button" role="tab" aria-selected="${tab === k}" class="tab ${tab === k ? 'on' : ''}" data-act="tab" data-tab="${k}">${l}<span class="cnt">${c}</span></button>`).join('')}</div>
    <div class="tab-body">${tabBody(tab)}</div>`;
}

const tools = (kind, id) => `<div class="rec-tools"><button type="button" class="icon-btn" data-act="edit" data-kind="${kind}" data-id="${id}" title="تعديل" aria-label="تعديل">${ICON.edit}</button><button type="button" class="icon-btn del" data-act="del" data-kind="${kind}" data-id="${id}" title="حذف" aria-label="حذف">${ICON.trash}</button></div>`;
const note = (label, text) => `<div class="note"><small>${esc(label)}</small>${esc(text)}</div>`;
const kv = items => { const f = items.filter(([, v]) => v); return f.length ? `<div class="kv">${f.map(([k, v]) => `<div><small>${esc(k)}</small><b>${esc(v)}</b></div>`).join('')}</div>` : ''; };

function vitalsHtml(a) {
  const items = VITALS.map(([l, u, get, bad]) => { const v = get(a); return v == null ? '' : `<div class="vital ${bad(a) ? 'abn' : ''}"><small>${l}</small><b>${esc(v)}</b>${u ? `<em>${u}</em>` : ''}</div>`; }).join('');
  return items ? `<div class="vitals">${items}</div>` : '';
}
function assessmentCard(a) {
  const n = abnormalCount(a);
  return `<article class="rec"><div class="rec-head"><div><div class="rec-title">${esc(a.chief_complaint)}</div>
    <div class="rec-sub">${fmtDate(a.visit_date)} ${a.severity ? badge('الخطورة: ' + L.severity[a.severity], TONE.severity[a.severity]) : ''} ${n ? badge(n + ' علامة غير طبيعية', 'danger') : ''}</div></div>${tools('assessments', a.id)}</div>
    ${a.symptoms ? note('الأعراض والتاريخ المرضي', a.symptoms) : ''}${vitalsHtml(a)}${a.exam_notes ? note('الفحص السريري', a.exam_notes) : ''}</article>`;
}
function diagnosisCard(d) {
  const linked = d.assessment_id && state.records[d.assessment_id];
  return `<article class="rec"><div class="rec-head"><div><div class="rec-title">${esc(d.title)} ${d.icd_code ? `<span class="badge ltr">${esc(d.icd_code)}</span>` : ''}</div>
    <div class="rec-sub">${badge(L.dxStatus[d.status] || '—', TONE.dxStatus[d.status])} ${badge('تشخيص ' + (L.dxType[d.type] || ''), '')} <span>سُجّل ${fmtDate(d.created_at)}</span></div></div>${tools('diagnoses', d.id)}</div>
    ${linked ? `<div class="rec-sub" style="margin-top:8px">مبني على تقييم ${fmtDate(linked.visit_date)}: ${esc(linked.chief_complaint)}</div>` : ''}
    ${d.notes ? note('ملاحظات', d.notes) : ''}</article>`;
}
function treatmentCard(t) {
  const linked = t.diagnosis_id && state.records[t.diagnosis_id];
  return `<article class="rec"><div class="rec-head"><div><div class="rec-title">${esc(t.medication)}${t.dose ? ` <span class="muted" style="font-weight:500">${esc(t.dose)}</span>` : ''}</div>
    <div class="rec-sub">${badge(L.txStatus[t.status] || '—', TONE.txStatus[t.status])} ${linked ? `<span>لعلاج: ${esc(linked.title)}</span>` : ''}</div></div>${tools('treatments', t.id)}</div>
    ${kv([['طريقة الإعطاء', L.route[t.route]], ['التكرار', t.frequency], ['المدة', t.duration], ['تاريخ البدء', t.start_date ? fmtDate(t.start_date) : '']])}
    ${t.instructions ? note('تعليمات للمريض', t.instructions) : ''}</article>`;
}
function followupCard(f, p) {
  const d = toDate(f.scheduled_date);
  const sched = f.status === 'scheduled';
  const diff = dayDiff(f.scheduled_date);
  const when = sched ? (diff < 0 ? badge(`متأخرة ${-diff} يوم`, 'danger') : badge(relDay(f.scheduled_date), diff === 0 ? 'info' : '')) : '';
  return `<article class="rec ${sched && diff < 0 ? 'overdue' : ''}"><div class="fu-row">
    <div class="date-chip"><b>${d.getDate()}</b><small>${monthShort(d)}</small></div>
    <div class="row-main">${p ? `<a class="fu-patient" href="#/patient/${p.id}">${esc(p.full_name)}</a>` : ''}
      <div class="rec-title">${esc(L.fuType[f.type] || 'متابعة')}${f.reason ? ` — ${esc(f.reason)}` : ''}</div>
      <div class="rec-sub">${badge(L.fuStatus[f.status] || '—', TONE.fuStatus[f.status])} ${when} <span>${fmtDate(f.scheduled_date)}</span></div></div>
    ${tools('followups', f.id)}</div>
    ${f.outcome ? note('نتيجة المتابعة', f.outcome) : ''}
    ${sched ? `<div class="rec-actions"><button type="button" class="btn ok sm" data-act="fuDone" data-id="${f.id}">${ICON.check}تمت المتابعة</button><button type="button" class="btn ghost sm" data-act="fuMissed" data-id="${f.id}">لم يحضر</button></div>` : ''}</article>`;
}

function tabBody(tab) {
  const { as, dx, tx, fu } = state.ctx;
  const head = (title, sub, kind, label) => `<div class="tab-head"><div><h3>${title}</h3><p>${sub}</p></div>${kind ? `<button type="button" class="btn primary sm" data-act="add" data-kind="${kind}">${ICON.plus}${label}</button>` : ''}</div>`;
  const listOr = (items, render, kind, emptyT, emptyS, label) => items.length
    ? `<div class="records">${items.map(render).join('')}</div>`
    : `<div class="card">${emptyBox(ICON.folder, emptyT, emptyS, `<button type="button" class="btn primary" data-act="add" data-kind="${kind}">${ICON.plus}${label}</button>`, true)}</div>`;
  switch (tab) {
    case 'assessments':
      return head('تقييم الحالة', 'الشكوى، الأعراض، العلامات الحيوية والفحص السريري', 'assessments', 'تقييم جديد') +
        listOr(as, assessmentCard, 'assessments', 'لا توجد تقييمات', 'سجّل أول تقييم لحالة المريض.', 'تقييم جديد');
    case 'diagnoses':
      return head('التشخيص', 'التشخيصات المبنية على التقييم', 'diagnoses', 'إضافة تشخيص') +
        (as.length ? '' : `<div class="alert warn" style="margin-bottom:12px">${ICON.alert}<span>يُنصح بتسجيل تقييم للحالة قبل التشخيص.</span></div>`) +
        listOr(dx, diagnosisCard, 'diagnoses', 'لا توجد تشخيصات', 'أضف التشخيص بعد تقييم الحالة.', 'إضافة تشخيص');
    case 'treatments':
      return head('خطة العلاج', 'الأدوية والإجراءات العلاجية', 'treatments', 'إضافة علاج') +
        listOr(tx, treatmentCard, 'treatments', 'لا يوجد علاج', 'أضف الأدوية أو الإجراءات العلاجية.', 'إضافة علاج');
    case 'followups':
      return head('المتابعة', 'مواعيد المتابعة ونتائجها', 'followups', 'جدولة متابعة') +
        listOr(fu, f => followupCard(f), 'followups', 'لا توجد متابعات', 'جدول متابعة لتقييم استجابة المريض.', 'جدولة متابعة');
    default: {
      const items = [
        ...as.map(a => ({ d: a.visit_date, c: 'var(--info)', t: 'تقييم: ' + a.chief_complaint, s: a.severity ? 'الخطورة ' + L.severity[a.severity] : '' })),
        ...dx.map(x => ({ d: dateOnly(x.created_at), c: 'var(--violet)', t: 'تشخيص: ' + x.title, s: L.dxStatus[x.status] || '' })),
        ...tx.map(x => ({ d: x.start_date || dateOnly(x.created_at), c: 'var(--warn)', t: 'علاج: ' + x.medication + (x.dose ? ' ' + x.dose : ''), s: [x.frequency, x.duration].filter(Boolean).join(' · ') })),
        ...fu.map(x => ({ d: x.scheduled_date, c: 'var(--primary)', t: 'متابعة: ' + (L.fuType[x.type] || '') + (x.reason ? ' — ' + x.reason : ''), s: (L.fuStatus[x.status] || '') + (x.outcome ? ' · ' + x.outcome : '') }))
      ].sort((a, b) => String(b.d).localeCompare(String(a.d)));
      return head('السجل الكامل', 'رحلة المريض مرتبة زمنياً') + (items.length
        ? `<div class="card"><div class="timeline">${items.map(i => `<div class="tl-item" style="--c:${i.c}"><div class="tl-date">${fmtDate(i.d)}</div><div class="tl-title">${esc(i.t)}</div>${i.s ? `<div class="tl-sub">${esc(i.s)}</div>` : ''}</div>`).join('')}</div></div>`
        : `<div class="card">${emptyBox(ICON.folder, 'السجل فارغ', 'ستظهر هنا كل خطوات رحلة المريض.', '', true)}</div>`);
    }
  }
}

/* ---- المتابعات ---- */
async function renderFollowups() {
  app.innerHTML = shell('followups', loading());
  const all = await loadAll();
  const t = today();
  const pmap = Object.fromEntries(all.patients.map(p => [p.id, p]));
  const fus = all.followups.filter(f => pmap[f.patient_id]);
  state.records = Object.fromEntries(fus.map(f => [f.id, f]));
  state.ctx = null;
  const asc = (a, b) => a.scheduled_date.localeCompare(b.scheduled_date);
  const desc = (a, b) => b.scheduled_date.localeCompare(a.scheduled_date);
  const groups = {
    overdue: ['متأخرة', fus.filter(f => f.status === 'scheduled' && f.scheduled_date < t).sort(asc)],
    today: ['اليوم', fus.filter(f => f.status === 'scheduled' && f.scheduled_date === t)],
    upcoming: ['القادمة', fus.filter(f => f.status === 'scheduled' && f.scheduled_date > t).sort(asc)],
    done: ['المنتهية', fus.filter(f => f.status !== 'scheduled').sort(desc)],
    all: ['الكل', [...fus].sort(desc)]
  };
  if (!groups[state.fuFilter]) state.fuFilter = 'upcoming';
  const [, list] = groups[state.fuFilter];
  app.innerHTML = shell('followups', `${pageHead('المتابعات', 'كل مواعيد متابعة المرضى في مكان واحد')}
    <div class="seg">${Object.entries(groups).map(([k, [l, arr]]) => `<button type="button" class="${state.fuFilter === k ? 'on' : ''}" data-act="fuFilter" data-f="${k}">${l}<span class="cnt">${arr.length}</span></button>`).join('')}</div>
    ${list.length ? `<div class="records">${list.map(f => followupCard(f, pmap[f.patient_id])).join('')}</div>`
      : `<div class="card">${emptyBox(ICON.cal, 'لا توجد متابعات هنا', 'تتم جدولة المتابعات من ملف المريض ← تبويب المتابعة.', `<a class="btn ghost" href="#/patients">الذهاب للمرضى</a>`)}</div>`}`);
}

/* ============ 6) الأزرار والأحداث ============ */
function openRecordForm(kind, id) {
  const K = KINDS[kind];
  if (!K) return;
  const ctx = state.ctx;
  const rec = id ? state.records[id] : null;
  if (id && !rec) { toast('السجل غير موجود', 'err'); return; }
  if (!rec && !ctx) return;
  openForm({
    title: rec ? `تعديل ${K.one}` : K.addTitle,
    fields: K.fields(ctx),
    values: rec || undefined,
    submitLabel: rec ? 'حفظ التعديلات' : K.addLabel,
    onSubmit: async v => {
      if (K.check && !K.check(v, ctx)) return false;
      if (rec) {
        await db.update(kind, rec.id, v);
        toast('تم حفظ التعديلات');
      } else {
        await db.insert(kind, { ...v, patient_id: ctx.p.id });
        state.tabs[ctx.p.id] = kind;
        toast(K.added);
      }
      route();
    }
  });
}

const ACT = {
  closeModal: () => closeModal(),
  authMode: d => renderLogin(d.mode),
  logout: async () => { await auth.signOut(); state.user = null; state.tabs = {}; location.hash = '#/login'; },
  openPatient: d => { location.hash = '#/patient/' + d.id; },
  newPatient: () => openForm({
    title: 'ملف مريض جديد', fields: patientFields(), submitLabel: 'إنشاء الملف',
    onSubmit: async v => {
      const row = await db.insert('patients', { ...v, status: 'active' });
      toast('تم إنشاء ملف المريض');
      location.hash = '#/patient/' + row.id;
    }
  }),
  editPatient: () => {
    const p = state.ctx.p;
    openForm({
      title: 'تعديل بيانات المريض', fields: patientFields(), values: p, submitLabel: 'حفظ التعديلات',
      onSubmit: async v => { await db.update('patients', p.id, v); toast('تم حفظ التعديلات'); route(); }
    });
  },
  deletePatient: async () => {
    const p = state.ctx.p;
    if (!confirm(`هل تريد حذف ملف "${p.full_name}" وكل سجلاته نهائياً؟`)) return;
    await db.remove('patients', p.id);
    toast('تم حذف ملف المريض');
    location.hash = '#/patients';
  },
  toggleCase: async () => {
    const p = state.ctx.p;
    const s = p.status === 'closed' ? 'active' : 'closed';
    if (s === 'closed' && state.ctx.fu.some(f => f.status === 'scheduled') && !confirm('لدى المريض متابعات مجدولة. هل تريد إغلاق الحالة رغم ذلك؟')) return;
    await db.update('patients', p.id, { status: s });
    delete state.tabs[p.id];
    toast(s === 'closed' ? 'تم إغلاق الحالة' : 'تمت إعادة فتح الحالة');
    route();
  },
  tab: d => { state.tabs[state.ctx.p.id] = d.tab; drawPatientTabs(); const el = $('#ptabs'); if (el && el.getBoundingClientRect().top > window.innerHeight * 0.6) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); },
  add: d => openRecordForm(d.kind),
  edit: d => openRecordForm(d.kind, d.id),
  del: async d => {
    if (!confirm(`هل تريد حذف ${KINDS[d.kind].one} نهائياً؟`)) return;
    await db.remove(d.kind, d.id);
    toast('تم الحذف');
    route();
  },
  fuDone: d => {
    const f = state.records[d.id];
    openForm({
      title: 'تسجيل نتيجة المتابعة',
      fields: [{ name: 'outcome', label: 'نتيجة المتابعة', type: 'textarea', full: true, ph: 'مثال: تحسن الأعراض، يستمر على نفس العلاج' }],
      values: { outcome: f && f.outcome }, submitLabel: 'تمت المتابعة',
      onSubmit: async v => { await db.update('followups', d.id, { status: 'done', outcome: v.outcome }); toast('تم تسجيل المتابعة كمكتملة'); route(); }
    });
  },
  fuMissed: async d => { await db.update('followups', d.id, { status: 'missed' }); toast('تم تسجيل عدم حضور المريض'); route(); },
  fuFilter: d => { state.fuFilter = d.f; if (location.hash !== '#/followups') location.hash = '#/followups'; else route(); },
  print: () => printReport(),
  seed: async (d, el) => {
    el.disabled = true;
    el.textContent = 'جارٍ التحميل…';
    await seedDemo();
    toast('تمت إضافة بيانات تجريبية');
    route();
  }
};

document.addEventListener('click', async e => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const fn = ACT[el.dataset.act];
  if (!fn) return;
  if (el.tagName === 'A') e.preventDefault();
  try { await fn(el.dataset, el, e); } catch (err) { console.error(err); toast(msg(err), 'err'); }
});
document.addEventListener('keydown', e => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('tr[data-act]')) { e.preventDefault(); e.target.click(); }
});

/* ---- التقرير المطبوع ---- */
function printReport() {
  const { p, as, dx, tx, fu } = state.ctx;
  const a = age(p.birth_date);
  const table = (heads, rows) => rows.length ? `<table><thead><tr>${heads.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${esc(c ?? '—')}</td>`).join('')}</tr>`).join('')}</tbody></table>` : '<p>لا توجد سجلات.</p>';
  const vit = x => VITALS.map(([l, u, g]) => { const v = g(x); return v == null ? null : `${l}: ${v}${u ? ' ' + u : ''}`; }).filter(Boolean).join(' | ');
  document.getElementById('print-root').innerHTML = `<div class="report">
    <header><div class="rb">${LOGO}مَسار طِب</div><div>تقرير حالة مريض<br><small>تاريخ الطباعة: ${fmtDate(today())}</small></div></header>
    <h1>${esc(p.full_name)}</h1>
    <table><tbody>
      <tr><th>رقم الملف</th><td>${esc(p.file_no || '—')}</td><th>العمر</th><td>${a != null ? a + ' سنة' : '—'}</td><th>الجنس</th><td>${esc(L.gender[p.gender] || '—')}</td></tr>
      <tr><th>فصيلة الدم</th><td>${esc(p.blood_type || '—')}</td><th>الجوال</th><td>${esc(p.phone || '—')}</td><th>حالة الملف</th><td>${esc(L.pStatus[p.status] || '—')}</td></tr>
      <tr><th>الحساسية</th><td colspan="5">${esc(p.allergies || 'لا توجد')}</td></tr>
      <tr><th>أمراض مزمنة</th><td colspan="5">${esc(p.chronic_conditions || 'لا توجد')}</td></tr>
    </tbody></table>
    <h2>1. التقييم</h2>${table(['التاريخ', 'الشكوى', 'الخطورة', 'العلامات الحيوية', 'الفحص'], as.map(x => [fmtDate(x.visit_date), x.chief_complaint, L.severity[x.severity], vit(x) || '—', x.exam_notes]))}
    <h2>2. التشخيص</h2>${table(['التشخيص', 'ICD-10', 'النوع', 'الحالة', 'ملاحظات'], dx.map(x => [x.title, x.icd_code, L.dxType[x.type], L.dxStatus[x.status], x.notes]))}
    <h2>3. العلاج</h2>${table(['الدواء/الإجراء', 'الجرعة', 'الطريقة', 'التكرار', 'المدة', 'الحالة'], tx.map(x => [x.medication, x.dose, L.route[x.route], x.frequency, x.duration, L.txStatus[x.status]]))}
    <h2>4. المتابعة</h2>${table(['الموعد', 'النوع', 'السبب', 'الحالة', 'النتيجة'], fu.map(x => [fmtDate(x.scheduled_date), L.fuType[x.type], x.reason, L.fuStatus[x.status], x.outcome]))}
    <div class="sig"><span>الطبيب المعالج: د. ${esc(state.user.name)}</span><span>التوقيع: ____________________</span></div>
  </div>`;
  window.print();
}

/* ---- بيانات تجريبية ---- */
async function seedDemo() {
  const P = async v => db.insert('patients', { status: 'active', ...v });
  const ins = (t, v) => db.insert(t, v);

  const p1 = await P({ full_name: 'أحمد محمد العتيبي', file_no: 'MT-10231', gender: 'male', birth_date: '1978-03-12', phone: '0551234567', blood_type: 'A+', allergies: 'البنسلين', chronic_conditions: 'سكري النوع الثاني، ارتفاع الكوليسترول' });
  const a1 = await ins('assessments', { patient_id: p1.id, visit_date: addDays(-12), chief_complaint: 'عطش شديد وكثرة التبول وإرهاق', symptoms: 'الأعراض منذ 3 أسابيع، لا يلتزم بالحمية', severity: 'medium', bp_sys: 138, bp_dia: 86, heart_rate: 88, temperature: 36.9, spo2: 98, resp_rate: 16, weight: 92, height: 172, exam_notes: 'لا علامات جفاف شديد، سكر عشوائي 285 ملغ/دل' });
  const d1 = await ins('diagnoses', { patient_id: p1.id, assessment_id: a1.id, title: 'سكري النوع الثاني غير منضبط', icd_code: 'E11.65', type: 'primary', status: 'confirmed', notes: 'السكر التراكمي 9.4%' });
  await ins('treatments', { patient_id: p1.id, diagnosis_id: d1.id, medication: 'ميتفورمين', dose: '1000 ملغ', route: 'oral', frequency: 'مرتين يومياً', duration: '3 أشهر', start_date: addDays(-12), status: 'active', instructions: 'مع الوجبات، ومتابعة السكر صباحاً' });
  await ins('followups', { patient_id: p1.id, scheduled_date: addDays(-5), type: 'phone', reason: 'التأكد من الالتزام بالدواء', status: 'done', outcome: 'ملتزم، تحسن العطش' });
  await ins('followups', { patient_id: p1.id, scheduled_date: addDays(2), type: 'lab', reason: 'إعادة تحليل السكر التراكمي', status: 'scheduled' });

  const p2 = await P({ full_name: 'سارة خالد الحربي', file_no: 'MT-10244', gender: 'female', birth_date: '1996-07-02', phone: '0567654321', blood_type: 'O+' });
  const a2 = await ins('assessments', { patient_id: p2.id, visit_date: today(), chief_complaint: 'ألم في الحلق وارتفاع في الحرارة', symptoms: 'منذ يومين، صعوبة في البلع، بدون سعال', severity: 'medium', bp_sys: 118, bp_dia: 76, heart_rate: 104, temperature: 38.6, spo2: 97, resp_rate: 18, exam_notes: 'احمرار وتضخم اللوزتين مع إفرازات بيضاء' });
  await ins('diagnoses', { patient_id: p2.id, assessment_id: a2.id, title: 'التهاب البلعوم البكتيري', icd_code: 'J02.0', type: 'primary', status: 'suspected', notes: 'بانتظار نتيجة مسحة الحلق' });

  const p3 = await P({ full_name: 'فهد ناصر القحطاني', file_no: 'MT-10257', gender: 'male', birth_date: '1959-11-20', phone: '0509988776', blood_type: 'B+', chronic_conditions: 'ارتفاع ضغط الدم' });
  await ins('assessments', { patient_id: p3.id, visit_date: addDays(-1), chief_complaint: 'ألم في الصدر وضيق في التنفس', symptoms: 'ألم ضاغط ينتشر للذراع اليسرى منذ ساعتين', severity: 'critical', bp_sys: 165, bp_dia: 100, heart_rate: 112, temperature: 37.1, spo2: 92, resp_rate: 24, weight: 85, height: 175, exam_notes: 'تعرق، يُطلب تخطيط قلب وإنزيمات قلب فوراً' });

  const p4 = await P({ full_name: 'نورة عبدالله الشمري', file_no: 'MT-10262', gender: 'female', birth_date: '1988-05-15', phone: '0543322110', blood_type: 'AB+' });
  const a4 = await ins('assessments', { patient_id: p4.id, visit_date: addDays(-30), chief_complaint: 'صداع متكرر في جهة واحدة', symptoms: 'نوبات 2–3 مرات أسبوعياً مع حساسية للضوء', severity: 'low', bp_sys: 112, bp_dia: 72, heart_rate: 76, temperature: 36.7, spo2: 99 });
  const d4 = await ins('diagnoses', { patient_id: p4.id, assessment_id: a4.id, title: 'صداع نصفي بدون هالة', icd_code: 'G43.0', type: 'primary', status: 'confirmed' });
  await ins('treatments', { patient_id: p4.id, diagnosis_id: d4.id, medication: 'سوماتريبتان', dose: '50 ملغ', route: 'oral', frequency: 'عند بداية النوبة', duration: 'حسب الحاجة', start_date: addDays(-30), status: 'active', instructions: 'تسجيل مواعيد النوبات في مذكرة' });
  await ins('followups', { patient_id: p4.id, scheduled_date: addDays(-4), type: 'clinic', reason: 'تقييم عدد النوبات بعد العلاج', status: 'scheduled' });

  const p5 = await P({ full_name: 'عبدالرحمن سعد الدوسري', file_no: 'MT-10270', gender: 'male', birth_date: '2001-01-09', phone: '0531112233', blood_type: 'O-' });
  const a5 = await ins('assessments', { patient_id: p5.id, visit_date: addDays(-20), chief_complaint: 'التواء في الكاحل الأيمن', severity: 'low', heart_rate: 80, spo2: 99, exam_notes: 'تورم خفيف، لا كسر في الأشعة' });
  const d5 = await ins('diagnoses', { patient_id: p5.id, assessment_id: a5.id, title: 'التواء الكاحل من الدرجة الأولى', icd_code: 'S93.4', type: 'primary', status: 'resolved' });
  await ins('treatments', { patient_id: p5.id, diagnosis_id: d5.id, medication: 'راحة وثلج ورباط ضاغط', route: 'topical', duration: 'أسبوعان', start_date: addDays(-20), status: 'completed' });
  await ins('followups', { patient_id: p5.id, scheduled_date: addDays(-6), type: 'clinic', reason: 'التأكد من الشفاء', status: 'done', outcome: 'شفاء تام' });
  await db.update('patients', p5.id, { status: 'closed' });
}

/* ============ الموجّه (Router) ============ */
async function route() {
  const [, page = 'dashboard', id] = (location.hash.slice(1) || '/dashboard').split('/');
  try {
    state.user = await auth.current();
  } catch (e) { state.user = null; }
  if (!state.user && page !== 'login') { if (location.hash !== '#/login') { location.hash = '#/login'; return; } }
  if (state.user && page === 'login') { location.hash = '#/dashboard'; return; }
  closeModal();
  window.scrollTo(0, 0);
  try {
    if (page === 'login' || !state.user) return renderLogin();
    if (page === 'patients') return await renderPatients();
    if (page === 'patient' && id) return await renderPatient(id);
    if (page === 'followups') return await renderFollowups();
    return await renderDashboard();
  } catch (e) {
    console.error(e);
    app.innerHTML = shell('', `<div class="card">${emptyBox(ICON.alert, 'حدث خطأ', msg(e), `<button type="button" class="btn primary" onclick="location.reload()">إعادة المحاولة</button>`)}</div>`);
  }
}
window.addEventListener('hashchange', route);
if (CLOUD) sb.auth.onAuthStateChange(ev => { if (ev === 'SIGNED_OUT' && location.hash !== '#/login') location.hash = '#/login'; });
route();
})();
