import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from 'hono/cloudflare-workers'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'

type Bindings = {
  DB: D1Database
  RESEND_API_KEY: string
  JWT_SECRET: string
  ALLOWED_EMAILS: string  // カンマ区切りの許可メールアドレス
}

const app = new Hono<{ Bindings: Bindings }>()

app.use('/static/*', serveStatic({ root: './public' }))
app.use('/icons/*', serveStatic({ root: './public' }))
app.use('/api/*', cors())

// ── 認証ユーティリティ ──────────────────────────────────────

/** ランダム6桁OTP生成 */
function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

/** ランダムセッショントークン生成 */
function generateToken(): string {
  const arr = new Uint8Array(32)
  crypto.getRandomValues(arr)
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('')
}

/** セッション検証ミドルウェア */
async function requireAuth(c: any, next: any) {
  const token = getCookie(c, 'session')
  if (!token) {
    return c.redirect('/login')
  }
  const session = await c.env.DB.prepare(
    'SELECT * FROM sessions WHERE token = ? AND expires_at > CURRENT_TIMESTAMP'
  ).bind(token).first() as any

  if (!session) {
    deleteCookie(c, 'session')
    return c.redirect('/login')
  }
  c.set('email', session.email)
  await next()
}

/** メール許可チェック */
function isAllowedEmail(email: string, envAllowed: string, dbAllowed: string[]): boolean {
  const envList = envAllowed ? envAllowed.split(',').map(e => e.trim().toLowerCase()) : []
  return envList.includes(email.toLowerCase()) || dbAllowed.map(e => e.toLowerCase()).includes(email.toLowerCase())
}

// ── 認証 API ───────────────────────────────────────────────

/** OTPリクエスト */
app.post('/auth/request-otp', async (c) => {
  const { email } = await c.req.json()
  if (!email || !email.includes('@')) {
    return c.json({ error: '有効なメールアドレスを入力してください' }, 400)
  }

  // 許可メールチェック
  const { results: dbAllowed } = await c.env.DB.prepare(
    'SELECT email FROM allowed_emails'
  ).all() as { results: { email: string }[] }

  const allowedEnv = c.env.ALLOWED_EMAILS || ''
  if (!isAllowedEmail(email, allowedEnv, dbAllowed.map(r => r.email))) {
    // セキュリティ上、エラーを曖昧にする
    return c.json({ ok: true, message: '登録されたメールアドレスにコードを送信しました' })
  }

  // 古いOTPを削除
  await c.env.DB.prepare(
    'DELETE FROM otp_codes WHERE email = ?'
  ).bind(email).run()

  // OTP生成・保存（10分有効）
  const code = generateOTP()
  await c.env.DB.prepare(
    "INSERT INTO otp_codes (email, code, expires_at) VALUES (?, ?, datetime('now', '+10 minutes'))"
  ).bind(email, code).run()

  // Resendでメール送信
  const resendRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${c.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'おうちダッシュボード <onboarding@resend.dev>',
      to: [email],
      subject: '【おうちダッシュボード】ログインコード',
      html: `
        <div style="font-family:sans-serif;max-width:400px;margin:0 auto;padding:24px;">
          <h2 style="color:#e94560;">🏠 おうちダッシュボード</h2>
          <p>ログインコードです。<strong>10分以内</strong>に入力してください。</p>
          <div style="font-size:2.5rem;font-weight:bold;letter-spacing:8px;text-align:center;
                      padding:20px;background:#1a1a2e;color:#ffd93d;border-radius:12px;margin:20px 0;">
            ${code}
          </div>
          <p style="color:#888;font-size:0.85rem;">
            このメールに心当たりがない場合は無視してください。
          </p>
        </div>
      `,
    }),
  })

  if (!resendRes.ok) {
    console.error('Resend error:', await resendRes.text())
    return c.json({ error: 'メール送信に失敗しました' }, 500)
  }

  return c.json({ ok: true, message: 'コードを送信しました' })
})

/** OTP検証・セッション発行 */
app.post('/auth/verify-otp', async (c) => {
  const { email, code } = await c.req.json()
  if (!email || !code) {
    return c.json({ error: 'メールアドレスとコードが必要です' }, 400)
  }

  const otp = await c.env.DB.prepare(
    'SELECT * FROM otp_codes WHERE email = ? AND code = ? AND expires_at > CURRENT_TIMESTAMP AND used = 0'
  ).bind(email, code.trim()).first() as any

  if (!otp) {
    return c.json({ error: 'コードが無効か期限切れです' }, 401)
  }

  // OTPを使用済みに
  await c.env.DB.prepare(
    'UPDATE otp_codes SET used = 1 WHERE id = ?'
  ).bind(otp.id).run()

  // セッション発行（7日間有効）
  const token = generateToken()
  await c.env.DB.prepare(
    "INSERT INTO sessions (token, email, expires_at) VALUES (?, ?, datetime('now', '+7 days'))"
  ).bind(token, email).run()

  setCookie(c, 'session', token, {
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    maxAge: 60 * 60 * 24 * 7,
    path: '/',
  })

  return c.json({ ok: true })
})

/** ログアウト */
app.post('/auth/logout', async (c) => {
  const token = getCookie(c, 'session')
  if (token) {
    await c.env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run()
  }
  deleteCookie(c, 'session', { path: '/' })
  return c.json({ ok: true })
})

/** 認証状態確認 */
app.get('/auth/me', async (c) => {
  const token = getCookie(c, 'session')
  if (!token) return c.json({ authenticated: false })

  const session = await c.env.DB.prepare(
    'SELECT email FROM sessions WHERE token = ? AND expires_at > CURRENT_TIMESTAMP'
  ).bind(token).first() as any

  if (!session) return c.json({ authenticated: false })
  return c.json({ authenticated: true, email: session.email })
})

// ── ログインページ ─────────────────────────────────────────

app.get('/login', (c) => {
  const html = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<title>ログイン - おうちダッシュボード</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css">
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --bg: #0f0e17;
    --panel: #16213e;
    --card: #0f3460;
    --accent: #e94560;
    --text: #fffffe;
    --muted: #a7a9be;
    --border: #2a2a4a;
    --yellow: #ffd93d;
  }
  html, body {
    width: 100%; height: 100%;
    background: var(--bg);
    color: var(--text);
    font-family: -apple-system, 'Hiragino Sans', 'Yu Gothic UI', sans-serif;
    display: flex; align-items: center; justify-content: center;
    overflow: hidden;
  }
  .login-wrap {
    width: 100%; max-width: 400px;
    padding: 20px;
  }
  .login-box {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 20px;
    padding: 40px 32px;
    box-shadow: 0 8px 40px rgba(0,0,0,.6);
    text-align: center;
  }
  .logo {
    font-size: 2.5rem;
    margin-bottom: 8px;
  }
  .app-title {
    font-size: 1.3rem;
    font-weight: 700;
    color: var(--accent);
    margin-bottom: 4px;
  }
  .app-sub {
    font-size: 0.8rem;
    color: var(--muted);
    margin-bottom: 32px;
  }
  .step { display: none; }
  .step.active { display: block; }
  label {
    display: block;
    text-align: left;
    font-size: 0.82rem;
    color: var(--muted);
    margin-bottom: 6px;
  }
  input {
    width: 100%;
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 12px 14px;
    color: var(--text);
    font-size: 1rem;
    outline: none;
    margin-bottom: 16px;
    -webkit-user-select: text;
    user-select: text;
    touch-action: auto;
  }
  input:focus { border-color: var(--accent); }
  input.otp-input {
    font-size: 2rem;
    font-weight: 700;
    letter-spacing: 12px;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }
  .btn {
    width: 100%;
    padding: 13px;
    border: none;
    border-radius: 10px;
    font-size: 1rem;
    font-weight: 700;
    cursor: pointer;
    transition: all .2s;
    background: var(--accent);
    color: #fff;
    margin-bottom: 10px;
  }
  .btn:hover { background: #c0392b; }
  .btn:disabled { background: var(--border); color: var(--muted); cursor: not-allowed; }
  .btn-secondary {
    background: transparent;
    border: 1px solid var(--border);
    color: var(--muted);
    font-size: 0.85rem;
    padding: 10px;
  }
  .btn-secondary:hover { border-color: var(--muted); color: var(--text); background: transparent; }
  .message {
    font-size: 0.82rem;
    padding: 10px;
    border-radius: 8px;
    margin-bottom: 14px;
    display: none;
  }
  .message.error   { background: rgba(233,69,96,.15); color: var(--accent); border: 1px solid var(--accent); }
  .message.success { background: rgba(107,203,119,.15); color: #6bcb77; border: 1px solid #6bcb77; }
  .email-hint {
    font-size: 0.8rem;
    color: var(--muted);
    margin-bottom: 16px;
  }
  .email-hint strong { color: var(--text); }
  .timer {
    font-size: 0.78rem;
    color: var(--muted);
    margin-bottom: 12px;
  }
  .timer.urgent { color: var(--accent); }
  .loading { display: inline-block; }
  .loading::after {
    content: '';
    display: inline-block;
    width: 12px; height: 12px;
    border: 2px solid rgba(255,255,255,.3);
    border-top-color: #fff;
    border-radius: 50%;
    animation: spin .7s linear infinite;
    margin-left: 8px;
    vertical-align: middle;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
</head>
<body>
<div class="login-wrap">
  <div class="login-box">
    <div class="logo">🏠</div>
    <div class="app-title">おうちダッシュボード</div>
    <div class="app-sub">ログインしてください</div>

    <div id="msg" class="message"></div>

    <!-- Step 1: メールアドレス入力 -->
    <div id="step1" class="step active">
      <label for="email">メールアドレス</label>
      <input id="email" type="email" placeholder="your@email.com" autocomplete="email" inputmode="email">
      <button id="send-btn" class="btn" onclick="sendOTP()">
        <i class="fas fa-paper-plane"></i> コードを送信
      </button>
    </div>

    <!-- Step 2: OTP入力 -->
    <div id="step2" class="step">
      <div class="email-hint">
        <strong id="email-display"></strong> に<br>6桁のコードを送信しました
      </div>
      <div id="timer" class="timer"></div>
      <label for="otp">確認コード</label>
      <input id="otp" class="otp-input" type="tel" placeholder="000000" maxlength="6" inputmode="numeric" autocomplete="one-time-code">
      <button id="verify-btn" class="btn" onclick="verifyOTP()">
        <i class="fas fa-check"></i> ログイン
      </button>
      <button class="btn btn-secondary" onclick="backToEmail()">
        <i class="fas fa-arrow-left"></i> 戻る
      </button>
    </div>
  </div>
</div>

<script>
let currentEmail = '';
let timerInterval = null;
let expiresAt = null;

function showMsg(text, type) {
  const el = document.getElementById('msg');
  el.textContent = text;
  el.className = 'message ' + type;
  el.style.display = 'block';
}
function hideMsg() {
  document.getElementById('msg').style.display = 'none';
}

async function sendOTP() {
  const email = document.getElementById('email').value.trim();
  if (!email || !email.includes('@')) {
    showMsg('有効なメールアドレスを入力してください', 'error');
    return;
  }
  const btn = document.getElementById('send-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="loading">送信中</span>';
  hideMsg();

  try {
    const res = await fetch('/auth/request-otp', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ email })
    });
    const data = await res.json();
    if (!res.ok) {
      showMsg(data.error || 'エラーが発生しました', 'error');
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-paper-plane"></i> コードを送信';
      return;
    }
    currentEmail = email;
    document.getElementById('email-display').textContent = email;
    document.getElementById('step1').classList.remove('active');
    document.getElementById('step2').classList.add('active');
    hideMsg();
    startTimer(10 * 60);
    setTimeout(() => document.getElementById('otp').focus(), 100);
  } catch(e) {
    showMsg('通信エラーが発生しました', 'error');
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-paper-plane"></i> コードを送信';
  }
}

async function verifyOTP() {
  const code = document.getElementById('otp').value.trim();
  if (code.length !== 6) {
    showMsg('6桁のコードを入力してください', 'error');
    return;
  }
  const btn = document.getElementById('verify-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="loading">確認中</span>';
  hideMsg();

  try {
    const res = await fetch('/auth/verify-otp', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ email: currentEmail, code })
    });
    const data = await res.json();
    if (!res.ok) {
      showMsg(data.error || 'コードが正しくありません', 'error');
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-check"></i> ログイン';
      document.getElementById('otp').value = '';
      document.getElementById('otp').focus();
      return;
    }
    clearInterval(timerInterval);
    showMsg('ログイン成功！', 'success');
    setTimeout(() => { window.location.href = '/'; }, 800);
  } catch(e) {
    showMsg('通信エラーが発生しました', 'error');
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-check"></i> ログイン';
  }
}

function backToEmail() {
  clearInterval(timerInterval);
  document.getElementById('step2').classList.remove('active');
  document.getElementById('step1').classList.add('active');
  document.getElementById('otp').value = '';
  document.getElementById('send-btn').disabled = false;
  document.getElementById('send-btn').innerHTML = '<i class="fas fa-paper-plane"></i> コードを送信';
  hideMsg();
}

function startTimer(seconds) {
  const timerEl = document.getElementById('timer');
  let remaining = seconds;
  const update = () => {
    const m = Math.floor(remaining / 60);
    const s = remaining % 60;
    timerEl.textContent = \`有効期限: \${m}:\${String(s).padStart(2,'0')}\`;
    timerEl.className = 'timer' + (remaining <= 60 ? ' urgent' : '');
    if (remaining <= 0) {
      clearInterval(timerInterval);
      timerEl.textContent = 'コードの有効期限が切れました';
      timerEl.className = 'timer urgent';
      document.getElementById('verify-btn').disabled = true;
    }
    remaining--;
  };
  update();
  timerInterval = setInterval(update, 1000);
}

// Enterキー対応
document.getElementById('email').addEventListener('keydown', e => { if (e.key === 'Enter') sendOTP(); });
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('otp')?.addEventListener('keydown', e => { if (e.key === 'Enter') verifyOTP(); });
});
</script>
</body>
</html>`
  return c.html(html)
})

// ── 静的ファイル・PWA ──────────────────────────────────────

app.get('/manifest.json', (c) => {
  return c.json({
    name: 'おうちダッシュボード',
    short_name: 'おうち',
    description: '家庭内情報端末',
    start_url: '/',
    display: 'standalone',
    orientation: 'landscape',
    background_color: '#1a1a2e',
    theme_color: '#16213e',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/icon-apple.png', sizes: '180x180', type: 'image/png', purpose: 'apple-touch-icon' }
    ]
  }, 200, { 'Content-Type': 'application/manifest+json' })
})

app.get('/sw.js', (c) => {
  const sw = `
const CACHE = 'ouchi-v1';
const STATIC = ['/login', '/static/style.css', '/static/app.js'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(STATIC)));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) {
    e.respondWith(fetch(e.request));
    return;
  }
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
`
  return new Response(sw, {
    headers: { 'Content-Type': 'application/javascript; charset=utf-8' }
  })
})

// ── API（認証必須）────────────────────────────────────────

app.use('/api/*', requireAuth)

// メモ
app.get('/api/memos', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM memos ORDER BY pinned DESC, updated_at DESC'
  ).all()
  return c.json(results)
})
app.post('/api/memos', async (c) => {
  const { content, color = 'yellow' } = await c.req.json()
  if (!content?.trim()) return c.json({ error: '内容が必要です' }, 400)
  const r = await c.env.DB.prepare(
    'INSERT INTO memos (content, color) VALUES (?, ?) RETURNING *'
  ).bind(content.trim(), color).first()
  return c.json(r, 201)
})
app.put('/api/memos/:id', async (c) => {
  const id = c.req.param('id')
  const { content, color, pinned } = await c.req.json()
  await c.env.DB.prepare(
    `UPDATE memos SET
       content = COALESCE(?, content),
       color   = COALESCE(?, color),
       pinned  = COALESCE(?, pinned),
       updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  ).bind(content ?? null, color ?? null, pinned !== undefined ? (pinned ? 1 : 0) : null, id).run()
  return c.json({ ok: true })
})
app.delete('/api/memos/:id', async (c) => {
  await c.env.DB.prepare('DELETE FROM memos WHERE id = ?').bind(c.req.param('id')).run()
  return c.json({ ok: true })
})

// タスク
app.get('/api/tasks', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM tasks ORDER BY done ASC, priority DESC, created_at ASC'
  ).all()
  return c.json(results)
})
app.post('/api/tasks', async (c) => {
  const { title, due_date, priority = 'normal' } = await c.req.json()
  if (!title?.trim()) return c.json({ error: 'タイトルが必要です' }, 400)
  const r = await c.env.DB.prepare(
    'INSERT INTO tasks (title, due_date, priority) VALUES (?, ?, ?) RETURNING *'
  ).bind(title.trim(), due_date ?? null, priority).first()
  return c.json(r, 201)
})
app.put('/api/tasks/:id', async (c) => {
  const id = c.req.param('id')
  const { title, done, due_date, priority } = await c.req.json()
  await c.env.DB.prepare(
    `UPDATE tasks SET
       title     = COALESCE(?, title),
       done      = COALESCE(?, done),
       due_date  = COALESCE(?, due_date),
       priority  = COALESCE(?, priority),
       updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  ).bind(title ?? null, done !== undefined ? (done ? 1 : 0) : null, due_date ?? null, priority ?? null, id).run()
  return c.json({ ok: true })
})
app.delete('/api/tasks/:id', async (c) => {
  await c.env.DB.prepare('DELETE FROM tasks WHERE id = ?').bind(c.req.param('id')).run()
  return c.json({ ok: true })
})

// カレンダーイベント
app.get('/api/events', async (c) => {
  const month = c.req.query('month')
  let query = 'SELECT * FROM events'
  const params: string[] = []
  if (month) {
    query += " WHERE date LIKE ? OR repeat_type != 'none'"
    params.push(`${month}%`)
  }
  query += ' ORDER BY date ASC, time ASC'
  const { results } = await c.env.DB.prepare(query).bind(...params).all()
  return c.json(results)
})
app.post('/api/events', async (c) => {
  const { title, date, time, color = 'blue', repeat_type = 'none' } = await c.req.json()
  if (!title?.trim() || !date) return c.json({ error: '必須項目が不足しています' }, 400)
  const r = await c.env.DB.prepare(
    'INSERT INTO events (title, date, time, color, repeat_type) VALUES (?, ?, ?, ?, ?) RETURNING *'
  ).bind(title.trim(), date, time ?? null, color, repeat_type).first()
  return c.json(r, 201)
})
app.delete('/api/events/:id', async (c) => {
  await c.env.DB.prepare('DELETE FROM events WHERE id = ?').bind(c.req.param('id')).run()
  return c.json({ ok: true })
})

// 設定
app.get('/api/settings', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM settings').all()
  const obj: Record<string, string> = {}
  for (const r of results as { key: string; value: string }[]) {
    obj[r.key] = r.value
  }
  return c.json(obj)
})
app.put('/api/settings', async (c) => {
  const body = await c.req.json() as Record<string, string>
  const stmt = c.env.DB.prepare(
    'INSERT INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP'
  )
  for (const [k, v] of Object.entries(body)) {
    await stmt.bind(k, String(v)).run()
  }
  return c.json({ ok: true })
})

// ── メインHTML（認証必須）────────────────────────────────

app.get('/', requireAuth, (c) => {
  const email = c.get('email') as string
  const html = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="おうち">
<meta name="mobile-web-app-capable" content="yes">
<meta name="theme-color" content="#16213e">
<title>おうちダッシュボード</title>
<link rel="manifest" href="/manifest.json">
<link rel="apple-touch-icon" href="/icons/icon-apple.png">
<link rel="stylesheet" href="/static/style.css">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css">
</head>
<body>
<div id="app">
  <header id="main-header">
    <div id="clock-section">
      <div id="clock">00:00</div>
      <div id="date-display">読み込み中...</div>
    </div>
    <div id="header-center">
      <span id="family-name">おうちダッシュボード</span>
    </div>
    <div id="weather-section">
      <div id="weather-icon"><i class="fas fa-cloud fa-2x"></i></div>
      <div id="weather-info">
        <span id="weather-temp">--°C</span>
        <span id="weather-desc">--</span>
      </div>
    </div>
  </header>

  <main id="main-content">
    <section id="calendar-section" class="panel">
      <div class="panel-header">
        <button id="cal-prev" class="icon-btn"><i class="fas fa-chevron-left"></i></button>
        <h2 id="cal-title">2025年1月</h2>
        <button id="cal-next" class="icon-btn"><i class="fas fa-chevron-right"></i></button>
        <button id="cal-add-btn" class="icon-btn add-btn" title="予定追加"><i class="fas fa-plus"></i></button>
      </div>
      <div id="calendar-grid"></div>
      <div id="event-list"></div>
    </section>

    <section id="memo-section" class="panel">
      <div class="panel-header">
        <h2><i class="fas fa-sticky-note"></i> メモ</h2>
        <button id="memo-add-btn" class="icon-btn add-btn"><i class="fas fa-plus"></i></button>
      </div>
      <div id="memo-list"></div>
    </section>

    <section id="task-section" class="panel">
      <div class="panel-header">
        <h2><i class="fas fa-tasks"></i> タスク</h2>
        <button id="task-add-btn" class="icon-btn add-btn"><i class="fas fa-plus"></i></button>
      </div>
      <div id="task-list"></div>
    </section>
  </main>

  <footer id="main-footer">
    <button id="settings-btn" class="footer-btn"><i class="fas fa-cog"></i> 設定</button>
    <div id="footer-status"><span id="last-update">--</span></div>
    <div style="display:flex;gap:8px;align-items:center;">
      <span style="font-size:0.72rem;color:#a7a9be;">${email}</span>
      <button id="logout-btn" class="footer-btn"><i class="fas fa-sign-out-alt"></i> ログアウト</button>
      <button id="refresh-btn" class="footer-btn"><i class="fas fa-sync-alt"></i> 更新</button>
    </div>
  </footer>
</div>

<!-- モーダル: メモ -->
<div id="memo-modal" class="modal hidden">
  <div class="modal-box">
    <h3><i class="fas fa-sticky-note"></i> メモ</h3>
    <textarea id="memo-content" placeholder="メモを入力..." rows="5"></textarea>
    <div class="color-picker">
      <span>色:</span>
      <button class="color-btn" data-color="yellow" style="background:#ffd93d">黄</button>
      <button class="color-btn" data-color="green"  style="background:#6bcb77">緑</button>
      <button class="color-btn" data-color="blue"   style="background:#4d96ff">青</button>
      <button class="color-btn" data-color="pink"   style="background:#ff6b9d">ピンク</button>
      <button class="color-btn" data-color="orange" style="background:#ff9f43">橙</button>
    </div>
    <div class="modal-actions">
      <button id="memo-cancel" class="btn btn-secondary">キャンセル</button>
      <button id="memo-save"   class="btn btn-primary">保存</button>
    </div>
  </div>
</div>

<!-- モーダル: タスク -->
<div id="task-modal" class="modal hidden">
  <div class="modal-box">
    <h3><i class="fas fa-tasks"></i> タスク追加</h3>
    <input id="task-title" type="text" placeholder="タスク名..." class="modal-input">
    <input id="task-due"   type="date" class="modal-input">
    <div class="priority-picker">
      <span>優先度:</span>
      <button class="prio-btn active" data-priority="normal">普通</button>
      <button class="prio-btn" data-priority="high">高</button>
      <button class="prio-btn" data-priority="low">低</button>
    </div>
    <div class="modal-actions">
      <button id="task-cancel" class="btn btn-secondary">キャンセル</button>
      <button id="task-save"   class="btn btn-primary">保存</button>
    </div>
  </div>
</div>

<!-- モーダル: イベント -->
<div id="event-modal" class="modal hidden">
  <div class="modal-box">
    <h3><i class="fas fa-calendar-plus"></i> 予定追加</h3>
    <input id="event-title" type="text"  placeholder="予定タイトル..." class="modal-input">
    <input id="event-date"  type="date"  class="modal-input">
    <input id="event-time"  type="time"  class="modal-input">
    <div class="color-picker">
      <span>色:</span>
      <button class="color-btn" data-color="blue"   style="background:#4d96ff">青</button>
      <button class="color-btn" data-color="green"  style="background:#6bcb77">緑</button>
      <button class="color-btn" data-color="pink"   style="background:#ff6b9d">ピンク</button>
      <button class="color-btn" data-color="orange" style="background:#ff9f43">橙</button>
      <button class="color-btn" data-color="purple" style="background:#a29bfe">紫</button>
    </div>
    <div class="modal-actions">
      <button id="event-cancel" class="btn btn-secondary">キャンセル</button>
      <button id="event-save"   class="btn btn-primary">保存</button>
    </div>
  </div>
</div>

<!-- モーダル: 設定 -->
<div id="settings-modal" class="modal hidden">
  <div class="modal-box settings-box">
    <h3><i class="fas fa-cog"></i> 設定</h3>
    <label>家族名
      <input id="set-family" type="text" class="modal-input" placeholder="おうち">
    </label>
    <label>天気 OpenWeatherMap APIキー
      <input id="set-weather-key" type="text" class="modal-input" placeholder="APIキーを入力...">
    </label>
    <label>都市名 (英語)
      <input id="set-city" type="text" class="modal-input" placeholder="Tokyo">
    </label>
    <p class="settings-note">
      <i class="fas fa-info-circle"></i>
      天気を表示するには <a href="https://openweathermap.org/api" target="_blank">openweathermap.org</a> の無料APIキーが必要です。
    </p>
    <div class="modal-actions">
      <button id="settings-cancel" class="btn btn-secondary">閉じる</button>
      <button id="settings-save"   class="btn btn-primary">保存</button>
    </div>
  </div>
</div>

<script src="/static/app.js"></script>
</body>
</html>`
  return c.html(html)
})

export default app
