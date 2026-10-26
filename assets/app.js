/* ІМІ · Моніторинг згадок — інтерфейс: завантаження файлу, звіт, архів, збереження на GitHub. */
(function () {
  "use strict";
  const E = window.IMIEngine;
  const $ = (id) => document.getElementById(id);

  /* ───────────── репозиторій ───────────── */
  const CFG = (function () {
    let owner = "tomasmikkelson-arch", repo = "imi-monitoring";
    const m = location.hostname.match(/^([a-z0-9-]+)\.github\.io$/i);
    const seg = location.pathname.split("/").filter(Boolean);
    if (m) { owner = m[1]; if (seg[0] && !/\.html?$/i.test(seg[0])) repo = seg[0]; }
    return { owner, repo, branch: "main" };
  })();
  const RAW = "https://raw.githubusercontent.com/" + CFG.owner + "/" + CFG.repo + "/" + CFG.branch + "/";
  const API = "https://api.github.com/repos/" + CFG.owner + "/" + CFG.repo + "/contents/";

  /* ───────────── форматування ───────────── */
  const nf = new Intl.NumberFormat("uk-UA");
  const fmt = (n) => nf.format(Math.round(n || 0));
  const pctN = (a, b) => (b ? (100 * a) / b : 0);
  const pct = (a, b) => pctN(a, b).toFixed(1).replace(".", ",") + "%";
  function plural(n, f) {
    n = Math.abs(Math.round(n)) % 100;
    const d = n % 10;
    if (n > 10 && n < 20) return f[2];
    if (d === 1) return f[0];
    if (d > 1 && d < 5) return f[1];
    return f[2];
  }
  const WD = {
    mat: ["матеріал", "матеріали", "матеріалів"],
    view: ["перегляд", "перегляди", "переглядів"],
    src: ["джерело", "джерела", "джерел"],
    row: ["рядок", "рядки", "рядків"],
    ch: ["медіа чи канал", "медіа чи канали", "медіа й каналів"]
  };
  const nw = (n, f) => fmt(n) + " " + plural(n, f);
  const MONTHS = ["січня", "лютого", "березня", "квітня", "травня", "червня", "липня", "серпня", "вересня", "жовтня", "листопада", "грудня"];
  const MONTHS_N = ["Січень", "Лютий", "Березень", "Квітень", "Травень", "Червень", "Липень", "Серпень", "Вересень", "Жовтень", "Листопад", "Грудень"];
  const WDAYS = ["нд", "пн", "вт", "ср", "чт", "пт", "сб"];
  function ymd(s) { const m = String(s || "").match(/(\d{4})-(\d{2})-(\d{2})/); return m ? { y: +m[1], m: +m[2], d: +m[3] } : null; }
  function periodLabel(from, to) {
    const a = ymd(from), b = ymd(to);
    if (!a || !b) return (from || "—") + " – " + (to || "—");
    if (from === to) return a.d + " " + MONTHS[a.m - 1] + " " + a.y;
    if (a.y === b.y && a.m === b.m) return a.d + "–" + b.d + " " + MONTHS[b.m - 1] + " " + b.y;
    if (a.y === b.y) return a.d + " " + MONTHS[a.m - 1] + " – " + b.d + " " + MONTHS[b.m - 1] + " " + b.y;
    return a.d + " " + MONTHS[a.m - 1] + " " + a.y + " – " + b.d + " " + MONTHS[b.m - 1] + " " + b.y;
  }
  function dateShort(s) { const a = ymd(s); return a ? String(a.d).padStart(2, "0") + "." + String(a.m).padStart(2, "0") : (s || ""); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  const clip = (s, n) => E.clip(s || "", n);
  function safeUrl(u) { return /^https?:\/\//i.test(u || "") ? u : ""; }

  const PLATFORM = [
    [/telegram|t\.me/i, "Telegram"], [/instagram/i, "Instagram"], [/twitter|x\.com/i, "X"], [/youtube/i, "YouTube"],
    [/tiktok/i, "TikTok"], [/threads/i, "Threads"], [/facebook/i, "Facebook"]
  ];
  function platform(src) { for (const [re, n] of PLATFORM) if (re.test(src || "")) return n; return src; }
  function srcLabel(m) { return m.social && m.place ? m.place + " (" + platform(m.src) + ")" : m.src; }

  const KIND_SHORT = {
    data: "джерело даних і моніторингу", primary: "першоджерело новини", expert: "експертний голос",
    position: "сторона позиції", conflict: "сторона конфлікту чи критики", background: "побіжна згадка",
    owned: "власна публікація", donor: "донорська плашка"
  };
  const TONE_COLOR = { "Позитив": "var(--green)", "Нейтрал": "#8A93B2", "Негатив": "var(--red)" };

  /* ───────────── іконки ───────────── */
  const ICON_PATHS = {
    link: '<path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.5 1.5"/><path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.5-1.5"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    pdf: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M12 11v6"/><path d="m9 14.5 3 3 3-3"/>',
    upload: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M12 18v-6"/><path d="m9 14.5 3-3 3 3"/>',
    grid: '<rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2"/><rect x="13.5" y="13.5" width="7" height="7" rx="2"/>',
    cloud: '<path d="M12 13v8"/><path d="m8.5 16.5 3.5-3.5 3.5 3.5"/><path d="M20 16.6A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25"/>',
    key: '<circle cx="8" cy="15" r="4.5"/><path d="m11.2 11.8 8.3-8.3"/><path d="m17 6 2.5 2.5"/><path d="m14.5 8.5 2 2"/>',
    spin: '<path d="M21 12a9 9 0 1 1-6.22-8.56"/>',
    alert: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5"/><path d="M12 16.5h.01"/>'
  };
  const icon = (n, cls) => '<svg class="ico' + (cls ? " " + cls : "") + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICON_PATHS[n] + "</svg>";

  /* ───────────── завантажувач (без змін) ───────────── */
  const VEIL_LINES = [
    "Калібрування варп-ядра",
    "Картографування туманності",
    "Шукаємо ІМІ в туманності згадок",
    "Відганяємо redtram від карти",
    "Рахуємо перегляди, не ауру медіа",
    "Згортаємо двійників у сингулярність",
    "Плашка Нідерландів вийшла на орбіту",
    "Негативна тема — ще не негатив до ІМІ",
    "Прокладаємо маршрут крізь шум",
    "Сигнал іде з туманності згадок",
    "Owned відділився від earned",
    "Телеграм іде в точку сходу",
    "Аудиторію медіа лишаємо за бортом",
    "Зірки склались у таблицю",
    "Медіабаза передає координати",
    "Коментарі під власним дописом за бортом",
    "Горизонт майже порахувався",
    "Однакові перегляди — це міраж",
    "Збираємо сузір'я тем",
    "Excel гріє варп-ядро"
  ];
  function shuffle(list) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = a[i]; a[i] = a[j]; a[j] = tmp;
    }
    return a;
  }
  let veilTimer = 0;
  let gridFrame = 0;
  let gridOn = false;
  function drawGrid() {
    const canvas = $("grid");
    if (!canvas || !gridOn) return;
    const ctx = canvas.getContext("2d");
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth * 1.16;
    const h = window.innerHeight * 1.12;
    if (canvas.width !== Math.floor(w * dpr)) {
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#f7f6f3";
    ctx.fillRect(0, 0, w, h);
    const cx = w / 2;
    const horizon = h * 0.40;
    const near = 90;
    const cell = 78;
    const far = 1700;
    const shift = (performance.now() / 16) % cell;
    function yAt(z) { return horizon + (h * 1.08 - horizon) * (near / (near + z)); }
    function xAt(x, z) { return cx + x * (near / (near + z)); }
    ctx.lineWidth = 1;
    function alphaAt(z) {
      const t = Math.min(1, z / far);
      return Math.pow(1 - t, 1.55);
    }
    for (let z = shift; z < far; z += cell) {
      const y = yAt(z);
      if (y <= horizon + 1) continue;
      const a = alphaAt(z);
      ctx.strokeStyle = "rgba(176,176,176," + (0.08 + a * 0.78) + ")";
      ctx.beginPath();
      ctx.moveTo(-40, y);
      ctx.lineTo(w + 40, y);
      ctx.stroke();
    }
    const half = Math.ceil(w / cell) + 8;
    const steps = 16;
    for (let i = -half; i <= half; i++) {
      const x = i * cell;
      const hue = (i * 28 + 200) % 360;
      const spectral = i % 5 === 0;
      for (let s = 0; s < steps; s++) {
        const z0 = far * Math.pow(s / steps, 1.35);
        const z1 = far * Math.pow((s + 1) / steps, 1.35);
        const a = alphaAt((z0 + z1) / 2);
        if (a < 0.02) continue;
        ctx.strokeStyle = spectral
          ? "hsla(" + hue + ",42%,62%," + (a * 0.5) + ")"
          : "rgba(176,176,176," + (a * 0.88) + ")";
        ctx.beginPath();
        ctx.moveTo(xAt(x, z0), yAt(z0));
        ctx.lineTo(xAt(x, z1), yAt(z1));
        ctx.stroke();
      }
    }
    gridFrame = requestAnimationFrame(drawGrid);
  }
  function showVeil(caption) {
    const veil = $("veil");
    veil.hidden = false;
    veil.classList.remove("out");
    const lines = shuffle(VEIL_LINES);
    let n = 0;
    $("veilSub").textContent = lines[0];
    clearInterval(veilTimer);
    veilTimer = setInterval(() => { n = (n + 1) % lines.length; $("veilSub").textContent = lines[n]; }, 1700);
    if (!gridOn) { gridOn = true; drawGrid(); }
  }
  function hideVeil() {
    const veil = $("veil");
    veil.classList.add("out");
    clearInterval(veilTimer);
    setTimeout(() => { veil.hidden = true; gridOn = false; if (gridFrame) cancelAnimationFrame(gridFrame); }, 480);
  }
  async function hold(ms) { await new Promise(r => setTimeout(r, ms)); }
  showVeil("Завантаження");
  setTimeout(hideVeil, 5600);

  /* ───────────── стан ───────────── */
  let STATE = null; // { report, saved, url }
  let ARCHIVE = [];

  /* ───────────── підказки ───────────── */
  const tip = $("tip");
  document.addEventListener("mouseover", (e) => {
    const el = e.target.closest && e.target.closest("[data-tip]");
    if (!el) { tip.classList.remove("on"); return; }
    tip.innerHTML = el.getAttribute("data-tip");
    tip.classList.add("on");
  });
  document.addEventListener("mousemove", (e) => {
    if (!tip.classList.contains("on")) return;
    const pad = 14, w = tip.offsetWidth, h = tip.offsetHeight;
    let x = e.clientX + pad, y = e.clientY + pad;
    if (x + w > window.innerWidth - 8) x = e.clientX - w - pad;
    if (y + h > window.innerHeight - 8) y = e.clientY - h - pad;
    tip.style.left = x + "px"; tip.style.top = y + "px";
  });
  function toast(text) {
    const t = document.createElement("div");
    t.className = "toast"; t.textContent = text; t.setAttribute("role", "status");
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2600);
  }

  /* ═════════════ АРХІВ ═════════════ */
  async function fetchJSON(url) {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(r.status);
    return r.json();
  }
  async function loadIndex() {
    const res = await Promise.allSettled([fetchJSON("reports/index.json"), fetchJSON(RAW + "reports/index.json")]);
    const map = new Map();
    res.forEach(r => {
      if (r.status !== "fulfilled" || !r.value || !Array.isArray(r.value.reports)) return;
      r.value.reports.forEach(x => {
        const old = map.get(x.id);
        if (!old || String(x.savedAt || "") > String(old.savedAt || "")) map.set(x.id, x);
      });
    });
    ARCHIVE = Array.from(map.values()).sort((a, b) => String(b.to).localeCompare(String(a.to)) || String(b.from).localeCompare(String(a.from)));
    return { ok: res.some(r => r.status === "fulfilled"), list: ARCHIVE };
  }
  function renderArchive(state) {
    const box = $("archive");
    if (!state.list.length) {
      box.innerHTML = '<div class="arch-empty">' + (state.ok ? "Ще немає збережених звітів. Завантажте файл Looqme — після розрахунку звіт можна зберегти сюди." : "Архів зараз недоступний. Перевірте з'єднання й оновіть сторінку.") + "</div>";
      return;
    }
    let html = "", year = null;
    state.list.forEach(x => {
      const a = ymd(x.to);
      const label = a ? MONTHS_N[a.m - 1] + " " + a.y : "";
      if (label !== year) { year = label; html += '<div class="arch-year">' + esc(label) + "</div>"; }
      html += '<a class="arch-item" href="?r=' + encodeURIComponent(x.id) + '">' +
        '<div class="per">' + esc(periodLabel(x.from, x.to)) + "<small>" + esc(x.fileName || "") + "</small></div>" +
        '<div class="k"><b>' + fmt(x.materials) + "</b><span>" + plural(x.materials, WD.mat) + "</span></div>" +
        '<div class="k"><b>' + fmt(x.viewsAll) + "</b><span>підтверджених переглядів</span></div>" +
        '<div class="k"><b>' + fmt(x.viewsEditorial) + "</b><span>редакційні згадки</span></div>" +
        '<span class="go" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></svg></span></a>';
    });
    box.innerHTML = html;
  }

  /* ═════════════ ФАЙЛ ═════════════ */
  async function sha256(buf) {
    try {
      const d = await crypto.subtle.digest("SHA-256", buf);
      return Array.from(new Uint8Array(d)).map(b => b.toString(16).padStart(2, "0")).join("");
    } catch (e) { return ""; }
  }
  function showErr(msg) { const el = $("err"); el.textContent = msg; el.hidden = !msg; }
  async function handleFile(file) {
    showErr("");
    if (!file) return;
    if (typeof XLSX === "undefined") { showErr("Парсер Excel не завантажився. Оновіть сторінку."); return; }
    showVeil("Калібрування варп-ядра");
    const started = Date.now();
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const name = wb.SheetNames.includes("Статті") ? "Статті" : wb.SheetNames[0];
      const raw = XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: "", raw: true });
      if (!raw.length || !("Заголовок" in raw[0])) throw new Error("у файлі немає колонки «Заголовок». Потрібна вигрузка Looqme, аркуш «Статті».");
      const hash = await sha256(buf);
      const report = E.analyze(raw, { fileName: file.name, fileHash: hash, createdAt: new Date().toISOString() });
      const known = ARCHIVE.find(x => x.id === report.id && x.fileHash && x.fileHash === hash);
      STATE = { report, saved: !!known };
      await hold(Math.max(0, 10000 - (Date.now() - started)));
      if (known) history.replaceState(null, "", "?r=" + encodeURIComponent(report.id));
      else if (getToken()) STATE.saving = true;
      openReport();
      hideVeil();
      if (STATE.saving) autoSave();
    } catch (e) {
      hideVeil();
      showErr("Не вдалося прочитати файл: " + (e && e.message ? e.message : e));
    }
    $("file").value = "";
  }

  /* ═════════════ МАРШРУТИ ═════════════ */
  function showHome() {
    $("home").hidden = false; $("report").hidden = true;
    $("topnav").innerHTML = getToken() ? '<span class="chip-ok">' + icon("check") + "Збереження в архів увімкнено</span>" : "";
    document.title = "Моніторинг згадок ІМІ";
  }
  function openReport() {
    $("home").hidden = true; $("report").hidden = false;
    $("topnav").innerHTML = '<a class="btn btn-dark" href="./">' + icon("grid") + "Усі звіти</a>";
    renderReport();
    window.scrollTo(0, 0);
  }
  async function route() {
    const id = new URLSearchParams(location.search).get("r");
    const idxP = loadIndex().then(st => { renderArchive(st); return st; });
    if (!id) { showHome(); return; }
    if (!/^[0-9A-Za-z_\-]+$/.test(id)) { showHome(); return; }
    if (STATE && STATE.report.id === id) { openReport(); return; }
    let rep = null;
    for (const u of ["reports/" + id + ".json", RAW + "reports/" + id + ".json"]) {
      try { rep = await fetchJSON(u); break; } catch (e) {}
    }
    if (!rep) {
      showHome();
      showErr("Звіт «" + id + "» не знайдено в архіві. Якщо його щойно зберегли, зачекайте хвилину й оновіть сторінку.");
      return;
    }
    STATE = { report: rep, saved: true };
    openReport();
    await idxP;
  }
  window.addEventListener("popstate", () => { STATE = STATE && new URLSearchParams(location.search).get("r") === STATE.report.id ? STATE : null; route(); });

  /* ═════════════ АГРЕГАТИ ═════════════ */
  function groupBy(arr, keyFn) {
    const map = new Map();
    for (const m of arr) {
      const k = keyFn(m) || "Не вказано";
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(m);
    }
    return Array.from(map.entries()).map(([key, items]) => ({
      key, items, count: items.length, views: items.reduce((s, x) => s + x.views, 0)
    })).sort((a, b) => b.views - a.views || b.count - a.count || String(a.key).localeCompare(String(b.key), "uk"));
  }
  function aggregate(R) {
    const M = R.materials;
    const C = R.control;
    const total = C.viewsAll;
    const themeName = {};
    R.themes.forEach(t => { themeName[t.id] = t.name; });
    const stories = {};
    (R.stories || []).forEach(s => { stories[s.id] = Object.assign({ items: [], views: 0 }, s); });
    M.forEach(m => { const s = stories[m.story]; if (s) { s.items.push(m); s.views += m.views; } });
    const themes = groupBy(M, m => m.theme).map(t => {
      t.name = themeName[t.key] || t.key;
      t.srcCount = new Set(t.items.map(srcLabel)).size;
      t.stories = Object.values(stories).filter(s => s.theme === t.key && s.items.length > 1).sort((a, b) => b.views - a.views || b.items.length - a.items.length);
      t.kinds = groupBy(t.items, m => m.kind);
      return t;
    }).sort((a, b) => (a.key === "donor") - (b.key === "donor") || (a.key === "other") - (b.key === "other") || 0);
    const earned = M.filter(m => !m.owned);
    const editorial = earned.filter(m => !m.donor);
    const media = groupBy(M, srcLabel);
    const bySrc = groupBy(M.filter(m => !m.owned), m => m.src);
    const inflation = bySrc.filter(g => g.count >= 2 && g.items[0].views > 0 && g.items.every(x => x.views === g.items[0].views));
    const days = [];
    const a = ymd(R.period.from), b = ymd(R.period.to);
    if (a && b) {
      let d = Date.UTC(a.y, a.m - 1, a.d); const end = Date.UTC(b.y, b.m - 1, b.d);
      let guard = 0;
      while (d <= end && guard++ < 62) {
        const iso = new Date(d).toISOString().slice(0, 10);
        const items = M.filter(m => m.date === iso);
        days.push({ date: iso, wd: WDAYS[new Date(d).getUTCDay()], count: items.length, views: items.reduce((s, x) => s + x.views, 0) });
        d += 86400000;
      }
    }
    const experts = groupBy(M.filter(m => m.expert && m.expert.name), m => m.expert.name);
    return {
      R, M, C, total, themeName, themes, stories,
      kinds: groupBy(M, m => m.kind),
      tones: groupBy(M, m => m.tone),
      levels: groupBy(earned, m => m.level || (m.social ? "Соцмережі (рівень не визначено)" : "Не вказано")),
      countries: groupBy(M.filter(m => m.country && m.country !== "Україна"), m => m.country),
      media, inflation, days, experts,
      earned, editorial,
      toneChanges: M.filter(m => m.toneWhy),
      zero: M.filter(m => m.viewsMissing),
      transcripts: M.filter(m => m.transcript)
    };
  }

  /* ═════════════ ТЕКСТИ ═════════════ */
  function topOf(items) { return items.slice().sort((a, b) => b.views - a.views || a.key - b.key)[0]; }
  function mTitle(m, n) { return "«" + esc(clip(m.transcript ? m.displayTitle.replace(/^\(автотранскрипт\)\s*/, "") : m.displayTitle, n || 110)) + "»"; }
  function mLinked(m, n) {
    const u = safeUrl(m.url);
    const t = mTitle(m, n);
    return u ? '<a href="' + esc(u) + '" target="_blank" rel="noopener">' + t + "</a>" : t;
  }
  function summaryHtml(A) {
    const C = A.C;
    const ps = [];
    ps.push("За " + esc(periodLabel(A.R.period.from, A.R.period.to)) + " моніторинг зафіксував <b>" + nw(C.materials, WD.mat) + "</b> зі згадкою ІМІ — після очищення від шуму й згортання дублів із " + nw(C.rows, WD.row) + " у файлі. Підтверджене охоплення — <b>" + nw(C.viewsAll, WD.view) + "</b>. " +
      "Редакційні згадки дали " + fmt(C.viewsEditorial) + " (" + pct(C.viewsEditorial, C.viewsAll) + "), проєктні плашки партнерів — " + fmt(C.viewsDonor) + " (" + pct(C.viewsDonor, C.viewsAll) + "), власні канали ІМІ — " + fmt(C.viewsOwned) + ".");
    const ed = A.themes.filter(t => !["donor", "owned", "other"].includes(t.key) && t.views > 0);
    if (ed.length) {
      const t = ed[0];
      const top = topOf(t.items);
      let s = "Найбільше редакційного охоплення зібрала тема <b>«" + esc(t.name) + "»</b>: " + nw(t.count, WD.mat) + " у " + nw(t.srcCount, WD.src) + ", " + fmt(t.views) + " переглядів (" + pct(t.views, C.viewsAll) + "). ";
      if (top && top.views > 0) s += "Найсильніше розійшовся " + mLinked(top) + " — " + esc(srcLabel(top)) + ", " + fmt(top.views) + ". ";
      const st = t.stories[0];
      if (st && st.items.length >= 3) s += "Той самий текст ІМІ переказали " + st.items.length + " " + plural(st.items.length, ["раз", "рази", "разів"]) + " у різних медіа й каналах, сумарно " + fmt(st.views) + " переглядів.";
      ps.push(s);
    }
    if (ed.length > 1) {
      const rest = ed.slice(1, 4).map(t => "«" + esc(t.name) + "» (" + nw(t.count, WD.mat) + ", " + fmt(t.views) + ")");
      ps.push("Далі за охопленням — " + rest.join(", ") + ".");
    }
    const neg = A.M.filter(m => m.tone === "Негатив").sort((a, b) => b.views - a.views);
    const conflict = A.M.filter(m => m.kind === "conflict");
    if (neg.length) ps.push("Негатив щодо ІМІ після перевірки міток Looqme: " + nw(neg.length, WD.mat) + ", найпомітніший — " + mLinked(neg[0], 90) + " (" + esc(srcLabel(neg[0])) + ", " + fmt(neg[0].views) + ")." + (conflict.length > neg.length ? (conflict.length - neg.length === 1 ? " Ще один матеріал містить критику чи конфлікт навколо ІМІ, але подано його нейтрально." : " Ще " + nw(conflict.length - neg.length, WD.mat) + " містять критику чи конфлікт навколо ІМІ, але подано їх нейтрально.") : ""));
    else if (conflict.length) ps.push("Критику чи конфлікт навколо ІМІ згадують " + nw(conflict.length, WD.mat) + ", але подача нейтральна — негативу щодо організації після перевірки міток немає.");
    else ps.push("Негативної подачі ІМІ після перевірки міток Looqme не виявлено.");
    return ps.map(p => "<p>" + p + "</p>").join("");
  }
  function themeDesc(t, A) {
    const C = A.C;
    if (t.key === "donor") {
      return "Матеріали партнерських редакцій, де ІМІ згадано лише у формулі «створено в межах проєкту ІМІ за підтримки…» або в описі підтримки редакції. Це не редакційні згадки, тому їх рахуємо окремо: " + nw(t.count, WD.mat) + ", " + fmt(t.views) + " переглядів (" + pct(t.views, C.viewsAll) + " охоплення)." +
        (t.items[0] && t.items[0].views ? " Найбільше переглядів — " + mLinked(t.items[0], 90) + " (" + esc(srcLabel(t.items[0])) + ", " + fmt(t.items[0].views) + ")." : "");
    }
    let s = nw(t.count, WD.mat) + " у " + nw(t.srcCount, WD.src) + ", " + nw(t.views, WD.view) + " — " + pct(t.views, C.viewsAll) + " усього охоплення. ";
    const top = topOf(t.items);
    if (top && top.views > 0) s += "Найбільше переглядів зібрав " + mLinked(top) + " (" + esc(srcLabel(top)) + ", " + fmt(top.views) + "). ";
    const st = t.stories[0];
    if (st) s += "Найширше розійшовся текст " + (st.imiSource ? "ІМІ " : "") + "«" + esc(clip(st.title, 100)) + "»: " + nw(st.items.length, WD.mat) + " сумарно на " + fmt(st.views) + " переглядів. ";
    const k = t.kinds[0];
    if (k && t.key !== "owned") s += "Здебільшого ІМІ тут — " + KIND_SHORT[k.key] + " (" + k.count + " з " + t.count + "). ";
    const nat = t.items.filter(m => /ТОП-100|Національн/i.test(m.level)).length;
    if (nat) s += "У національних і ТОП-100 медіа — " + nw(nat, WD.mat) + ". ";
    const z = t.items.filter(m => m.viewsMissing).length;
    if (z) s += "Без підтверджених переглядів у файлі: " + z + ".";
    return s.trim();
  }
  function conclusions(A) {
    const C = A.C, out = [];
    const nonOwn = A.kinds.filter(k => !["owned", "donor"].includes(k.key));
    if (nonOwn[0]) {
      const k = nonOwn[0];
      out.push("Найчастіша роль ІМІ в медіа — " + KIND_SHORT[k.key] + ": " + nw(k.count, WD.mat) + ", " + fmt(k.views) + " переглядів (" + pct(k.views, C.viewsAll) + "). " +
        (nonOwn.length > 1 ? "Далі: " + nonOwn.slice(1, 4).map(x => KIND_SHORT[x.key] + " — " + x.count).join("; ") + "." : ""));
    }
    const ed = A.themes.filter(t => !["donor", "owned", "other"].includes(t.key) && t.views > 0);
    if (ed[0]) out.push("Найбільшу видимість дає тема «" + ed[0].name + "»: " + pct(ed[0].views, C.viewsAll) + " усього охоплення і " + pct(ed[0].views, C.viewsEditorial) + " редакційного." + (ed[1] ? " Друга — «" + ed[1].name + "» (" + pct(ed[1].views, C.viewsAll) + ")." : ""));
    const strong = A.editorial.filter(m => /ТОП-100|Національн/i.test(m.level) && ["data", "expert", "primary"].includes(m.kind));
    if (strong.length) {
      const names = Array.from(new Set(strong.sort((a, b) => b.views - a.views).map(srcLabel))).slice(0, 6);
      out.push("Репутаційний капітал — " + nw(strong.length, WD.mat) + " у національних і ТОП-100 медіа, де ІМІ є джерелом даних, новини чи експертом: " + names.join(", ") + ".");
    }
    const neg = A.M.filter(m => m.tone === "Негатив");
    const conflict = A.M.filter(m => m.kind === "conflict");
    if (neg.length || conflict.length) out.push("Репутаційні ризики: " + nw(conflict.length, WD.mat) + " з критикою чи конфліктом навколо ІМІ (" + fmt(conflict.reduce((s, m) => s + m.views, 0)) + " переглядів), із них з негативною подачею — " + neg.length + ".");
    else out.push("Репутаційних ризиків у масиві не видно: критики чи конфліктної подачі ІМІ немає.");
    out.push("Структура згадок: редакційні — " + C.editorial + " (" + pct(C.viewsEditorial, C.viewsAll) + " охоплення), проєктні плашки — " + C.donor + " (" + pct(C.viewsDonor, C.viewsAll) + "), власні публікації — " + C.owned + ". Плашки не змішуємо з редакційною видимістю.");
    if (A.toneChanges.length) out.push("Мітки Looqme виправлено в " + nw(A.toneChanges.length, WD.mat) + ": негативна тема (атака, загибель, фейк) не означає негативної подачі ІМІ.");
    if (A.experts.length) out.push("Експертний голос ІМІ: " + A.experts.map(e => e.key).slice(0, 5).join(", ") + " — " + nw(A.experts.reduce((s, e) => s + e.count, 0), WD.mat) + " з прямим коментарем.");
    else out.push("Прямих коментарів названих представників ІМІ у масиві не знайдено — ІМІ присутній переважно через дані й повідомлення.");
    return out.slice(0, 8);
  }
  function recommendations(A) {
    const C = A.C, out = [];
    const dataThemes = A.themes.filter(t => !["donor", "owned", "other"].includes(t.key) && t.items.some(m => m.kind === "data"));
    if (dataThemes[0]) out.push("Посилювати теми, де ІМІ вже дає цифру чи перелік, — насамперед «" + dataThemes[0].name + "». Формат «за даними ІМІ» дає найбільше органічних передруків: ключовий висновок тримати одним реченням, яке медіа можуть процитувати.");
    const exp = A.experts.reduce((s, e) => s + e.count, 0);
    if (exp < 8) out.push("Експертних коментарів мало (" + exp + "). Пропонувати спікерів ІМІ й Медіабаз профільним журналістам проактивно, з готовою тезою до інфоприводу тижня.");
    else out.push("Експертний формат працює (" + exp + " матеріалів із прямою мовою). Закріпити за кожним спікером 2–3 теми, щоб журналісти знали, кого питати.");
    const bg = A.kinds.find(k => k.key === "background"), pos = A.kinds.find(k => k.key === "position");
    if ((bg && bg.count) || (pos && pos.count)) out.push("Де ІМІ згадано побіжно чи серед підписантів (" + ((bg ? bg.count : 0) + (pos ? pos.count : 0)) + " матеріалів), робити окремий привід саме про внесок ІМІ, щоб організація не губилася в переліку.");
    out.push("Проєктні плашки тримати окремим рядком у звітності: цього разу це " + pct(C.viewsDonor, C.viewsAll) + " охоплення, і змішування з редакційними згадками завищило б видимість.");
    const conflict = A.M.filter(m => m.kind === "conflict");
    if (conflict.length) out.push("На критику (" + conflict.length + " " + plural(conflict.length, WD.mat) + ") мати коротку відповідь про методологію й джерела фінансування ІМІ, готову до нової хвилі в Telegram і YouTube.");
    else out.push("Негативу немає — тримати напоготові коротке пояснення методології моніторингів, бо рейтинги й переліки ІМІ найчастіше стають приводом для суперечок.");
    if (A.inflation.length) out.push("У рейтингу медіа позначати однакові перегляди як модельовану оцінку Looqme (" + A.inflation.slice(0, 3).map(g => g.key).join(", ") + "), а не виміряне охоплення.");
    return out.slice(0, 7);
  }
  function risksHtml(A) {
    const C = A.C, items = [];
    if (A.inflation.length) items.push("<b>Однакові перегляди на одному джерелі</b>Looqme ставить одну модельовану цифру всім матеріалам ресурсу: " + A.inflation.slice(0, 6).map(g => esc(g.key) + " — " + g.count + " × " + fmt(g.items[0].views)).join("; ") + ". Місце таких джерел у рейтингу — артефакт методики, не вимірювання.");
    const topEd = topOf(A.editorial);
    if (topEd && C.viewsEditorial && topEd.views / C.viewsEditorial > 0.2) items.push("<b>Один матеріал тягне охоплення</b>" + mLinked(topEd, 90) + " дає " + pct(topEd.views, C.viewsEditorial) + " редакційного охоплення. Без нього картина тижня суттєво скромніша.");
    if (C.viewsDonor) items.push("<b>Проєктні плашки</b>" + nw(C.donor, WD.mat) + " і " + pct(C.viewsDonor, C.viewsAll) + " охоплення — формальна згадка ІМІ в партнерських матеріалах. У цифрах видимості їх відокремлено.");
    const many = A.themes.filter(t => !["donor", "owned", "other"].includes(t.key) && t.count >= 5 && pctN(t.views, C.viewsAll) < 3);
    if (many.length) items.push("<b>Багато згадок, мало переглядів</b>" + many.map(t => "«" + esc(t.name) + "» — " + t.count + " матеріалів, " + pct(t.views, C.viewsAll)).join("; ") + ". Важливість таких тем метрика охоплення занижує.");
    const small = A.themes.filter(t => !["donor", "owned", "other"].includes(t.key) && t.count <= 3 && t.items.some(m => /ТОП-100|Національн/i.test(m.level)));
    if (small.length) items.push("<b>Мало, але важливо</b>" + small.map(t => "«" + esc(t.name) + "» (" + t.count + ")").join(", ") + " — поодинокі, але в національних медіа.");
    const dataN = A.M.filter(m => m.kind === "data").length, subj = A.M.filter(m => ["expert", "position"].includes(m.kind)).length;
    items.push("<b>Джерело цифр чи суб'єкт</b>ІМІ як джерело даних — " + dataN + " " + plural(dataN, WD.mat) + ", як суб'єкт із власним голосом чи позицією — " + subj + ".");
    if (A.transcripts.length) {
      const folded = A.transcripts.reduce((s, m) => s + (m.mirrors || []).length, 0);
      items.push("<b>Автотранскрипти ефірів</b>" + nw(A.transcripts.length, WD.mat) + " з радіо й ТБ" + (folded ? ", ще " + folded + " повторів того самого фрагмента (ролик, джингл) згорнуто" : "") + ". Заголовки — службові, тому в звіті показано цитату з ефіру.");
    }
    if (A.zero.length) items.push("<b>Перегляди не підтверджені</b>" + nw(A.zero.length, WD.mat) + " без переглядів у файлі. Рахуємо як 0, нічого не оцінюємо.");
    return '<ul class="risk">' + items.map(i => "<li>" + i + "</li>").join("") + "</ul>";
  }

  /* ═════════════ ГРАФІКИ ═════════════ */
  function themeColor(t, share) {
    if (t.key === "donor") return { bg: "var(--dust)", dark: false };
    if (t.key === "owned") return { bg: "var(--green-soft)", dark: false };
    if (t.key === "other") return { bg: "var(--gray-tile)", dark: false };
    if (share >= 20) return { bg: "var(--blue)", dark: true };
    if (share >= 10) return { bg: "var(--blue-90)", dark: true };
    if (share >= 5) return { bg: "var(--blue-70)", dark: true };
    if (share >= 2) return { bg: "var(--blue-50)", dark: false };
    return { bg: "var(--blue-30)", dark: false };
  }
  function squarify(items, x, y, w, h) {
    const total = items.reduce((s, i) => s + i.value, 0);
    if (!total) return [];
    const scale = (w * h) / total;
    const rest = items.map(i => Object.assign({}, i, { area: i.value * scale }));
    const out = [];
    function worst(row, side) {
      const s = row.reduce((a, r) => a + r.area, 0);
      let mx = 0, mn = Infinity;
      row.forEach(r => { mx = Math.max(mx, r.area); mn = Math.min(mn, r.area); });
      return Math.max((side * side * mx) / (s * s), (s * s) / (side * side * mn));
    }
    while (rest.length) {
      const side = Math.min(w, h);
      let row = [rest.shift()];
      while (rest.length && worst(row.concat([rest[0]]), side) <= worst(row, side)) row.push(rest.shift());
      const s = row.reduce((a, r) => a + r.area, 0);
      if (w >= h) {
        const cw = s / h; let cy = y;
        row.forEach(r => { const rh = r.area / cw; out.push(Object.assign(r, { x, y: cy, w: cw, h: rh })); cy += rh; });
        x += cw; w -= cw;
      } else {
        const rh = s / w; let cx = x;
        row.forEach(r => { const rw = r.area / rh; out.push(Object.assign(r, { x: cx, y, w: rw, h: rh })); cx += rw; });
        y += rh; h -= rh;
      }
    }
    return out;
  }
  function drawTreemap(A) {
    const box = $("tmap");
    if (!box) return;
    const W = box.clientWidth, H = box.clientHeight;
    const items = A.themes.filter(t => t.views > 0 && t.key !== "donor").map(t => ({ value: t.views, t }));
    const rects = squarify(items, 0, 0, W, H);
    const gap = 2;
    box.innerHTML = rects.map(r => {
      const t = r.t, share = pctN(t.views, A.total), c = themeColor(t, share);
      const w = Math.max(0, r.w - gap * 2), h = Math.max(0, r.h - gap * 2);
      const size = w > 260 && h > 170 ? " big" : (w < 64 || h < 46) ? " tiny" : (w < 150 || h < 112) ? " small" : "";
      const tipTxt = "<b>" + esc(t.name) + "</b><br>" + fmt(t.views) + " переглядів, " + pct(t.views, A.total) + "<br>" + nw(t.count, WD.mat) + " у " + nw(t.srcCount, WD.src);
      return '<button type="button" class="tile' + size + (c.dark ? " dark" : "") + '" data-theme="' + esc(t.key) + '" data-tip="' + esc(tipTxt) + '" style="left:calc(' + (100 * r.x / W).toFixed(3) + "% + " + gap + "px);top:calc(" + (100 * r.y / H).toFixed(3) + "% + " + gap + "px);width:calc(" + (100 * r.w / W).toFixed(3) + "% - " + 2 * gap + "px);height:calc(" + (100 * r.h / H).toFixed(3) + "% - " + 2 * gap + "px);background:" + c.bg + '">' +
        '<span class="tn">' + esc(t.name) + '</span><span><span class="tv">' + fmt(t.views) + '</span><span class="tp" style="display:block">' + pct(t.views, A.total) + ", " + nw(t.count, WD.mat) + "</span></span></button>";
    }).join("");
  }
  function barRows(list, opts) {
    const max = Math.max.apply(null, list.map(x => opts.value(x)).concat([1]));
    return '<div class="bars">' + list.map(x => {
      const v = opts.value(x);
      return '<div class="bar-row" data-tip="' + esc(opts.tip ? opts.tip(x) : "") + '"><div class="bn">' + opts.name(x) + "</div>" +
        '<div class="bvals"><b>' + opts.main(x) + "</b><span>" + opts.side(x) + "</span></div>" +
        '<div class="track"><i style="width:' + Math.max(0.6, (100 * v) / max).toFixed(2) + "%;background:" + (opts.color ? opts.color(x) : "var(--blue)") + '"></i></div></div>';
    }).join("") + "</div>";
  }

  /* ═════════════ ЕЛЕМЕНТИ СПИСКІВ ═════════════ */
  function pillsFor(m) {
    let p = "";
    if (m.owned) p += ' <span class="pill own">owned</span>';
    if (m.donor) p += ' <span class="pill don">плашка</span>';
    if (m.tone === "Негатив") p += ' <span class="pill neg">негатив</span>';
    if ((m.notes || []).some(n => /передрук/.test(n))) p += ' <span class="pill gray">передрук</span>';
    return p;
  }
  function mItem(m, A, extra) {
    const u = safeUrl(m.url);
    const title = esc(clip(m.displayTitle, 140));
    const kind = A.R.kinds[m.kind] || m.kind;
    return "<li" + (extra ? ' class="extra"' : "") + "><div>" + (u ? '<a href="' + esc(u) + '" target="_blank" rel="noopener">' + title + "</a>" : title + ' <span class="pill warn">URL відсутній у файлі</span>') +
      '<div class="ms">' + esc(srcLabel(m)) + ", " + dateShort(m.date) + (m.donor || m.owned ? "" : ", " + esc(kind.charAt(0).toLowerCase() + kind.slice(1))) + pillsFor(m) + "</div></div>" +
      '<div class="mv">' + (m.viewsMissing ? '0<small>не підтверджено</small>' : fmt(m.views)) + "</div></li>";
  }

  /* ═════════════ ЗВІТ ═════════════ */
  function renderReport() {
    const R = STATE.report;
    const A = aggregate(R);
    const C = A.C;
    STATE.A = A;
    document.title = "Моніторинг ІМІ: " + periodLabel(R.period.from, R.period.to);
    const link = location.origin + location.pathname + "?r=" + encodeURIComponent(R.id);
    const h = [];

    // шапка
    h.push('<div class="rep-head"><div><h1>' + esc(periodLabel(R.period.from, R.period.to)) + "</h1>" +
      '<div class="meta">Моніторинг згадок ІМІ за вигрузкою Looqme' + (R.fileName ? ", файл " + esc(R.fileName) : "") + "</div></div>" +
      '<div class="rep-actions">' + shareButton(link) +
      '<div class="rep-sub"><button class="btn btn-quiet" type="button" id="printBtn">' + icon("pdf") + 'Зберегти PDF</button>' +
      '<button class="btn btn-quiet" type="button" id="newFile">' + icon("upload") + "Інший файл</button></div></div></div>");

    if (STATE.saveError) h.push('<div class="notice warn" role="alert">' + icon("alert", "big") + "<p><b>Звіт не збережено.</b> " + esc(STATE.saveError) + '</p><button class="btn btn-primary" type="button" id="saveOpen2">Спробувати ще раз</button></div>');
    else if (!STATE.saved && !STATE.saving) h.push('<div class="notice">' + icon("cloud", "big") + "<p>Звіт порахований, але ще не збережений в архів. " + (getToken() ? "Збережіть його, щоб отримати постійне посилання." : "Щоб зберегти його й отримати посилання, потрібен доступ до архіву: посилання-запрошення від адміністратора сайту або ключ GitHub.") + "</p></div>");
    else if (STATE.justSaved) h.push('<div class="notice ok">' + icon("check", "big") + "<p><b>Звіт збережено в архіві.</b> Посилання вже працює — скопіюйте його кнопкою вгорі й надішліть колегам.</p></div>");

    // hero
    const share = (v) => Math.max(0, pctN(v, C.viewsAll));
    h.push('<section class="reach" aria-label="Охоплення"><div><div class="lbl">Підтверджене охоплення, переглядів</div><div class="big num">' + fmt(C.viewsAll) + "</div>" +
      '<div class="sub">Лише перегляди конкретних матеріалів після очищення. Аудиторію ресурсів, AVE й перегляди з дублями не враховано.</div>' +
      '<div class="mixbar" role="img" aria-label="Склад охоплення">' +
      '<i style="width:' + share(C.viewsEditorial) + '%;background:#fff" data-tip="Редакційні згадки: ' + fmt(C.viewsEditorial) + '"></i>' +
      '<i style="width:' + share(C.viewsDonor) + '%;background:var(--dust)" data-tip="Проєктні плашки: ' + fmt(C.viewsDonor) + '"></i>' +
      '<i style="width:' + share(C.viewsOwned) + '%;background:var(--yellow)" data-tip="Власні канали ІМІ: ' + fmt(C.viewsOwned) + '"></i></div>' +
      '<div class="mixleg"><span><i style="background:#fff"></i>Редакційні ' + fmt(C.viewsEditorial) + " (" + pct(C.viewsEditorial, C.viewsAll) + ")</span>" +
      '<span><i style="background:var(--dust)"></i>Плашки ' + fmt(C.viewsDonor) + " (" + pct(C.viewsDonor, C.viewsAll) + ")</span>" +
      '<span><i style="background:var(--yellow)"></i>Власні ' + fmt(C.viewsOwned) + "</span></div></div>" +
      '<div class="reach-side">' +
      '<div class="rstat"><b class="num">' + fmt(C.materials) + "</b><span>" + plural(C.materials, WD.mat) + " після очищення</span></div>" +
      '<div class="rstat"><b class="num">' + fmt(A.media.length) + "</b><span>медіа й каналів</span></div>" +
      '<div class="rstat"><b class="num">' + fmt(C.editorial) + "</b><span>редакційних згадок</span></div>" +
      '<div class="rstat"><b class="num">' + fmt(C.donor) + "</b><span>проєктних плашок</span></div>" +
      '<div class="rstat wide"><b class="num">' + fmt(C.rows) + " → " + fmt(C.materials) + "</b><span>рядків у файлі → матеріалів: шум " + C.noiseRows + ", згорнуто дублів " + C.folded + "</span></div>" +
      "</div></section>");

    // головне
    h.push('<section class="block"><h2>Головне</h2><div class="prose">' + summaryHtml(A) + "</div></section>");

    // контроль
    const ng = R.control.noiseByGroup || {};
    const crow = (k, v, hl) => "<div" + (hl ? ' class="hl"' : "") + "><span>" + k + "</span><b>" + v + "</b></div>";
    h.push('<details class="block control"><summary><div><h2>Контрольні підсумки</h2><p>Два прогони того самого файлу мають збігтися рядок у рядок. Контроль колонок: ЗМІ ' + fmt(C.sumZmi) + ", соцмережі " + fmt(C.sumSoc) + '.</p></div><span class="btn btn-quiet">Показати</span></summary><div class="ctable">' +
      crow("Файл", esc(R.fileName || "—")) + crow("Період (мін. і макс. «Дата виходу»)", esc(R.period.from + " – " + R.period.to)) +
      crow("Рядків у файлі", fmt(C.rows)) + crow("Рядків-шуму всього", fmt(C.noiseRows)) +
      Object.keys(E.NOISE_GROUPS).map(g => crow("— " + E.NOISE_GROUPS[g].toLowerCase(), fmt(ng[g] || 0))).join("") +
      crow("Рядків після очищення", fmt(C.cleanRows)) + crow("Згорнуто дублів", fmt(C.folded)) +
      crow("Матеріалів після згортання", fmt(C.materials)) + crow("з них earned / owned", fmt(C.earned) + " / " + fmt(C.owned)) +
      crow("Перегляди всього", fmt(C.viewsAll)) + crow("Перегляди earned", fmt(C.viewsEarned)) + crow("Перегляди owned", fmt(C.viewsOwned)) +
      crow("Перегляди проєктних плашок", fmt(C.viewsDonor)) + crow("Перегляди редакційних згадок", fmt(C.viewsEditorial)) +
      crow("Перегляди, які додавав шум", fmt(C.viewsNoise)) +
      crow("Сума «Потенційні перегляди (ЗМІ)» по файлу", fmt(C.sumZmi), true) + crow("Сума «Потенційні перегляди (Соцмережі)» по файлу", fmt(C.sumSoc), true) +
      crow("Відбиток файлу (SHA-256)", esc((R.fileHash || "—").slice(0, 16))) + crow("Версія методики", esc(R.v)) +
      "</div></details>");

    // теми
    h.push('<section class="block" id="themesBlock"><h2>Теми й тексти ІМІ</h2><p class="lead">Матеріали згруповано за тим, на який текст чи напрям ІМІ вони посилаються: усі згадки моніторингу стандартів разом, усі згадки Барометра разом тощо. Площа плитки — частка підтвердженого охоплення. Проєктні плашки (' + fmt(C.viewsDonor) + ", " + pct(C.viewsDonor, C.viewsAll) + ') на мапі не показано, вони окремою темою в списку. Натисніть на плитку, щоб побачити матеріали.</p>' +
      '<div class="tmap" id="tmap" role="img" aria-label="Мапа тем за охопленням"></div>' +
      '<div class="tmap-note"><span><i style="background:var(--blue)"></i>20% охоплення й більше</span><span><i style="background:var(--blue-70)"></i>5–20%</span><span><i style="background:var(--blue-50)"></i>2–5%</span><span><i style="background:var(--blue-30)"></i>менше 2%</span><span><i style="background:var(--green-soft)"></i>власні публікації</span><span><i style="background:var(--gray-tile)"></i>інші згадки</span></div>' +
      '<div class="themes">' + A.themes.map(t => themeBlock(t, A, A.themes.filter(x => x.key !== "donor").slice(0, 2).includes(t))).join("") + "</div></section>");

    // типи + тональність
    h.push('<div class="grid2 row2"><section class="block"><h2>Як медіа використовували ІМІ</h2><p class="lead">Тип згадки за закритим переліком методики. Довжина смуги — перегляди.</p>' +
      barRows(A.kinds, {
        value: k => k.views,
        name: k => esc(R.kinds[k.key] || k.key) + (k.items[0] ? "<small>напр.: " + mLinked(topOf(k.items), 70) + "</small>" : ""),
        main: k => fmt(k.views), side: k => k.count + " " + plural(k.count, WD.mat),
        color: k => k.key === "donor" ? "var(--dust)" : k.key === "owned" ? "var(--green)" : k.key === "conflict" ? "var(--red)" : "var(--blue)",
        tip: k => esc(R.kinds[k.key]) + ": " + pct(k.views, C.viewsAll) + " охоплення"
      }) + "</section>" + toneBlock(A) + "</div>");

    // дні + рівні
    h.push('<div class="grid2 row2">' + daysBlock(A) + '<section class="block"><h2>Рівень видання</h2><p class="lead">Лише earned-матеріали, за колонкою «Рівень видання». У соцмережах Looqme рівень не визначає.</p>' +
      barRows(A.levels, { value: l => l.count, name: l => esc(l.key), main: l => String(l.count), side: l => fmt(l.views) + " перегл.", tip: l => esc(Array.from(new Set(l.items.map(m => m.src))).slice(0, 12).join(", ")) }) +
      "</section></div>");

    // медіа
    h.push('<section class="block"><h2>Топ медіа й каналів</h2><p class="lead">За сумою підтверджених переглядів. Позначка «модель» — Looqme поставив усім матеріалам джерела однакову цифру, тож це оцінка, а не вимір.</p><div class="tbl-wrap"><table><thead><tr><th>Медіа</th><th class="n">К-сть</th><th class="n">Перегляди</th><th class="n">Частка</th><th></th><th>Найсильніший матеріал</th></tr></thead><tbody>' +
      A.media.slice(0, 15).map(g => {
        const infl = A.inflation.some(x => g.items[0] && x.key === g.items[0].src && !g.items[0].social);
        const top = topOf(g.items);
        return "<tr><td><b>" + esc(clip(g.key, 60)) + "</b>" + (infl ? ' <span class="pill warn">модель</span>' : "") + '</td><td class="n">' + g.count + '</td><td class="n">' + fmt(g.views) + '</td><td class="n">' + pct(g.views, C.viewsAll) + '</td><td><span class="mini"><i style="width:' + pctN(g.views, A.media[0].views).toFixed(1) + '%"></i></span></td><td>' + mLinked(top, 80) + "</td></tr>";
      }).join("") + "</tbody></table></div></section>");

    // експерти
    h.push('<section class="block"><h2>Експертні коментарі ІМІ</h2><p class="lead">Пряма мова названих представників ІМІ й Медіабаз з посадою. Ім’я — так, як його знайдено в тексті.</p>' +
      (A.experts.length ? '<div class="experts">' + A.experts.map(e => {
        const role = (e.items.find(m => m.expert && m.expert.role) || {}).expert;
        return '<div class="expert"><div class="en">' + esc(e.key) + '</div><div class="er">' + esc(role && role.role ? role.role : "") + ", " + nw(e.count, WD.mat) + ", " + fmt(e.views) + " переглядів</div><ul>" +
          e.items.slice().sort((a, b) => b.views - a.views).map(m => "<li>" + mLinked(m, 90) + "<span>" + esc(srcLabel(m)) + ", " + esc(A.themeName[m.theme] || "") + ", " + fmt(m.views) + "</span></li>").join("") + "</ul></div>";
      }).join("") + "</div>" : '<p class="prose">Наданих даних недостатньо: прямих коментарів названих представників ІМІ з посадою в масиві не знайдено.</p>') + "</section>");

    // географія
    h.push(geoBlock(A));

    // ризики
    h.push('<section class="block"><h2>Медіадиспропорції й ризики викривлення</h2><p class="lead">Що варто знати, перш ніж цитувати цифри цього звіту.</p>' + risksHtml(A) + "</section>");

    // висновки
    h.push('<div class="findings"><section class="block"><h2>Висновки</h2><ol class="flist">' + conclusions(A).map(x => "<li>" + esc(x) + "</li>").join("") + "</ol></section>" +
      '<section class="block recs"><h2>Рекомендації для комунікацій</h2><ol class="flist">' + recommendations(A).map(x => "<li>" + esc(x) + "</li>").join("") + "</ol></section></div>");

    // шум
    h.push('<section class="block"><h2>Шум і сумнівні випадки</h2><p class="lead">' + nw(R.noise.length, WD.row) + " виключено з усіх розрахунків, разом вони додавали б " + fmt(C.viewsNoise) + " переглядів. Кожне рішення можна перевірити за посиланням.</p>" +
      (R.noise.length ? '<div class="tbl-wrap scroll"><table><thead><tr><th>Причина</th><th>Джерело</th><th>Заголовок</th><th class="n">Перегляди</th></tr></thead><tbody>' +
        R.noise.map(n => '<tr><td class="sub" style="max-width:260px">' + esc(n.why) + "</td><td>" + esc(n.place ? n.place + " (" + platform(n.src) + ")" : n.src) + "</td><td>" + (safeUrl(n.url) ? '<a href="' + esc(n.url) + '" target="_blank" rel="noopener">' + esc(clip(n.title, 110)) + "</a>" : esc(clip(n.title, 110)) + ' <span class="pill warn">URL відсутній у файлі</span>') + '</td><td class="n">' + fmt(n.views) + "</td></tr>").join("") + "</tbody></table></div>" : "") +
      (R.doubtful && R.doubtful.length ? '<h3 style="margin-top:26px">Сумнівні випадки</h3><p class="lead" style="margin-bottom:10px">Зараховано, але варто глянути вручну.</p><ul class="risk">' +
        R.doubtful.map(d => { const m = R.materials.find(x => x.key === d.key); return "<li>" + (m ? mLinked(m, 100) + " — " + esc(srcLabel(m)) + "<br>" : "") + '<span style="color:var(--ink-2)">' + esc(d.why) + "</span></li>"; }).join("") + "</ul>" : "") +
      "</section>");

    // реєстр
    const themeOpts = A.themes.map(t => '<option value="' + esc(t.key) + '">' + esc(t.name) + " (" + t.count + ")</option>").join("");
    const kindOpts = A.kinds.map(k => '<option value="' + esc(k.key) + '">' + esc(R.kinds[k.key]) + " (" + k.count + ")</option>").join("");
    h.push('<section class="block" id="registry"><h2>Реєстр матеріалів</h2><p class="lead">Усі зараховані матеріали, по одному рядку на матеріал, від найбільших переглядів. Кількість рядків дорівнює кількості матеріалів у контрольних підсумках (' + fmt(C.materials) + ").</p>" +
      '<div class="filters"><input id="q" type="search" placeholder="Пошук за заголовком або джерелом" aria-label="Пошук"><select id="fTheme" aria-label="Тема"><option value="">Усі теми</option>' + themeOpts + '</select><select id="fKind" aria-label="Тип згадки"><option value="">Усі типи згадок</option>' + kindOpts + '</select><select id="fStat" aria-label="Статус"><option value="">Earned, owned і плашки</option><option value="ed">Лише редакційні</option><option value="don">Лише плашки</option><option value="own">Лише owned</option></select></div>' +
      '<div class="reg-count" id="regCount"></div><div class="tbl-wrap reg"><table id="reg"></table></div></section>');

    h.push('<footer class="foot"><p><b>Методика.</b> Охоплення — лише «Потенційні перегляди (ЗМІ)» для онлайн, радіо й ТБ і «Потенційні перегляди (Соцмережі)» для соцмереж. Аудиторія джерела, AVE, медіаефективність і перегляди з дублями не використовуються. Шум — за закритим переліком: немає згадки ІМІ чи Медіабази, хибні спрацювання абревіатури, коментарі під власними дописами. Дублі (той самий URL, повторна публікація тим самим каналом, мовні версії, повтори ефірного фрагмента) рахуються один раз — за найбільшим значенням переглядів серед дублів. Owned — imi.org.ua і акаунти ІМІ та Медіабаз. Плашка — ІМІ згадано лише у формулі підтримки проєкту.</p>' +
      "<p>Розраховано " + (R.createdAt ? esc(new Date(R.createdAt).toLocaleString("uk-UA")) : "") + ", методика v" + esc(R.v) + ".</p></footer>");

    $("reportRoot").innerHTML = h.join("");
    drawTreemap(A);
    drawRegistry();
    bindReport();
  }

  function shareButton(link) {
    const shortLink = link.replace(/^https?:\/\//, "");
    if (STATE.saving) return '<button class="share-btn busy" type="button" disabled><span class="ic">' + icon("spin", "spin") + "</span><span><b>Зберігаємо в архів…</b><small>Посилання з’явиться за кілька секунд</small></span></button>";
    if (STATE.saved) return '<button class="share-btn" type="button" id="copyLink" data-link="' + esc(link) + '"><span class="ic">' + icon("link") + '</span><span><b>Копіювати посилання</b><small>' + esc(shortLink) + "</small></span></button>";
    return '<button class="share-btn save" type="button" id="saveOpen"><span class="ic">' + icon("cloud") + "</span><span><b>Зберегти й отримати посилання</b><small>Звіт з’явиться в архіві на головній</small></span></button>";
  }
  function themeBlock(t, A, open) {
    const c = themeColor(t, pctN(t.views, A.total));
    const maxV = A.themes[0] ? A.themes[0].views : 1;
    const items = t.items.slice().sort((a, b) => b.views - a.views || a.key - b.key);
    let body = '<p class="desc">' + themeDesc(t, A) + "</p>";
    if (t.stories.length) {
      body += "<h3>" + (t.key === "donor" ? "Повторні публікації" : "Тексти, які переказали кілька медіа й каналів") + "</h3>";
      body += t.stories.slice(0, 6).map(s => '<div class="story"><div class="story-h"><div class="st">' + esc(clip(s.title, 150)) + "<em>" + nw(s.items.length, WD.mat) + (s.imiSource ? ", першоджерело — сайт ІМІ" : "") + '</em></div><div class="sv">' + fmt(s.views) + "</div></div>" +
        '<ul class="mlist collapsed" id="sl-' + esc(s.id) + '">' + s.items.slice().sort((a, b) => b.views - a.views).map((m, i) => mItem(m, A, i >= 5)).join("") + "</ul>" +
        (s.items.length > 5 ? '<button class="more" type="button" data-expand="sl-' + esc(s.id) + '" data-n="' + s.items.length + '" data-label="сюжету">Показати всі ' + nw(s.items.length, WD.mat) + " сюжету</button>" : "") + "</div>").join("");
    }
    body += '<h3 style="margin-top:20px">Ключові матеріали теми</h3><ul class="mlist collapsed" id="ml-' + esc(t.key) + '">' + items.map((m, i) => mItem(m, A, i >= 5)).join("") + "</ul>";
    if (items.length > 5) body += '<button class="more" type="button" data-expand="ml-' + esc(t.key) + '" data-n="' + items.length + '">Показати всі ' + nw(items.length, WD.mat) + " теми</button>";
    return '<details class="theme" id="t-' + esc(t.key) + '"' + (open ? " open" : "") + '><summary><span class="sw" style="background:' + c.bg + '"></span>' +
      '<span class="tname">' + esc(t.name) + "<small>" + nw(t.count, WD.mat) + ", " + nw(t.srcCount, WD.src) + "</small></span>" +
      '<span class="tbar"><i style="width:' + Math.max(1, (100 * t.views) / (maxV || 1)).toFixed(1) + "%;background:" + (t.key === "donor" ? "var(--dust)" : "var(--blue)") + '"></i></span>' +
      '<span class="tviews"><b class="num">' + fmt(t.views) + "</b><span>" + pct(t.views, A.total) + '</span></span><span class="chev" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg></span></summary>' +
      '<div class="theme-body">' + body + "</div></details>";
  }
  function toneBlock(A) {
    const n = A.M.length || 1;
    const order = ["Позитив", "Нейтрал", "Негатив"];
    const tones = A.tones.slice().sort((a, b) => (order.indexOf(a.key) + 1 || 9) - (order.indexOf(b.key) + 1 || 9));
    let h = '<section class="block"><h2>Тональність</h2><p class="lead">Мітки Looqme після перевірки: негативна тема не дорівнює негативу щодо ІМІ. Частки — від кількості матеріалів.</p>';
    h += '<div class="tonebar" role="img" aria-label="Розподіл тональності">' + tones.map(t => '<i style="width:' + pctN(t.count, n) + "%;background:" + (TONE_COLOR[t.key] || "var(--gray-tile)") + '" data-tip="' + esc(t.key) + ": " + t.count + '">' + (pctN(t.count, n) > 8 ? Math.round(pctN(t.count, n)) + "%" : "") + "</i>").join("") + "</div>";
    h += '<div class="tone-legend">' + tones.map(t => '<div><i style="background:' + (TONE_COLOR[t.key] || "var(--gray-tile)") + '"></i>' + esc(t.key) + "<span>" + t.count + ", " + pct(t.count, n) + ", " + fmt(t.views) + " перегл.</span></div>").join("") + "</div>";
    if (A.toneChanges.length) {
      h += '<details class="changes"' + (A.toneChanges.length <= 12 ? " open" : "") + "><summary>Виправлені мітки: " + A.toneChanges.length + "</summary><ul>" +
        A.toneChanges.map(m => "<li>" + mLinked(m, 80) + " — " + esc(m.toneRaw) + " → <b>" + esc(m.tone) + "</b>. " + esc(m.toneWhy) + "</li>").join("") + "</ul></details>";
    } else h += '<p class="changes">Мітки Looqme не змінювали.</p>';
    return h + "</section>";
  }
  function daysBlock(A) {
    const max = Math.max.apply(null, A.days.map(d => d.views).concat([1]));
    const best = A.days.slice().sort((a, b) => b.views - a.views)[0];
    return '<section class="block"><h2>По днях</h2><p class="lead">Підтверджені перегляди матеріалів за датою виходу.' + (best && best.views ? " Пік — " + dateShort(best.date) + ": " + fmt(best.views) + "." : "") + "</p>" +
      '<div class="days" style="--n:' + Math.max(1, A.days.length) + '">' + A.days.map(d => '<div class="day" data-tip="<b>' + esc(d.wd + ", " + dateShort(d.date)) + "</b><br>" + fmt(d.views) + " переглядів<br>" + nw(d.count, WD.mat) + '">' +
        '<span class="dv">' + (A.days.length <= 10 ? fmt(d.views) : "") + '</span><div class="col" style="height:' + Math.max(1.5, (100 * d.views) / max) * 0.72 + '%"></div>' +
        '<div class="dl"><b>' + d.wd + "</b>" + dateShort(d.date) + "</div></div>").join("") + "</div></section>";
  }
  function geoBlock(A) {
    const foreignLvl = A.M.filter(m => /закордон/i.test(m.level || ""));
    const foreign = Array.from(new Map(A.M.filter(m => (m.country && m.country !== "Україна") || /закордон/i.test(m.level || "")).map(m => [m.src, m])).values());
    const national = Array.from(new Set(A.earned.filter(m => /ТОП-100|Національн/i.test(m.level)).sort((a, b) => b.views - a.views).map(m => m.src)));
    let h = '<section class="block"><h2>Національні й іноземні медіа</h2><p class="lead">За колонками «Рівень видання» і «Країна».</p>';
    h += "<h3>Національні й ТОП-100: " + national.length + "</h3><p style=\"margin:0 0 18px;line-height:1.6\">" + (national.length ? esc(national.slice(0, 40).join(", ")) + (national.length > 40 ? " та ще " + (national.length - 40) : "") : "Немає.") + "</p>";
    h += "<h3>Іноземні: " + foreign.length + "</h3>";
    if (foreign.length) h += '<ul class="mlist">' + foreign.map(m => mItem(m, A)).join("") + "</ul>" + (foreign.length < 3 ? '<p class="lead" style="margin-top:10px">Іноземних даних замало для висновків про міжнародну видимість.</p>' : "");
    else h += '<p class="lead">Іноземних медіа в масиві немає — наданих даних недостатньо для висновків про міжнародну видимість.</p>';
    return h + "</section>";
  }

  function drawRegistry() {
    const A = STATE.A, R = STATE.report;
    const q = ($("q").value || "").toLowerCase().trim();
    const ft = $("fTheme").value, fk = $("fKind").value, fs = $("fStat").value;
    const rows = A.M.filter(m => !ft || m.theme === ft).filter(m => !fk || m.kind === fk)
      .filter(m => !fs || (fs === "ed" && !m.owned && !m.donor) || (fs === "don" && m.donor) || (fs === "own" && m.owned))
      .filter(m => !q || (m.displayTitle + " " + m.src + " " + m.place).toLowerCase().includes(q));
    $("regCount").textContent = "Показано " + fmt(rows.length) + " з " + fmt(A.M.length) + ", перегляди: " + fmt(rows.reduce((s, m) => s + m.views, 0));
    $("reg").innerHTML = '<thead><tr><th>Дата</th><th>Джерело</th><th>Заголовок</th><th>Тип згадки</th><th>Тема</th><th class="n">Перегляди</th></tr></thead><tbody>' +
      rows.map(m => {
        const u = safeUrl(m.url);
        const notes = (m.notes || []).filter(n => !/перегляди не підтверджені/.test(n));
        const mir = (m.mirrors || []).filter(x => safeUrl(x.url));
        return "<tr><td class=\"tab\" style=\"white-space:nowrap\">" + dateShort(m.date) + "</td><td>" + esc(srcLabel(m)) + "<div class=\"sub\">" + (m.owned ? "owned" : m.donor ? "плашка" : "earned") + "</div></td><td>" +
          (u ? '<a href="' + esc(u) + '" target="_blank" rel="noopener">' + esc(m.displayTitle) + '</a><div class="url">' + esc(u) + "</div>" : esc(m.displayTitle) + '<div class="sub">URL відсутній у файлі</div>') +
          (notes.length ? '<div class="sub">' + esc(notes.join("; ")) + "</div>" : "") +
          (mir.length ? '<div class="sub">Дзеркало / фрагмент того самого матеріалу: ' + mir.map(x => '<a href="' + esc(x.url) + '" target="_blank" rel="noopener">' + esc(x.src + " " + dateShort(x.date)) + "</a>").join(", ") + "</div>" : "") +
          (m.viewsMissing ? '<div class="sub">перегляди не підтверджені у наданому файлі</div>' : "") +
          '</td><td class="sub" style="font-size:13px;color:var(--ink-2)">' + esc(R.kinds[m.kind] || m.kind) + (m.toneWhy ? '<div class="sub">тон: ' + esc(m.toneRaw + " → " + m.tone) + "</div>" : "") + '</td><td class="sub" style="font-size:13px;color:var(--ink-2)">' + esc(A.themeName[m.theme] || "") + '</td><td class="n">' + fmt(m.views) + "</td></tr>";
      }).join("") + "</tbody>";
  }

  function bindReport() {
    const on = (id, ev, fn) => { const el = $(id); if (el) el.addEventListener(ev, fn); };
    on("saveOpen", "click", () => openSave("save")); on("saveOpen2", "click", () => { STATE.saveError = ""; openSave("save"); });
    on("printBtn", "click", () => window.print());
    on("newFile", "click", () => { history.pushState(null, "", "./"); STATE = null; route(); window.scrollTo(0, 0); $("file").click(); });
    on("copyLink", "click", async () => {
      const btn = $("copyLink");
      const link = btn.getAttribute("data-link");
      let ok = true;
      try { await navigator.clipboard.writeText(link); }
      catch (e) {
        const ta = document.createElement("textarea"); ta.value = link; ta.style.position = "fixed"; ta.style.opacity = "0";
        document.body.appendChild(ta); ta.select();
        try { ok = document.execCommand("copy"); } catch (e2) { ok = false; }
        ta.remove();
      }
      if (!ok) { prompt("Скопіюйте посилання:", link); return; }
      btn.classList.add("done");
      btn.querySelector(".ic").innerHTML = icon("check");
      btn.querySelector("b").textContent = "Посилання скопійовано";
      clearTimeout(btn._t);
      btn._t = setTimeout(() => { btn.classList.remove("done"); btn.querySelector(".ic").innerHTML = icon("link"); btn.querySelector("b").textContent = "Копіювати посилання"; }, 2200);
    });
    ["q", "fTheme", "fKind", "fStat"].forEach(id => on(id, id === "q" ? "input" : "change", drawRegistry));
    $("reportRoot").addEventListener("click", (e) => {
      const tile = e.target.closest(".tile");
      if (tile) {
        const d = $("t-" + tile.getAttribute("data-theme"));
        if (d) { d.open = true; d.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" }); }
        return;
      }
      const more = e.target.closest("[data-expand]");
      if (more) {
        const ul = $(more.getAttribute("data-expand"));
        const collapsed = ul.classList.toggle("collapsed");
        more.textContent = collapsed ? "Показати всі " + nw(+more.getAttribute("data-n"), WD.mat) + " " + (more.getAttribute("data-label") || "теми") : "Згорнути";
      }
    });
  }
  let rsz = 0;
  window.addEventListener("resize", () => { clearTimeout(rsz); rsz = setTimeout(() => { if (STATE && STATE.A && !$("report").hidden) drawTreemap(STATE.A); }, 120); });
  let printOpen = [];
  window.addEventListener("beforeprint", () => {
    printOpen = Array.from(document.querySelectorAll("details.theme:not([open]), details.control:not([open])"));
    printOpen.forEach(d => { d.open = true; });
  });
  window.addEventListener("afterprint", () => { printOpen.forEach(d => { d.open = false; }); printOpen = []; });

  /* ═════════════ ЗБЕРЕЖЕННЯ НА GITHUB ═════════════ */
  const TOKEN_KEY = "imi-monitoring:gh-token";
  let sessionToken = "";
  function getToken() { try { return localStorage.getItem(TOKEN_KEY) || sessionToken; } catch (e) { return sessionToken; } }
  function setToken(t, remember) { sessionToken = t; try { if (remember) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); } catch (e) {} }
  function forgetToken() { sessionToken = ""; try { localStorage.removeItem(TOKEN_KEY); } catch (e) {} }
  function b64EncodeUtf8(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  function b64DecodeUtf8(b64) {
    const bin = atob(String(b64 || "").replace(/\s/g, ""));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }
  function ghError(status) {
    if (status === 401) return "GitHub не прийняв ключ: він неправильний або прострочений. Створіть новий.";
    if (status === 403 || status === 404) return "Ключ не має права запису в " + CFG.owner + "/" + CFG.repo + ". Перевірте: доступ до цього репозиторію і Contents: Read and write.";
    if (status === 409 || status === 422) return "Архів щойно змінився з іншого пристрою. Спробуйте зберегти ще раз.";
    return "GitHub відповів помилкою " + status + ". Спробуйте ще раз за хвилину.";
  }
  async function ghGet(path, token) {
    const r = await fetch(API + path + "?ref=" + CFG.branch + "&t=" + Date.now(), { headers: { Authorization: "Bearer " + token, Accept: "application/vnd.github+json" }, cache: "no-store" });
    if (r.status === 404) return null;
    if (!r.ok) throw Object.assign(new Error(ghError(r.status)), { status: r.status });
    const j = await r.json();
    let text = j.content ? b64DecodeUtf8(j.content) : "";
    if (!text && j.download_url) { const rr = await fetch(j.download_url, { cache: "no-store" }); text = await rr.text(); }
    return { sha: j.sha, text };
  }
  async function ghPut(path, text, sha, message, token) {
    const body = { message, content: b64EncodeUtf8(text), branch: CFG.branch };
    if (sha) body.sha = sha;
    const r = await fetch(API + path, { method: "PUT", headers: { Authorization: "Bearer " + token, Accept: "application/vnd.github+json", "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!r.ok) throw Object.assign(new Error(ghError(r.status)), { status: r.status });
    return r.json();
  }
  /* Запис звіту в reports/ і оновлення reports/index.json.
     Повертає "saved", "same" (той самий файл уже в архіві) або "exists" (інший файл за цей період). */
  async function persist(R, token, allowOverwrite) {
    const path = "reports/" + R.id + ".json";
    const existing = await ghGet(path, token);
    let skipReport = false, old = null;
    if (existing) {
      try { old = JSON.parse(existing.text); } catch (e) {}
      if (old && old.fileHash && old.fileHash === R.fileHash) skipReport = true;
      else if (!allowOverwrite) return { status: "exists", old };
    }
    const savedAt = new Date().toISOString();
    if (!skipReport) await ghPut(path, JSON.stringify(Object.assign({}, R, { savedAt })), existing && existing.sha, "Звіт моніторингу " + R.id, token);
    const entry = {
      id: R.id, from: R.period.from, to: R.period.to, fileName: R.fileName, fileHash: R.fileHash, savedAt: skipReport && old && old.savedAt ? old.savedAt : savedAt, v: R.v,
      materials: R.control.materials, viewsAll: R.control.viewsAll, viewsEditorial: R.control.viewsEditorial
    };
    for (let attempt = 0; attempt < 3; attempt++) {
      const idx = await ghGet("reports/index.json", token);
      let data = { reports: [] };
      if (idx) { try { data = JSON.parse(idx.text); } catch (e) {} }
      const same = (data.reports || []).find(x => x.id === R.id);
      if (skipReport && same && same.fileHash === R.fileHash) break;
      data.reports = (data.reports || []).filter(x => x.id !== R.id);
      data.reports.push(entry);
      data.reports.sort((a, b) => String(b.to).localeCompare(String(a.to)) || String(b.from).localeCompare(String(a.from)));
      try { await ghPut("reports/index.json", JSON.stringify(data, null, 1), idx && idx.sha, "Архів: " + R.id, token); break; }
      catch (e) { if (!(e.status === 409 || e.status === 422) || attempt === 2) throw e; }
    }
    ARCHIVE = ARCHIVE.filter(x => x.id !== R.id).concat([entry]);
    return { status: skipReport ? "same" : "saved" };
  }
  function errText(e) { return e && e.message && !/Failed to fetch|NetworkError|Load failed/i.test(e.message) ? e.message : "Немає зв'язку з GitHub. Перевірте інтернет і спробуйте ще раз."; }
  function markSaved(R) {
    STATE.saved = true; STATE.justSaved = true; STATE.saving = false; STATE.saveError = "";
    history.replaceState(null, "", "?r=" + encodeURIComponent(R.id));
    renderReport();
  }
  async function autoSave() {
    const R = STATE.report, token = getToken();
    try {
      const res = await persist(R, token, false);
      if (STATE.report !== R) return;
      if (res.status === "exists") {
        STATE.saving = false; renderReport();
        openSave("overwrite", res.old);
        return;
      }
      markSaved(R);
    } catch (e) {
      if (STATE.report !== R) return;
      if (e.status === 401) forgetToken();
      STATE.saving = false; STATE.saveError = errText(e);
      renderReport();
    }
  }

  /* ───── вікно збереження / налаштування доступу ───── */
  let modalMode = "save";
  function inviteLink() { return location.origin + location.pathname + "#access=" + encodeURIComponent(getToken()); }
  function openSave(mode, old) {
    modalMode = mode || "save";
    const has = !!getToken();
    $("saveErr").hidden = true;
    $("repoName").textContent = CFG.repo;
    $("tokenBox").hidden = has; $("tokenSaved").hidden = !has; $("invite").hidden = !has;
    $("tokenHelp").open = !has; $("tokenHelp").hidden = has;
    $("saveTitle").textContent = modalMode === "setup" ? "Доступ до збереження" : "Зберегти звіт в архів";
    $("saveIntro").hidden = modalMode === "setup" && has;
    $("saveGo").hidden = modalMode === "setup" && has;
    $("saveGo").textContent = modalMode === "setup" ? "Увімкнути збереження" : modalMode === "overwrite" ? "Перезаписати" : "Зберегти в архів";
    if (modalMode === "overwrite") {
      const R = STATE.report;
      $("saveErr").textContent = "Звіт за " + periodLabel(R.period.from, R.period.to) + " уже є в архіві" + (old && old.fileName ? " (файл " + old.fileName + ")" : "") + ". Перезаписати його цим файлом?";
      $("saveErr").hidden = false;
    }
    $("saveModal").hidden = false;
    setTimeout(() => (has ? ($("saveGo").hidden ? $("saveCancel") : $("saveGo")) : $("token")).focus(), 30);
  }
  function closeSave() { $("saveModal").hidden = true; if (!$("home").hidden) showHome(); }
  $("saveCancel").addEventListener("click", closeSave);
  $("saveModal").addEventListener("click", (e) => { if (e.target === $("saveModal")) closeSave(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("saveModal").hidden) closeSave(); });
  $("forgetToken").addEventListener("click", () => { forgetToken(); openSave(modalMode); });
  $("copyInvite").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(inviteLink()); toast("Посилання-запрошення скопійовано"); }
    catch (e) { prompt("Скопіюйте посилання-запрошення:", inviteLink()); }
  });
  $("setupLink").addEventListener("click", (e) => { e.preventDefault(); openSave("setup"); });
  $("saveGo").addEventListener("click", saveReport);
  async function saveReport() {
    const errEl = $("saveErr");
    errEl.hidden = true;
    let token = getToken();
    if (!token) {
      token = ($("token").value || "").trim();
      if (!/^(github_pat_|ghp_)[A-Za-z0-9_]{20,}$/.test(token)) { errEl.textContent = "Це не схоже на ключ GitHub: він починається з github_pat_ або ghp_."; errEl.hidden = false; return; }
      setToken(token, $("rememberToken").checked);
    }
    if (modalMode === "setup") { $("token").value = ""; openSave("setup"); toast("Збереження в архів увімкнено"); return; }
    const R = STATE.report;
    const btn = $("saveGo"); btn.disabled = true; const label = btn.textContent; btn.textContent = "Зберігаємо…";
    try {
      const res = await persist(R, token, modalMode === "overwrite");
      if (res.status === "exists") { btn.disabled = false; btn.textContent = label; openSave("overwrite", res.old); return; }
      closeSave();
      markSaved(R);
    } catch (e) {
      if (e.status === 401) forgetToken();
      errEl.textContent = errText(e);
      errEl.hidden = false;
      if (!getToken()) { $("tokenBox").hidden = false; $("tokenSaved").hidden = true; $("invite").hidden = true; }
    }
    btn.disabled = false; btn.textContent = label;
  }

  /* Посилання-запрошення: #access=<ключ> вмикає збереження на цьому пристрої й одразу зникає з адреси. */
  (function readInvite() {
    const m = location.hash.match(/access=([^&]+)/);
    if (!m) return;
    const t = decodeURIComponent(m[1]);
    history.replaceState(null, "", location.pathname + location.search);
    if (/^(github_pat_|ghp_)[A-Za-z0-9_]{20,}$/.test(t)) { setToken(t, true); setTimeout(() => toast("Збереження в архів увімкнено на цьому пристрої"), 6000); }
  })();

  /* ═════════════ ПОДІЇ ГОЛОВНОЇ ═════════════ */
  $("pick").addEventListener("click", () => $("file").click());
  $("file").addEventListener("change", e => handleFile(e.target.files && e.target.files[0]));
  const gate = $("gate");
  ["dragover", "dragenter"].forEach(ev => gate.addEventListener(ev, e => { e.preventDefault(); gate.classList.add("hot"); }));
  gate.addEventListener("dragleave", () => gate.classList.remove("hot"));
  gate.addEventListener("drop", e => { e.preventDefault(); gate.classList.remove("hot"); handleFile(e.dataTransfer.files && e.dataTransfer.files[0]); });
  $("homeLink").addEventListener("click", (e) => { if (!$("report").hidden) { e.preventDefault(); history.pushState(null, "", "./"); STATE = null; route(); } });
  document.addEventListener("click", (e) => {
    const a = e.target.closest && e.target.closest('.topnav a, a.arch-item');
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    history.pushState(null, "", a.getAttribute("href"));
    if (!new URLSearchParams(location.search).get("r")) STATE = null;
    route();
  });

  route();
})();
