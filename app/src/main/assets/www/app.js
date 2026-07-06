/* ================= LexTV 词境 ================= */
"use strict";
const $ = id => document.getElementById(id);
const NOW = () => Date.now();
const DAY = 86400000;
const todayStr = (t) => { const d = new Date(t || NOW()); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[a[i], a[j]] = [a[j], a[i]]; } return a; };
const esc = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/* ---------- Bridge(浏览器调试降级) ---------- */
const NativeBridge = window.Bridge || {
  speak: (t, r) => { try { const u = new SpeechSynthesisUtterance(t); u.lang = "en-US"; u.rate = r; speechSynthesis.cancel(); speechSynthesis.speak(u); } catch (e) { } },
  stopSpeak: () => { try { speechSynthesis.cancel(); } catch (e) { } },
  isTtsReady: () => true,
  save: (k, v) => localStorage.setItem("lex_" + k, v),
  load: (k) => localStorage.getItem("lex_" + k) || "",
  getDecks: () => "[]",
  readDeckFile: () => "[]",
  exitApp: () => { }
};
let ttsOK = true;
window.onTtsReady = ok => { ttsOK = !!ok; };

/* ---------- 状态 ---------- */
let WORDS = {};          // w -> {w,p,m,x,deck}
let DECKS = [];          // {id,name,icon,files,source,total}
let P = null;            // progress
const DEFAULTS = { xp: 0, streak: 0, lastDay: "", dayLog: {}, dayNew: {}, words: {}, decksOff: {}, set: { newPerDay: 20, tts: 1, auto: 1, rate: 0.9 } };

function loadP() {
  try { const s = NativeBridge.load("progress"); P = s ? JSON.parse(s) : null; } catch (e) { P = null; }
  if (!P) P = JSON.parse(JSON.stringify(DEFAULTS));
  P.set = Object.assign({}, DEFAULTS.set, P.set || {});
  ["dayLog", "dayNew", "words", "decksOff"].forEach(k => { if (!P[k]) P[k] = {}; });
}
let saveTimer = null;
function saveP() { clearTimeout(saveTimer); saveTimer = setTimeout(() => { try { NativeBridge.save("progress", JSON.stringify(P)); } catch (e) { } }, 600); }

/* ---------- FSRS-4.5 ---------- */
const W = [0.4872, 1.4003, 3.7145, 13.8206, 5.1618, 1.2298, 0.8975, 0.031, 1.6474, 0.1367, 1.0461, 2.1072, 0.0793, 0.3246, 1.587, 0.2272, 2.8755];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
function initSD(g) { return { S: Math.max(0.1, W[g - 1]), D: clamp(W[4] - (g - 3) * W[5], 1, 10) }; }
function retriev(t, S) { return Math.pow(1 + t / (9 * S), -1); }
function nextSD(S, D, R, g) {
  let nD = D - W[6] * (g - 3);
  nD = clamp(W[7] * (W[4] - W[5]) + (1 - W[7]) * nD, 1, 10);
  let nS;
  if (g === 1) {
    nS = Math.min(S, W[11] * Math.pow(D, -W[12]) * (Math.pow(S + 1, W[13]) - 1) * Math.exp(W[14] * (1 - R)));
  } else {
    const hard = g === 2 ? W[15] : 1;
    const easy = g === 4 ? W[16] : 1;
    nS = S * (1 + Math.exp(W[8]) * (11 - nD) * Math.pow(S, -W[9]) * (Math.exp(W[10] * (1 - R)) - 1) * hard * easy);
  }
  return { S: clamp(nS, 0.1, 3650), D: nD };
}
// g: 1不认识 2模糊 3认识
function rate(w, g) {
  const now = NOW();
  let rec = P.words[w];
  if (!rec || rec.st === 0 || rec.st === undefined) {
    const sd = initSD(g);
    rec = { st: g >= 3 ? 2 : 1, S: sd.S, D: sd.D, due: now + sd.S * DAY, reps: 1, lapses: g === 1 ? 1 : 0, last: now };
  } else {
    const t = Math.max(0, (now - rec.last) / DAY);
    const R = retriev(t, rec.S);
    const sd = nextSD(rec.S, rec.D, R, g);
    rec.S = sd.S; rec.D = sd.D; rec.reps++; rec.last = now;
    if (g === 1) { rec.lapses++; rec.st = 1; rec.due = now + 10 * 60000; }
    else { rec.st = 2; rec.due = now + rec.S * DAY; }
  }
  P.words[w] = rec;
  bumpDay();
  P.xp += g === 3 ? 8 : g === 2 ? 4 : 2;
  saveP();
}
function bumpDay() {
  const d = todayStr();
  if (P.lastDay !== d) {
    const y = todayStr(NOW() - DAY);
    P.streak = (P.lastDay === y) ? P.streak + 1 : 1;
    P.lastDay = d;
  }
  P.dayLog[d] = (P.dayLog[d] || 0) + 1;
}
const level = () => Math.floor(Math.sqrt(P.xp / 60)) + 1;

/* ---------- 词库加载 ---------- */
function loadDecks() {
  let list = [];
  try { list = JSON.parse(NativeBridge.getDecks()); } catch (e) { list = []; }
  if (!list.length && window.FALLBACK_DECKS) list = window.FALLBACK_DECKS;
  DECKS = [];
  for (const d of list) {
    let total = 0;
    for (const f of (d.files || [])) {
      let arr = [];
      try { arr = JSON.parse(NativeBridge.readDeckFile(d.source, f)); } catch (e) { arr = []; }
      for (const e of arr) {
        if (!e || !e[0]) continue;
        const w = String(e[0]).trim();
        if (WORDS[w]) continue;
        WORDS[w] = { w: w, p: e[1] || "", m: e[2] || "", x: e[3] || "", deck: d.id };
        total++;
      }
    }
    DECKS.push({ id: d.id, name: d.name, icon: d.icon || "📘", source: d.source, total: total });
  }
}
const deckOn = id => !P.decksOff[id];
const deckName = id => { const d = DECKS.find(x => x.id === id); return d ? d.name : ""; };
function activeWords() { return Object.values(WORDS).filter(e => deckOn(e.deck)); }
function newQuota() { return Math.max(0, P.set.newPerDay - (P.dayNew[todayStr()] || 0)); }
function pickNew(n) {
  const out = [];
  for (const e of activeWords()) { const r = P.words[e.w]; if (!r || !r.st) { out.push(e); if (out.length >= n * 3) break; } }
  return shuffle(out).slice(0, n);
}
function dueWords() {
  const now = NOW();
  return activeWords().filter(e => { const r = P.words[e.w]; return r && r.st > 0 && r.due <= now; })
    .sort((a, b) => P.words[a.w].due - P.words[b.w].due);
}
function seenWords() { return activeWords().filter(e => { const r = P.words[e.w]; return r && r.st > 0; }); }

/* ---------- 发音 ---------- */
function speak(t) { if (ttsOK && P.set.tts) { try { NativeBridge.speak(t, P.set.rate); } catch (e) { } } }

/* ---------- Toast ---------- */
let toastT = null;
function toast(msg) { const t = $("toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("show"), 2200); }

/* ================= 路由与按键 ================= */
let SCREEN = "home";
const handlers = {};
function show(name) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  $(name).classList.add("active");
  SCREEN = name;
  if (handlers[name] && handlers[name].enter) handlers[name].enter();
}
window.onTvKey = k => { const h = handlers[SCREEN]; if (h && h.key) h.key(k); };
document.addEventListener("keydown", e => {
  const map = { ArrowUp: "UP", ArrowDown: "DOWN", ArrowLeft: "LEFT", ArrowRight: "RIGHT", Enter: "OK", Escape: "BACK", Backspace: "BACK" };
  if (map[e.key]) { e.preventDefault(); window.onTvKey(map[e.key]); }
});

/* ================= 主页 ================= */
const MENU = [
  { id: "new", ic: "✒️", t: "学新词", d: "衬线大字卡 · 自动发音" },
  { id: "review", ic: "🧠", t: "智能复习", d: "FSRS 记忆算法调度" },
  { id: "quiz", ic: "⚡", t: "闪电测验", d: "限时四选一 · 连击得分" },
  { id: "listen", ic: "🎧", t: "听音辨义", d: "只听发音 · 训练听力反应" },
  { id: "cloze", ic: "📝", t: "例句填空", d: "新闻语境激活记忆" },
  { id: "decks", ic: "📚", t: "词库", d: "开关词书 · 外部扩展" },
  { id: "stats", ic: "📊", t: "统计", d: "热力图 · 掌握度" },
  { id: "settings", ic: "⚙️", t: "设置", d: "新词量 · 发音 · 语速" }
];
const SLOGANS = [
  "看懂<em>世界</em>的词汇", "读懂<em>硅谷</em>与华尔街", "今天也在<em>变强</em>", "新闻不再<em>陌生</em>", "词汇是<em>带宽</em>"
];
let homeIdx = 0;
handlers.home = {
  enter() {
    const due = dueWords().length;
    let unseen = 0;
    for (const e of activeWords()) { const r = P.words[e.w]; if (!r || !r.st) unseen++; }
    const newRemain = Math.min(newQuota(), unseen);
    $("h-streak").textContent = P.streak;
    $("h-level").textContent = level();
    $("h-mastered").textContent = Object.values(P.words).filter(r => r.st === 2 && r.S >= 21).length;
    $("h-due").textContent = due + newRemain;
    $("h-slogan").innerHTML = SLOGANS[new Date().getDate() % SLOGANS.length];
    $("h-sub").textContent = due > 0 ? `待复习 ${due} 个 · 今日新词剩余 ${newRemain} 个` : `今日新词剩余 ${newRemain} 个 · 无待复习,棒!`;
    const m = $("menu"); m.innerHTML = "";
    MENU.forEach((it, i) => {
      const el = document.createElement("div");
      el.className = "mcard" + (i === homeIdx ? " focus" : "");
      let badge = "";
      if (it.id === "review" && due) badge = `<div class="badge">${due}</div>`;
      if (it.id === "new" && newRemain) badge = `<div class="badge">${newRemain}</div>`;
      el.innerHTML = `${badge}<div class="ic">${it.ic}</div><div><div class="t">${it.t}</div><div class="d">${it.d}</div></div>`;
      m.appendChild(el);
    });
  },
  key(k) {
    const cols = 3, n = MENU.length;
    if (k === "LEFT") homeIdx = (homeIdx + n - 1) % n;
    else if (k === "RIGHT") homeIdx = (homeIdx + 1) % n;
    else if (k === "UP") homeIdx = (homeIdx - cols + n) % n;
    else if (k === "DOWN") homeIdx = (homeIdx + cols) % n;
    else if (k === "OK") { openMenu(MENU[homeIdx].id); return; }
    else if (k === "BACK") { NativeBridge.exitApp(); return; }
    handlers.home.enter();
  }
};
function openMenu(id) {
  if (id === "new") startStudy("new");
  else if (id === "review") startStudy("review");
  else if (id === "quiz") startQuiz("quiz");
  else if (id === "listen") startQuiz("listen");
  else if (id === "cloze") startQuiz("cloze");
  else show(id);
}

/* ================= 学习(新词/复习) ================= */
const ST = { queue: [], i: 0, mode: "new", phase: "front", done: 0, again: 0, total: 0, lock: false };
function startStudy(mode) {
  let q;
  if (mode === "new") {
    const n = newQuota();
    if (!n) { toast("今日新词已学完,去复习或测验吧"); return; }
    q = pickNew(n);
    if (!q.length) { toast("当前词库的新词都学完了!"); return; }
  } else {
    q = dueWords().slice(0, 120);
    if (!q.length) { toast("暂时没有到期的复习,休息一下"); return; }
  }
  ST.queue = q; ST.i = 0; ST.mode = mode; ST.done = 0; ST.again = 0; ST.total = q.length;
  show("study"); renderCard();
}
function renderCard() {
  const e = ST.queue[ST.i];
  ST.phase = "front"; ST.lock = false;
  $("s-mode").textContent = ST.mode === "new" ? "学新词" : "智能复习";
  $("s-prog").textContent = (ST.done + 1) + " / " + ST.total;
  $("s-bar").style.width = (ST.done / ST.total * 100) + "%";
  $("s-card").classList.remove("flipped");
  $("s-tag").textContent = ST.mode === "new" ? "NEW" : "REVIEW";
  $("s-deck").textContent = deckName(e.deck);
  $("s-word").textContent = e.w; $("s-word2").textContent = e.w;
  $("s-phon").textContent = e.p ? "/" + e.p + "/" : "";
  $("s-phon2").textContent = e.p ? "/" + e.p + "/" : "";
  $("s-mean").textContent = e.m;
  $("s-ex").innerHTML = highlight(e.x, e.w);
  document.querySelectorAll(".jbtn").forEach(b => b.classList.remove("focus"));
  if (P.set.auto) setTimeout(() => speak(e.w), 250);
}
function highlight(sent, w) {
  if (!sent) return "";
  const stem = w.slice(0, Math.max(3, w.length - 2)).toLowerCase();
  return esc(sent).replace(new RegExp("\\b(" + stem.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "[a-z]*)", "i"), "<b>$1</b>");
}
function flipCard() {
  const e = ST.queue[ST.i];
  $("s-card").classList.add("flipped");
  ST.phase = "back";
  speak(e.w + ". " + (e.x || ""));
}
function judge(g) {
  if (ST.lock) return;
  ST.lock = true;
  const e = ST.queue[ST.i];
  const btn = g === 1 ? "j-no" : g === 2 ? "j-mid" : "j-yes";
  $(btn).classList.add("focus");
  if (ST.mode === "new" && (!P.words[e.w] || !P.words[e.w].st)) P.dayNew[todayStr()] = (P.dayNew[todayStr()] || 0) + 1;
  rate(e.w, g);
  if (g < 3) { ST.again++; ST.queue.splice(Math.min(ST.queue.length, ST.i + 4), 0, e); ST.total = ST.queue.length; }
  ST.done++;
  setTimeout(() => {
    ST.i++;
    if (ST.i >= ST.queue.length) finishSession();
    else renderCard();
  }, 260);
}
handlers.study = {
  key(k) {
    if (k === "BACK") { show("home"); return; }
    if (ST.lock) return;
    if (ST.phase === "front") {
      if (k === "OK") flipCard();
      else if (k === "RIGHT") judge(3);
      else if (k === "LEFT") { ST.lock = true; flipCard(); setTimeout(() => { ST.lock = false; judge(1); }, 900); }
      else if (k === "DOWN") { ST.lock = true; flipCard(); setTimeout(() => { ST.lock = false; judge(2); }, 900); }
      else if (k === "PLAY") speak(ST.queue[ST.i].w);
    } else {
      if (k === "RIGHT") judge(3);
      else if (k === "LEFT") judge(1);
      else if (k === "DOWN") judge(2);
      else if (k === "OK" || k === "PLAY") { const e = ST.queue[ST.i]; speak(e.w + ". " + (e.x || "")); }
    }
  }
};
function finishSession() {
  const acc = ST.total ? Math.round((ST.total - ST.again) / ST.total * 100) : 100;
  $("f-title").textContent = ST.mode === "new" ? "新词学完!" : "复习完成!";
  $("f-xp").textContent = "+" + (ST.done * 6) + " XP · Lv." + level();
  $("f-stats").innerHTML =
    `<div class="stat"><div class="n">${ST.total}</div><div class="l">完成卡片</div></div>
     <div class="stat"><div class="n" style="color:var(--good)">${acc}%</div><div class="l">初见即会</div></div>
     <div class="stat"><div class="n" style="color:var(--gold)">🔥${P.streak}</div><div class="l">连续天数</div></div>`;
  $("f-msg").textContent = acc >= 85 ? "状态极佳,记忆曲线已为你安排好下次复习" : "没关系,忘记是记忆的必经之路,算法会加密复习";
  show("finish");
}
handlers.finish = { key(k) { if (k === "OK" || k === "BACK") show("home"); } };

/* ================= 测验(闪电/填空) ================= */
const QZ = { list: [], i: 0, mode: "quiz", sel: 0, score: 0, combo: 0, best: 0, right: 0, lock: false, timer: null, tStart: 0, ansIdx: 0 };
const QUIZ_N = 15, QUIZ_MS = 9000;
function startQuiz(mode) {
  if (mode === "listen" && (!ttsOK || !P.set.tts)) { toast("本机发音不可用,无法进行听音辨义"); return; }
  let pool = seenWords();
  if (mode === "cloze") pool = pool.filter(e => e.x && e.x.length > 8);
  if (pool.length < 8) { toast("先学至少 8 个新词再来挑战"); return; }
  QZ.list = shuffle(pool.slice()).slice(0, QUIZ_N);
  QZ.i = 0; QZ.mode = mode; QZ.score = 0; QZ.combo = 0; QZ.best = 0; QZ.right = 0;
  show("quiz"); renderQuiz();
}
function renderQuiz() {
  QZ.lock = false; QZ.sel = 0;
  const e = QZ.list[QZ.i];
  $("q-mode").textContent = QZ.mode === "quiz" ? "闪电测验" : "例句填空";
  $("q-prog").textContent = (QZ.i + 1) + " / " + QZ.list.length;
  $("q-score").textContent = QZ.score + " 分";
  $("q-combo").textContent = QZ.combo > 1 ? "⚡连击 ×" + QZ.combo : "";
  $("q-fb").textContent = "";
  const opts = [e];
  const pool = shuffle(activeWords().filter(x => x.w !== e.w && x.m !== e.m));
  for (const c of pool) { if (opts.length >= 4) break; opts.push(c); }
  shuffle(opts);
  QZ.ansIdx = opts.indexOf(e);
  QZ.optCount = opts.length;
  const box = $("q-opts"); box.innerHTML = "";
  if (QZ.mode === "quiz" || QZ.mode === "listen") {
    $("q-word").style.display = ""; $("q-phon").style.display = ""; $("q-sent").style.display = "none";
    if (QZ.mode === "listen") {
      $("q-word").textContent = "🎧";
      $("q-phon").textContent = "仔细听发音,选出正确释义 · 菜单键重听";
    } else {
      $("q-word").textContent = e.w;
      $("q-phon").textContent = e.p ? "/" + e.p + "/" : "";
    }
    opts.forEach((o, i) => {
      const d = document.createElement("div");
      d.className = "opt" + (i === 0 ? " focus" : "");
      d.innerHTML = `<span class="idx">${i + 1}</span><span>${esc(o.m)}</span>`;
      box.appendChild(d);
    });
    speak(e.w);
  } else {
    $("q-word").style.display = "none"; $("q-phon").style.display = "none"; $("q-sent").style.display = "";
    const stem = e.w.slice(0, Math.max(3, e.w.length - 2));
    const re = new RegExp("\\b" + stem.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "[a-zA-Z]*", "i");
    $("q-sent").innerHTML = esc(e.x).replace(re, "<b>______</b>") + `<div style="font-size:2.6vmin;color:var(--dim);margin-top:2vmin">${esc(e.m)}</div>`;
    opts.forEach((o, i) => {
      const d = document.createElement("div");
      d.className = "opt" + (i === 0 ? " focus" : "");
      d.innerHTML = `<span class="idx">${i + 1}</span><span class="serif" style="font-size:3.8vmin">${esc(o.w)}</span>`;
      box.appendChild(d);
    });
  }
  clearInterval(QZ.timer); QZ.tStart = NOW();
  $("q-timer").style.width = "100%";
  QZ.timer = setInterval(() => {
    const left = 1 - (NOW() - QZ.tStart) / QUIZ_MS;
    $("q-timer").style.width = Math.max(0, left * 100) + "%";
    if (left <= 0) answer(-1);
  }, 100);
}
function moveSel(k) {
  const n = QZ.optCount || 4;
  if (n < 2) return;
  if (k === "UP") QZ.sel = (QZ.sel + n - 2 + n) % n;
  else if (k === "DOWN") QZ.sel = (QZ.sel + 2) % n;
  else if (k === "LEFT" || k === "RIGHT") QZ.sel = (QZ.sel % 2 === 0) ? Math.min(QZ.sel + 1, n - 1) : QZ.sel - 1;
  document.querySelectorAll("#q-opts .opt").forEach((o, i) => o.classList.toggle("focus", i === QZ.sel));
}
function answer(idx) {
  if (QZ.lock) return;
  QZ.lock = true; clearInterval(QZ.timer);
  const e = QZ.list[QZ.i];
  const opts = document.querySelectorAll("#q-opts .opt");
  const ok = idx === QZ.ansIdx;
  opts[QZ.ansIdx] && opts[QZ.ansIdx].classList.add("right");
  if (!ok && idx >= 0) opts[idx].classList.add("wrong");
  if (QZ.mode === "listen") { $("q-word").textContent = e.w; $("q-phon").textContent = e.p ? "/" + e.p + "/" : ""; }
  if (ok) {
    QZ.combo++; QZ.best = Math.max(QZ.best, QZ.combo); QZ.right++;
    const gain = 10 + Math.min(10, QZ.combo * 2);
    QZ.score += gain; P.xp += 5;
    $("q-combo").textContent = "⚡连击 ×" + QZ.combo; $("q-combo").classList.remove("pop"); void $("q-combo").offsetWidth; $("q-combo").classList.add("pop");
    $("q-fb").textContent = QZ.mode === "listen" ? e.w + "  +" + gain : "+" + gain;
  } else {
    QZ.combo = 0;
    $("q-fb").textContent = e.w + " → " + e.m;
    speak(e.w);
  }
  // 到期词顺带按测验结果调度
  const r = P.words[e.w];
  if (r && r.due <= NOW() + DAY / 2) rate(e.w, ok ? 3 : 1); else { bumpDay(); saveP(); }
  if (QZ.mode === "cloze" && ok) speak(e.x);
  setTimeout(() => {
    QZ.i++;
    if (QZ.i >= QZ.list.length) finishQuiz(); else renderQuiz();
  }, ok ? 900 : 1900);
}
function finishQuiz() {
  $("f-title").textContent = QZ.right === QZ.list.length ? "全对!完美!" : "测验完成";
  $("f-xp").textContent = "+" + (QZ.right * 5) + " XP · 得分 " + QZ.score;
  $("f-stats").innerHTML =
    `<div class="stat"><div class="n" style="color:var(--good)">${QZ.right}/${QZ.list.length}</div><div class="l">答对</div></div>
     <div class="stat"><div class="n" style="color:var(--gold)">×${QZ.best}</div><div class="l">最高连击</div></div>
     <div class="stat"><div class="n">${QZ.score}</div><div class="l">总分</div></div>`;
  $("f-msg").textContent = QZ.right >= QZ.list.length * 0.8 ? "反应又快又准,词汇正在变成本能" : "错误的词已被算法标记,复习时会重点照顾";
  saveP(); show("finish");
}
handlers.quiz = {
  key(k) {
    if (k === "BACK") { clearInterval(QZ.timer); show("home"); return; }
    if (k === "MENU" || k === "PLAY") { speak(QZ.list[QZ.i].w); return; }
    if (QZ.lock) return;
    if (k === "OK") answer(QZ.sel);
    else if (["UP", "DOWN", "LEFT", "RIGHT"].includes(k)) moveSel(k);
  }
};

/* ================= 词库 ================= */
let deckIdx = 0;
handlers.decks = {
  enter() {
    const box = $("deck-list"); box.innerHTML = "";
    DECKS.forEach((d, i) => {
      const learned = Object.values(WORDS).filter(e => e.deck === d.id && P.words[e.w] && P.words[e.w].st > 0).length;
      const pct = d.total ? Math.round(learned / d.total * 100) : 0;
      const el = document.createElement("div");
      el.className = "rowitem" + (i === deckIdx ? " focus" : "");
      el.innerHTML = `<div class="ic">${d.icon}</div>
        <div class="info"><div class="name">${esc(d.name)}${d.source === "ext" ? ' <span style="color:var(--gold);font-size:2vmin">外部</span>' : ""}</div>
        <div class="desc">已学 ${learned} / ${d.total} 词 · ${pct}%</div>
        <div class="deckbar"><i style="width:${pct}%"></i></div></div>
        <div class="val">${deckOn(d.id) ? "已启用" : '<span style="color:var(--faint)">已关闭</span>'}</div>`;
      box.appendChild(el);
    });
  },
  key(k) {
    if (k === "BACK") { show("home"); return; }
    if (!DECKS.length) return;
    if (k === "UP") deckIdx = (deckIdx + DECKS.length - 1) % DECKS.length;
    else if (k === "DOWN") deckIdx = (deckIdx + 1) % DECKS.length;
    else if (k === "OK") {
      const d = DECKS[deckIdx];
      if (deckOn(d.id)) P.decksOff[d.id] = 1; else delete P.decksOff[d.id];
      saveP();
    }
    handlers.decks.enter();
  }
};

/* ================= 统计 ================= */
handlers.stats = {
  enter() {
    const recs = Object.values(P.words);
    const learned = recs.filter(r => r.st > 0).length;
    const mastered = recs.filter(r => r.st === 2 && r.S >= 21).length;
    const total = Object.keys(WORDS).length;
    const todayN = P.dayLog[todayStr()] || 0;
    $("st-total").textContent = `词库总量 ${total} 词`;
    $("st-grid").innerHTML =
      `<div class="scard"><div class="n">${learned}</div><div class="l">已学单词</div></div>
       <div class="scard"><div class="n">${mastered}</div><div class="l">已掌握(≥21天)</div></div>
       <div class="scard"><div class="n">${todayN}</div><div class="l">今日学习次数</div></div>
       <div class="scard"><div class="n">🔥${P.streak}</div><div class="l">连续天数 · Lv.${level()}</div></div>`;
    const hm = $("heatmap"); hm.innerHTML = "";
    const days = 18 * 7;
    const start = NOW() - (days - 1) * DAY;
    for (let i = 0; i < days; i++) {
      const d = todayStr(start + i * DAY);
      const n = P.dayLog[d] || 0;
      const lv = n === 0 ? 0 : n < 15 ? 1 : n < 40 ? 2 : n < 90 ? 3 : 4;
      const c = document.createElement("div");
      c.className = "cell" + (lv ? " l" + lv : "");
      hm.appendChild(c);
    }
  },
  key(k) { if (k === "BACK" || k === "OK") show("home"); }
};

/* ================= 设置 ================= */
let setIdx = 0;
const SETTINGS = [
  { id: "newPerDay", name: "每日新词量", desc: "每天最多学多少个新词", opts: [10, 15, 20, 30, 50], fmt: v => v + " 词" },
  { id: "tts", name: "发音", desc: "单词与例句的英文朗读", opts: [1, 0], fmt: v => v ? "开启" : "关闭" },
  { id: "auto", name: "自动朗读", desc: "出示卡片时自动读单词", opts: [1, 0], fmt: v => v ? "开启" : "关闭" },
  { id: "rate", name: "语速", desc: "朗读速度", opts: [0.7, 0.9, 1.0, 1.2], fmt: v => v + "×" },
  { id: "reset", name: "重置全部进度", desc: "清空学习记录,不可恢复", opts: null, fmt: () => "OK 长按两次" }
];
let resetArm = false;
handlers.settings = {
  enter() {
    const box = $("set-list"); box.innerHTML = "";
    SETTINGS.forEach((s, i) => {
      const el = document.createElement("div");
      el.className = "rowitem" + (i === setIdx ? " focus" : "");
      const val = s.opts ? s.fmt(P.set[s.id]) : (resetArm && i === setIdx ? '<span style="color:var(--bad)">再按一次确认</span>' : s.fmt());
      el.innerHTML = `<div class="ic">${["🎯", "🔊", "▶️", "⏩", "🗑️"][i]}</div>
        <div class="info"><div class="name">${s.name}</div><div class="desc">${s.desc}${i === 1 && !ttsOK ? ' · <span style="color:var(--bad)">本机无英文TTS引擎,发音不可用</span>' : ""}</div></div>
        <div class="val">${val}</div>`;
      box.appendChild(el);
    });
  },
  key(k) {
    if (k === "BACK") { resetArm = false; show("home"); return; }
    const s = SETTINGS[setIdx];
    if (k === "UP") { setIdx = (setIdx + SETTINGS.length - 1) % SETTINGS.length; resetArm = false; }
    else if (k === "DOWN") { setIdx = (setIdx + 1) % SETTINGS.length; resetArm = false; }
    else if ((k === "LEFT" || k === "RIGHT") && s.opts) {
      const cur = s.opts.indexOf(P.set[s.id]);
      const nx = (cur + (k === "RIGHT" ? 1 : s.opts.length - 1)) % s.opts.length;
      P.set[s.id] = s.opts[nx]; saveP();
    } else if (k === "OK") {
      if (s.id === "reset") {
        if (!resetArm) { resetArm = true; }
        else { P = JSON.parse(JSON.stringify(DEFAULTS)); saveP(); resetArm = false; toast("已重置全部进度"); }
      } else if (s.opts) {
        const cur = s.opts.indexOf(P.set[s.id]);
        P.set[s.id] = s.opts[(cur + 1) % s.opts.length]; saveP();
        if (s.id === "tts" || s.id === "rate") speak("Welcome to Lex TV");
      }
    }
    handlers.settings.enter();
  }
};

/* ================= 启动 ================= */
function boot() {
  loadP();
  loadDecks();
  try { ttsOK = !!NativeBridge.isTtsReady(); } catch (e) { }
  show("home");
}
boot();
