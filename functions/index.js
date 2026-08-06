import express from 'express';
import { Readable } from 'node:stream';
import { initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { onRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret, projectID } from 'firebase-functions/params';
import { setGlobalOptions } from 'firebase-functions/v2/options';

initializeApp();
const db = getFirestore();
const REGION = 'asia-east1';
const LEAD_RECIPIENT = 'wangbing3526@163.com';
const RESEND_FROM = '奈斯教育官网 <leads@notify.niceeducationglobal.com>';
const ALLOWED_ORIGINS = [
  'https://niceeducationglobal.com',
  'https://www.niceeducationglobal.com',
  'http://localhost:8080',
  'http://127.0.0.1:8080'
];
const LEAD_SOURCES = new Set(['website_form', 'ai_chat']);
const LEAD_STATUSES = new Set(['new', 'contacted', 'following', 'converted', 'closed']);

const DEEPSEEK_API_KEY = defineSecret('DEEPSEEK_API_KEY');
const RESEND_API_KEY = defineSecret('RESEND_API_KEY');
const ADMIN_PASSWORD = defineSecret('ADMIN_PASSWORD');

setGlobalOptions({
  region: REGION,
  maxInstances: 10,
  memory: '256MiB',
  timeoutSeconds: 120
});

const SYSTEM_PROMPT = `你是奈斯教育（NICE EDUCATION）的官网 AI 留学顾问。
你的任务是用简洁、温和、专业的中文回答留学规划、国际教育、升学申请、背景提升和职业规划相关问题，并根据用户语言自然切换中文或英文。

工作原则：
1. 先理解学生当前年级、意向国家/地区、目标学段和主要困惑，再给出方向性建议。
2. 不承诺录取、签证、奖学金或具体结果；不编造院校政策、录取率、费用和截止日期。信息可能变化时明确建议以学校或官方最新信息为准。
3. 不提供法律、医疗或财务方面的确定性意见。
4. 不索取身份证号、护照号、银行卡、账号密码等敏感信息。
5. 当用户希望预约、联系老师、留下电话或微信时，引导其点击聊天窗口中的“预约顾问咨询”填写信息，不要在普通对话中反复索取联系方式。
6. 如果问题需要结合完整背景判断，说明 AI 只能提供初步建议，并建议预约真人顾问。
7. 回复以 2 至 5 个短段落为主，避免冗长。`;

function clean(value, maxLength = 500) {
  return String(value ?? '').trim().replace(/\u0000/g, '').slice(0, maxLength);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function isLikelyContact(value) {
  const contact = clean(value, 120);
  return contact.length >= 5 && /[0-9a-zA-Z_@+\-]/.test(contact);
}

function clientKey(req) {
  return clean(req.get('CF-Connecting-IP') || req.get('X-Forwarded-For')?.split(',')[0] || req.ip || 'unknown', 100);
}

const rateBuckets = new Map();
function isRateLimited(req, limit, windowMs) {
  const now = Date.now();
  const key = `${clientKey(req)}:${req.path}`;
  const bucket = rateBuckets.get(key);
  if (!bucket || now - bucket.startedAt > windowMs) {
    rateBuckets.set(key, { startedAt: now, count: 1 });
    return false;
  }
  bucket.count += 1;
  return bucket.count > limit;
}

function adminUrl() {
  return `https://${REGION}-${projectID.value()}.cloudfunctions.net/api/admin`;
}

async function sendLeadEmail(lead) {
  const sourceLabel = lead.source === 'ai_chat' ? 'AI 聊天窗口' : '官网咨询表单';
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${RESEND_API_KEY.value()}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      from: RESEND_FROM,
      to: [LEAD_RECIPIENT],
      subject: `【官网新咨询】${lead.name}｜${lead.stage || '阶段未填写'}｜${lead.plan || '方向未填写'}`,
      html: `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC',sans-serif;color:#10233a;line-height:1.7;max-width:680px;margin:auto">
          <h2 style="margin:0 0 18px">奈斯教育官网收到新咨询</h2>
          <table style="width:100%;border-collapse:collapse;background:#f5f7f8">
            <tr><td style="padding:10px 14px;width:110px">来源</td><td style="padding:10px 14px"><b>${escapeHtml(sourceLabel)}</b></td></tr>
            <tr><td style="padding:10px 14px">姓名</td><td style="padding:10px 14px">${escapeHtml(lead.name)}</td></tr>
            <tr><td style="padding:10px 14px">电话或微信</td><td style="padding:10px 14px"><b>${escapeHtml(lead.contact)}</b></td></tr>
            <tr><td style="padding:10px 14px">当前阶段</td><td style="padding:10px 14px">${escapeHtml(lead.stage || '—')}</td></tr>
            <tr><td style="padding:10px 14px">计划方向</td><td style="padding:10px 14px">${escapeHtml(lead.plan || '—')}</td></tr>
            <tr><td style="padding:10px 14px">咨询内容</td><td style="padding:10px 14px;white-space:pre-wrap">${escapeHtml(lead.message || '—')}</td></tr>
            <tr><td style="padding:10px 14px">提交时间</td><td style="padding:10px 14px">${escapeHtml(lead.createdAt)}</td></tr>
          </table>
          <p style="margin:20px 0"><a href="${escapeHtml(adminUrl())}" style="display:inline-block;background:#10233a;color:white;text-decoration:none;padding:11px 18px;border-radius:8px">打开线索后台</a></p>
          <p style="color:#687789;font-size:12px">本邮件由奈斯教育官网自动发送，请勿将学生联系方式转发给无关人员。</p>
        </div>`
    })
  });

  if (!response.ok) {
    console.error('Resend error', response.status, clean(await response.text(), 500));
    return false;
  }
  return true;
}

function adminAuthorized(req) {
  const header = req.get('Authorization') || '';
  if (!header.startsWith('Basic ')) return false;
  try {
    const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
    const separator = decoded.indexOf(':');
    return decoded.slice(0, separator) === 'niceadmin' && decoded.slice(separator + 1) === ADMIN_PASSWORD.value();
  } catch {
    return false;
  }
}

function requireAdmin(res) {
  res.set('WWW-Authenticate', 'Basic realm="NICE Education Leads", charset="UTF-8"');
  return res.status(401).send('需要后台账号和密码');
}

function dateLabel(value) {
  if (!value) return '—';
  const date = typeof value.toDate === 'function' ? value.toDate() : new Date(value);
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
  }).format(date);
}

function adminPage(rows) {
  const statusLabels = { new: '新线索', contacted: '已联系', following: '跟进中', converted: '已转化', closed: '已关闭' };
  const tableRows = rows.map((lead) => `
    <tr>
      <td><span class="source">${lead.source === 'ai_chat' ? 'AI 聊天' : '官网表单'}</span><small>${escapeHtml(dateLabel(lead.createdAt))}</small></td>
      <td><strong>${escapeHtml(lead.name)}</strong><br>${escapeHtml(lead.contact)}</td>
      <td>${escapeHtml(lead.stage || '—')}<br><small>${escapeHtml(lead.plan || '—')}</small></td>
      <td class="message">${escapeHtml(lead.message || '—')}</td>
      <td>${lead.emailSentAt ? '<span class="mail sent">已通知</span>' : '<span class="mail pending">待重试</span>'}</td>
      <td>
        <form method="post">
          <input type="hidden" name="leadId" value="${escapeHtml(lead.id)}">
          <select name="status" onchange="this.form.submit()">
            ${Object.entries(statusLabels).map(([value, label]) => `<option value="${value}"${lead.status === value ? ' selected' : ''}>${label}</option>`).join('')}
          </select>
        </form>
      </td>
    </tr>`).join('');

  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>奈斯教育 · 咨询线索</title><style>
    :root{color-scheme:light;--ink:#0a1423;--mint:#b9ded1;--paper:#f3f2ec}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif}.wrap{width:min(1440px,calc(100% - 32px));margin:38px auto}header{display:flex;justify-content:space-between;align-items:end;margin-bottom:24px}h1{margin:0;font-size:clamp(30px,4vw,54px);letter-spacing:-.05em}header p{margin:0;color:#667385}.card{overflow:auto;border:1px solid #d8d9d5;background:white;box-shadow:0 18px 50px rgba(10,20,35,.08)}table{width:100%;border-collapse:collapse;min-width:1080px}th,td{text-align:left;vertical-align:top;padding:16px;border-bottom:1px solid #e5e7e8;font-size:14px}th{position:sticky;top:0;background:#10233a;color:#fff;font-size:12px;letter-spacing:.08em}small{display:block;margin-top:6px;color:#738092}.source,.mail{display:inline-block;padding:4px 8px;border-radius:99px;font-size:11px;font-weight:700}.source,.mail.sent{background:var(--mint)}.mail.pending{background:#ffe0b2;color:#8a5110}.message{max-width:420px;white-space:pre-wrap;line-height:1.65}select{width:100%;padding:8px;border:1px solid #ccd2d6;background:white;border-radius:6px}@media(max-width:640px){.wrap{margin-top:20px}header{display:block}header p{margin-top:8px}}
  </style></head><body><main class="wrap"><header><div><h1>咨询线索</h1><p>奈斯教育官网 · 共 ${rows.length} 条</p></div><p>刷新页面查看最新提交</p></header><section class="card"><table><thead><tr><th>来源 / 时间</th><th>学生 / 联系方式</th><th>阶段 / 方向</th><th>咨询内容</th><th>邮件</th><th>跟进状态</th></tr></thead><tbody>${tableRows || '<tr><td colspan="6">暂无线索</td></tr>'}</tbody></table></section></main></body></html>`;
}

async function readLeads() {
  const snapshot = await db.collection('leads').orderBy('createdAt', 'desc').limit(500).get();
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '32kb' }));
app.use(express.urlencoded({ extended: false, limit: '8kb' }));

app.get('/health', (_req, res) => res.json({ ok: true, service: 'nice-education-firebase-api' }));

app.post('/chat', async (req, res) => {
  if (isRateLimited(req, 20, 60_000)) return res.status(429).json({ error: '请求过于频繁，请稍后再试。' });
  const rawMessages = Array.isArray(req.body?.messages) ? req.body.messages : [];
  const messages = rawMessages
    .slice(-10)
    .map((message) => ({
      role: message?.role === 'assistant' ? 'assistant' : 'user',
      content: clean(message?.content, 1800)
    }))
    .filter((message) => message.content);
  if (!messages.length) return res.status(400).json({ error: '请输入需要咨询的问题。' });

  try {
    const upstream = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${DEEPSEEK_API_KEY.value()}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'deepseek-v4-flash',
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
        thinking: { type: 'disabled' },
        stream: true,
        stream_options: { include_usage: true },
        temperature: 0.35,
        max_tokens: 650,
        user_id: clean(req.body?.sessionId, 120).replace(/[^a-zA-Z0-9_-]/g, '') || undefined
      })
    });
    if (!upstream.ok || !upstream.body) {
      console.error('DeepSeek error', upstream.status, clean(await upstream.text(), 500));
      return res.status(502).json({ error: 'AI 顾问暂时繁忙，请稍后再试。' });
    }
    res.status(200);
    res.set({
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Content-Type-Options': 'nosniff'
    });
    res.flushHeaders();
    Readable.fromWeb(upstream.body).pipe(res);
  } catch (error) {
    console.error('Chat error', error);
    if (!res.headersSent) res.status(500).json({ error: 'AI 顾问暂时无法连接，请稍后再试。' });
    else res.end();
  }
});

app.post('/leads', async (req, res) => {
  if (isRateLimited(req, 6, 10 * 60_000)) return res.status(429).json({ error: '提交过于频繁，请稍后再试。' });
  if (clean(req.body?.website, 120)) return res.status(201).json({ ok: true });

  const lead = {
    source: LEAD_SOURCES.has(req.body?.source) ? req.body.source : 'website_form',
    name: clean(req.body?.name, 80),
    contact: clean(req.body?.contact || req.body?.phone, 120),
    stage: clean(req.body?.stage, 80),
    plan: clean(req.body?.plan || req.body?.goal, 100),
    message: clean(req.body?.message, 2400),
    consent: req.body?.consent === true || req.body?.consent === 'true' || req.body?.consent === 'on',
    status: 'new',
    emailSentAt: null,
    emailAttempts: 0,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: null
  };

  if (!lead.name || !isLikelyContact(lead.contact)) return res.status(400).json({ error: '请填写姓名和有效的电话、微信或邮箱。' });
  if (!lead.consent) return res.status(400).json({ error: '请先同意我们使用所填信息与您联系。' });

  try {
    const docRef = db.collection('leads').doc();
    await docRef.set(lead);
    const emailSent = await sendLeadEmail({ ...lead, createdAt: new Date().toISOString() });
    await docRef.update({
      emailSentAt: emailSent ? FieldValue.serverTimestamp() : null,
      emailAttempts: FieldValue.increment(1)
    });
    return res.status(201).json({ ok: true, id: docRef.id, emailSent });
  } catch (error) {
    console.error('Lead error', error);
    return res.status(500).json({ error: '服务暂时不可用，请稍后再试。' });
  }
});

app.all('/admin', async (req, res) => {
  if (!adminAuthorized(req)) return requireAdmin(res);
  res.set({
    'Cache-Control': 'no-store',
    'X-Frame-Options': 'DENY',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"
  });
  try {
    if (req.method === 'POST') {
      const status = clean(req.body?.status, 30);
      const leadId = clean(req.body?.leadId, 100);
      if (!LEAD_STATUSES.has(status) || !leadId) return res.status(400).send('Invalid status');
      await db.collection('leads').doc(leadId).update({ status, updatedAt: FieldValue.serverTimestamp() });
    }
    return res.status(200).type('html').send(adminPage(await readLeads()));
  } catch (error) {
    console.error('Admin error', error);
    return res.status(500).send('后台暂时无法读取');
  }
});

app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

export const api = onRequest({
  cors: ALLOWED_ORIGINS,
  secrets: [DEEPSEEK_API_KEY, RESEND_API_KEY, ADMIN_PASSWORD]
}, app);

export const retryLeadEmails = onSchedule({
  schedule: 'every 5 minutes',
  timeZone: 'Asia/Shanghai',
  secrets: [RESEND_API_KEY]
}, async () => {
  const snapshot = await db.collection('leads').where('emailSentAt', '==', null).limit(50).get();
  for (const doc of snapshot.docs) {
    const lead = doc.data();
    if ((lead.emailAttempts || 0) >= 5) continue;
    const emailSent = await sendLeadEmail({
      ...lead,
      createdAt: dateLabel(lead.createdAt)
    });
    await doc.ref.update({
      emailSentAt: emailSent ? FieldValue.serverTimestamp() : null,
      emailAttempts: FieldValue.increment(1)
    });
  }
});
