/* Övningsbasen – static practice app. Content lives in content/*.json; this file is the engine. */
(function () {
  'use strict';

  var KEY = 'ovb-progress-v1';
  var app = document.getElementById('app');
  var rankEl = document.getElementById('rank');
  var manifest = null;
  var cache = {};
  var progress = loadProgress();
  var session = null; // current quiz state

  // ---------- storage (local now; sync adapter can wrap these two functions) ----------
  function loadProgress() {
    try { var p = JSON.parse(localStorage.getItem(KEY)); return (p && typeof p === 'object' && !Array.isArray(p)) ? p : {}; } catch (e) { return {}; }
  }
  function saveProgress() {
    try { localStorage.setItem(KEY, JSON.stringify(progress)); } catch (e) { /* private mode: keep in memory */ }
    renderRank();
  }
  function rec(id) { progress.items = progress.items || {}; return progress.items[id] = progress.items[id] || {}; }

  // ---------- ranks ----------
  var RANKS = [[0, 'Kadett'], [100, 'Fänrik'], [250, 'Löjtnant'], [500, 'Kapten'], [900, 'Örlogskapten'], [1500, 'Kommendörkapten'], [2500, 'Kommendör'], [4000, 'Amiral']];
  function rankOf(xp) { var r = RANKS[0]; for (var i = 0; i < RANKS.length; i++) if (xp >= RANKS[i][0]) r = RANKS[i]; return r; }
  function nextRank(xp) { for (var i = 0; i < RANKS.length; i++) if (xp < RANKS[i][0]) return RANKS[i]; return null; }
  function renderRank() {
    var xp = progress.xp || 0, r = rankOf(xp), n = nextRank(xp);
    rankEl.innerHTML = '<b>' + r[1] + '</b><br>' + xp + ' poäng' + (n ? '<span class="tonext">' + (n[0] - xp) + ' kvar till ' + n[1] + '</span>' : ' ⭐');
  }

  // ---------- text helpers ----------
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fracHTML(n, d) { return '<span class="frac" aria-label="' + esc(fracWords(n, d)) + '"><span>' + n + '</span><span>' + d + '</span></span>'; }
  // **bold**, fractions like 3/4 rendered stacked, line breaks
  function fmt(s) {
    var h = esc(s);
    h = h.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
    h = h.replace(/\[\[~(.+?)~\]\]/g, '<s lang="en">$1</s>');
    h = h.replace(/\[\[(.+?)\]\]/g, '<span lang="en" class="enw">$1</span>');
    h = h.replace(/(^|[^\d\/])(\d{1,2})\/(\d{1,2})(?![\d\/])([?!.,:]?)/g, function (m, pre, n, d, p) { return pre + '<span class="nw">' + fracHTML(n, d) + p + '</span>'; });
    return h.replace(/\n/g, '<br>');
  }
  var NUM = ['noll', 'en', 'två', 'tre', 'fyra', 'fem', 'sex', 'sju', 'åtta', 'nio', 'tio', 'elva', 'tolv'];
  var ORD = { 3: 'tredjedel', 4: 'fjärdedel', 5: 'femtedel', 6: 'sjättedel', 7: 'sjundedel', 8: 'åttondel', 9: 'niondel', 10: 'tiondel', 11: 'elftedel', 12: 'tolftedel', 20: 'tjugondel' };
  function fracWords(n, d) {
    n = +n; d = +d;
    if (d === 1) return (NUM[n] || n) + ' hela';
    if (d === 2) return n === 1 ? 'en halv' : (NUM[n] || n) + ' halvor';
    if (ORD[d] && n <= 12) return (NUM[n] || n) + ' ' + ORD[d] + (n === 1 ? '' : 'ar');
    return n + ' delat med ' + d;
  }
  function speechText(s) {
    return String(s || '').replace(/\*\*/g, '').replace(/−\s?(?=\d)/g, function (m, o, str) { return /\d\s*$/.test(str.slice(0, o)) ? ' minus ' : 'minus '; }).replace(/→/g, ', sedan ').replace(/(\d\s*)=/g, '$1 blir ').replace(/=\s*(?=\d)/g, ' blir ').replace(/=/g, ', ').replace(/_{2,}/g, ', … ,').replace(/(\d{1,2})\/(\d{1,2})/g, function (m, n, d) { return fracWords(n, d); });
  }

  // ---------- read aloud (Swedish) ----------
  var voices = {};
  function pickVoice() {
    if (!('speechSynthesis' in window)) return;
    var vs = speechSynthesis.getVoices() || [];
    voices.sv = vs.filter(function (v) { return /^sv/i.test(v.lang); })[0] || null;
    voices.en = vs.filter(function (v) { return /^en-GB/i.test(v.lang); })[0] || vs.filter(function (v) { return /^en/i.test(v.lang); })[0] || null;
  }
  if ('speechSynthesis' in window) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
  function speakBtn(text, lang, label) {
    if (!('speechSynthesis' in window)) return '';
    var en = lang === 'en';
    return '<button class="speak' + (label ? ' speak-lbl' : '') + '" type="button" data-say="' + esc(text) + '"' + (en ? ' data-lang="en"' : '') + ' aria-label="' + (en ? 'Lyssna på engelska' : 'Läs upp') + '">🔊' + (label ? ' ' + esc(label) : '') + '</button>';
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-say]');
    if (!b) return;
    try {
      speechSynthesis.cancel();
      var allEn = b.getAttribute('data-lang') === 'en';
      String(b.getAttribute('data-say')).split(/\[\[|\]\]/).forEach(function (seg, i) {
        var en = allEn || i % 2 === 1;
        seg = en ? seg.replace(/\*\*|~/g, '').replace(/_{2,}/g, ', … ,') : speechText(seg);
        if (!seg.replace(/[\s.,…]/g, '')) return;
        var u = new SpeechSynthesisUtterance(seg);
        u.lang = en ? 'en-GB' : 'sv-SE'; u.rate = en ? 0.85 : 0.92;
        var v = en ? voices.en : voices.sv; if (v) u.voice = v;
        speechSynthesis.speak(u);
      });
    } catch (err) { /* ignore */ }
  });

  // ---------- visuals (SVG generators) ----------
  var C = { fill: '#3fa7d6', fill2: '#ffb703', line: '#1b2333', soft: '#dbe7f3' };
  function bar(o) {
    var w = 300, h = 46, parts = o.parts, fw = w / parts, s = '';
    for (var i = 0; i < parts; i++) s += '<rect x="' + (10 + i * fw) + '" y="8" width="' + fw + '" height="' + h + '" fill="' + (i < o.filled ? (o.color || C.fill) : i < o.filled + (o.filled2 || 0) ? C.fill2 : '#fff') + '" stroke="' + C.line + '" stroke-width="2"/>';
    return '<svg viewBox="0 0 320 62" role="img" aria-label="' + esc(o.label || (o.filled + ' av ' + parts + ' delar färgade')) + '">' + s + '</svg>';
  }
  function compareBars(o) {
    var rows = o.rows, h = rows.length * 62 + 6, s = '';
    rows.forEach(function (r, k) {
      var fw = 240 / r.parts, y = 6 + k * 62;
      for (var i = 0; i < r.parts; i++) s += '<rect x="' + (10 + i * fw) + '" y="' + y + '" width="' + fw + '" height="44" fill="' + (i < r.filled ? (k % 2 ? C.fill2 : C.fill) : '#fff') + '" stroke="' + C.line + '" stroke-width="2"/>';
      s += svgFrac(285, y + 18, r.filled, r.parts, 18);
    });
    return '<svg viewBox="0 0 320 ' + h + '" role="img" aria-label="' + esc(o.label || 'Jämförelse av bråk') + '">' + s + '</svg>';
  }
  function svgFrac(x, y, n, d, size) {
    var f = 'font-family="Lexend,sans-serif" font-weight="700" text-anchor="middle" fill="' + C.line + '" font-size="' + size + '"';
    return '<text x="' + x + '" y="' + y + '" ' + f + '>' + n + '</text>' +
      '<line x1="' + (x - size * 0.45) + '" y1="' + (y + 4) + '" x2="' + (x + size * 0.45) + '" y2="' + (y + 4) + '" stroke="' + C.line + '" stroke-width="2"/>' +
      '<text x="' + x + '" y="' + (y + size + 5) + '" ' + f + '>' + d + '</text>';
  }
  function lineRow(r, y, showLabels) {
    var x0 = 30, x1 = 290, len = x1 - x0, s = '';
    s += '<line x1="' + x0 + '" y1="' + y + '" x2="' + x1 + '" y2="' + y + '" stroke="' + C.line + '" stroke-width="3" stroke-linecap="round"/>';
    if (r.highlight != null) {
      var hx = x0 + len * r.highlight / r.den;
      s += '<line x1="' + x0 + '" y1="' + y + '" x2="' + hx + '" y2="' + y + '" stroke="' + (r.color || C.fill) + '" stroke-width="8" stroke-linecap="round"/>';
    }
    for (var i = 0; i <= r.den; i++) {
      var x = x0 + len * i / r.den, end = (i === 0 || i === r.den);
      s += '<line x1="' + x + '" y1="' + (y - (end ? 12 : 8)) + '" x2="' + x + '" y2="' + (y + (end ? 12 : 8)) + '" stroke="' + C.line + '" stroke-width="' + (end ? 3 : 2) + '"/>';
      if (end) s += '<text x="' + x + '" y="' + (y + 34) + '" font-size="18" text-anchor="middle" font-family="Lexend,sans-serif" font-weight="700" fill="' + C.line + '">' + (i === 0 ? '0' : '1') + '</text>';
      else if (showLabels) s += svgFrac(x, y + 28, i, r.den, 14);
    }
    if (r.highlight != null && r.icon) {
      var ix = x0 + len * r.highlight / r.den;
      s += '<text x="' + ix + '" y="' + (y - 16) + '" font-size="24" text-anchor="middle">' + r.icon + '</text>';
    }
    if (r.arrow != null) {
      var ax = x0 + len * r.arrow / r.den;
      s += '<path d="M' + ax + ' ' + (y - 14) + ' l-9 -16 h18 z" fill="#e85d04"/>';
    }
    return s;
  }
  function numberLine(o) {
    var showLabels = o.labels === 'all';
    var s = lineRow(o, 52, showLabels);
    return '<svg viewBox="0 0 320 ' + (showLabels ? 112 : 96) + '" role="img" aria-label="' + esc(o.label || 'Tallinje från 0 till 1') + '">' + s + '</svg>';
  }
  function compareLines(o) {
    var s = '', gap = 84, top = 44, h = top + gap * (o.rows.length - 1) + 60;
    o.rows.forEach(function (r, k) { s += lineRow(r, top + k * gap, true); });
    if (o.guide != null) {
      var gx = 30 + 260 * o.guide;
      o.rows.forEach(function (r, k) { var y = top + k * gap; s += '<line x1="' + gx + '" y1="' + (y - 22) + '" x2="' + gx + '" y2="' + (y + 10) + '" stroke="#e85d04" stroke-width="2.5" stroke-dasharray="5 4"/>'; });
    }
    return '<svg viewBox="0 0 320 ' + h + '" role="img" aria-label="' + esc(o.label || 'Tallinjer som jämförs') + '">' + s + '</svg>';
  }
  function groups(o) {
    var per = o.total / o.groups, cols = Math.min(per, 6), rows = Math.ceil(per / cols);
    var bw = cols * 30 + 16, bh = rows * 30 + 14, gpr = Math.max(1, Math.min(o.groups, Math.floor(300 / (bw + 8))));
    if (o.groups === 4 && gpr === 3) gpr = 2;
    var grows = Math.ceil(o.groups / gpr), W = gpr * (bw + 8) + 8, H = grows * (bh + 10) + 6, s = '';
    for (var g = 0; g < o.groups; g++) {
      var gx = 8 + (g % gpr) * (bw + 8), gy = 6 + Math.floor(g / gpr) * (bh + 10), on = g < (o.highlight || 0);
      s += '<rect x="' + gx + '" y="' + gy + '" width="' + bw + '" height="' + bh + '" rx="10" fill="' + (on ? '#fff1c7' : '#f3f6fa') + '" stroke="' + (on ? '#e09f00' : '#b8c6d6') + '" stroke-width="' + (on ? 3 : 2) + '"/>';
      for (var i = 0; i < per; i++) {
        var x = gx + 8 + (i % cols) * 30 + 15, y = gy + 8 + Math.floor(i / cols) * 30 + 22;
        s += '<text x="' + x + '" y="' + y + '" font-size="22" text-anchor="middle">' + (o.icon || '⭐') + '</text>';
      }
    }
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" style="max-width:' + Math.max(W, 200) + 'px" role="img" aria-label="' + esc(o.label || (o.total + ' saker i ' + o.groups + ' lika stora grupper')) + '">' + s + '</svg>';
  }
  function pie(o) {
    // o: {parts, filled, filled2?, count?} – one or more round pizzas/cakes cut in equal slices
    var n = o.parts, cnt = o.count || 1, r = 64, s = '', k = 0;
    for (var p = 0; p < cnt; p++) {
      var cx = 76 + p * 156, cy = 76;
      for (var i = 0; i < n; i++, k++) {
        var col = k < o.filled ? C.fill : k < o.filled + (o.filled2 || 0) ? C.fill2 : '#fff';
        if (n === 1) { s += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="' + col + '" stroke="' + C.line + '" stroke-width="2.5"/>'; continue; }
        var a0 = (i / n) * 2 * Math.PI - Math.PI / 2, a1 = ((i + 1) / n) * 2 * Math.PI - Math.PI / 2;
        var x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0), x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
        s += '<path d="M' + cx + ' ' + cy + ' L' + x0.toFixed(2) + ' ' + y0.toFixed(2) + ' A' + r + ' ' + r + ' 0 0 1 ' + x1.toFixed(2) + ' ' + y1.toFixed(2) + ' Z" fill="' + col + '" stroke="' + C.line + '" stroke-width="2.5" stroke-linejoin="round"/>';
      }
    }
    var W = cnt * 156 - 4;
    return '<svg viewBox="0 0 ' + W + ' 152" style="max-width:' + (cnt === 1 ? 210 : Math.min(W, 380)) + 'px" role="img" aria-label="' + esc(o.label || (cnt > 1 ? cnt + ' cirklar, var och en delad i ' + n + ' lika stora bitar' : 'Cirkel delad i ' + n + ' lika stora bitar, ' + o.filled + ' färgade')) + '">' + s + '</svg>';
  }
  function itemSet(o) {
    // o: {items:[emoji...], gone:[indexes shown as eaten/removed]}
    var gone = o.gone || [];
    return '<div class="set" role="img" aria-label="' + esc(o.label || o.items.length + ' saker') + '">' + o.items.map(function (it, i) {
      return '<span class="' + (gone.indexOf(i) >= 0 ? 'gone' : '') + '" aria-hidden="true">' + esc(it) + '</span>';
    }).join('') + '</div>';
  }
  function word(v) {
    return '<div class="word"><div class="emo" aria-hidden="true">' + esc(v.emoji || '') + '</div><div class="en" lang="en">' + esc(v.en) + '</div><div class="sv">' + esc(v.sv) + '</div>' + speakBtn(v.en, 'en', 'Lyssna') + '</div>';
  }
  function visual(v) {
    if (!v) return '';
    if (v.type === 'word') return '<div class="vis">' + word(v) + '</div>';
    if (v.type === 'intLine' || v.type === 'barModel' || v.type === 'table') {
      var inner = v.type === 'intLine' ? intLineSVG(v) : v.type === 'barModel' ? barStatic(v) : tableHTML(v, v.answer);
      return '<div class="vis">' + inner + (v.caption ? '<div class="note">' + fmt(v.caption) + '</div>' : '') + '</div>';
    }
    var f = { bar: bar, compareBars: compareBars, numberLine: numberLine, compareLines: compareLines, groups: groups, pie: pie, set: itemSet }[v.type];
    var svg = f ? f(v) : (v.type === 'emoji' ? '<div style="font-size:48px">' + esc(v.text) + '</div>' : '');
    return '<div class="vis">' + svg + (v.caption ? '<div class="note">' + fmt(v.caption) + '</div>' : '') + '</div>';
  }

  // ---------- answer checking ----------
  function norm(s) { return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim().replace(/^["'“”]+|[.!?,;:"'“”]+$/g, '').trim(); }
  function strip(s) { return s.normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  function lev(a, b) {
    var m = a.length, n = b.length, d = [], i, j;
    for (i = 0; i <= m; i++) d[i] = [i];
    for (j = 0; j <= n; j++) d[0][j] = j;
    for (i = 1; i <= m; i++) for (j = 1; j <= n; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[m][n];
  }
  // returns {status:'ok'|'near'|'no'|'digits', shown, key}
  function parseNumber(raw) {
    var m = String(raw || '').trim().toLowerCase().match(/^(-?\d+)\s*(?:%|[a-zåäö]*)\s*[.!]?$/);
    return m ? m[1] : null;
  }
  function checkText(q, raw) {
    var accepted = q.answer.map(norm), v = norm(raw);
    if (q.input === 'number') {
      if (!/\d/.test(String(raw))) return { status: 'digits' };
      var num = parseNumber(raw);
      if (num == null) return { status: 'no', key: v.replace(/\s/g, '') };
      return { status: accepted.indexOf(num) >= 0 ? 'ok' : 'no', key: num };
    }
    if (q.input === 'fraction') {
      v = v.replace(/\s/g, '');
      return { status: accepted.some(function (a) { return a.replace(/\s/g, '') === v; }) ? 'ok' : 'no', key: v };
    }
    if (accepted.indexOf(v) >= 0) return { status: 'ok' };
    if (q.strict) return { status: 'no', key: v };
    for (var k = 0; k < accepted.length; k++) {
      var a = accepted[k];
      if (strip(a) === strip(v)) return { status: 'near', shown: q.answer[k] };
      var tol = a.length >= 8 ? 2 : (a.length >= 4 ? 1 : 0);
      if (tol && lev(a, v) <= tol) return { status: 'near', shown: q.answer[k] };
    }
    return { status: 'no', key: v };
  }
  function sameSet(a, b) { if (a.length !== b.length) return false; var x = a.slice().sort(), y = b.slice().sort(); return x.every(function (v, i) { return v === y[i]; }); }
  var answerLang = null; // set per assignment ("en" for glosor)
  function answerText(q) {
    if (q.type === 'single') return q.options[q.answer];
    if (q.type === 'multi') return q.answer.map(function (i) { return String(q.options[i]).replace(/\.(\]\])?$/, '$1'); }).join(' och ');
    return answerLang === 'en' ? '[[' + q.answer[0] + ']]' : q.answer[0];
  }

  // ---------- question rendering (shared by learn "try" and tests) ----------
  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function renderQuestion(q, box, onDone, opts) {
    if (q.type === 'mission') return renderMission(q, box, onDone, opts);
    opts = opts || {};
    var order = (q.type === 'single' || q.type === 'multi') ? (q.keepOrder ? q.options.map(function (_, i) { return i; }) : shuffle(q.options.map(function (_, i) { return i; }))) : null;
    var name = 'q' + Math.random().toString(36).slice(2, 8);
    var need = q.type === 'multi' ? q.answer.length : 1;
    var say = q.q + (order ? '. ' + order.map(function (oi, k) { return 'Svar ' + (k + 1) + ': ' + q.options[oi]; }).join('. ') : '');
    var html = '<div class="qrow"><div class="q">' + fmt(q.q) + '</div>' + speakBtn(say) + '</div>' + visual(q.visual);
    if (q.type === 'multi') html += '<p class="hint-count" aria-live="polite">Välj ' + need + ' svar.</p>';
    if (order) {
      html += '<div class="opts' + (q.options.length === 4 && q.options.every(function (o) { return String(o).length < 22; }) ? ' two' : '') + '" role="' + (q.type === 'multi' ? 'group' : 'radiogroup') + '" aria-label="Svarsalternativ">';
      order.forEach(function (oi) {
        html += '<label class="opt" data-i="' + oi + '"><input type="' + (q.type === 'multi' ? 'checkbox' : 'radio') + '" name="' + name + '" value="' + oi + '"><span class="otext">' + fmt(q.options[oi]) + '</span><span class="mark" aria-hidden="true"></span></label>';
      });
      html += '</div>';
    } else if (q.input === 'fraction') {
      html += '<div class="fracin"><input inputmode="numeric" pattern="[0-9]*" aria-label="Täljare" class="fn" autocomplete="off"><div class="bar"></div><input inputmode="numeric" pattern="[0-9]*" aria-label="Nämnare" class="fd" autocomplete="off"></div>';
    } else {
      html += '<input class="txt" ' + (q.input === 'number' ? 'inputmode="numeric"' : 'autocapitalize="off" autocorrect="off" spellcheck="false"') + ' autocomplete="off" aria-label="Skriv ditt svar" placeholder="Skriv ditt svar här">';
    }
    if (q.hint) html += '<details class="note hint"><summary>Behöver du en ledtråd?</summary>' + fmt(q.hint) + '</details>';
    html += '<div class="fbwrap" aria-live="polite"></div><div class="row end"><button class="btn check" type="button" disabled>Kolla svaret</button></div>';
    box.innerHTML = html;

    // ignore taps for a moment so a double-tap on the previous button can't pick an answer
    box.classList.add('guard');
    setTimeout(function () { box.classList.remove('guard'); }, 450);

    var checkBtn = box.querySelector('.check'), fbw = box.querySelector('.fbwrap'), countEl = box.querySelector('.hint-count'), answered = false;
    function current() {
      if (order) return Array.prototype.map.call(box.querySelectorAll('input:checked'), function (i) { return +i.value; });
      if (q.input === 'fraction') { var n = box.querySelector('.fn').value.trim(), d = box.querySelector('.fd').value.trim(); return (n && d) ? n + '/' + d : ''; }
      return box.querySelector('.txt').value;
    }
    function refresh() {
      if (answered) return;
      var c = current();
      if (q.type === 'multi') {
        checkBtn.disabled = c.length !== need;
        Array.prototype.forEach.call(box.querySelectorAll('input'), function (i) { i.disabled = !i.checked && c.length >= need; });
        var left = need - c.length;
        countEl.textContent = left > 0 ? 'Välj ' + left + (c.length ? ' till.' : ' svar.') : 'Klart! Tryck på Kolla svaret.';
      } else checkBtn.disabled = Array.isArray(c) ? c.length === 0 : !String(c).trim();
      if (order) Array.prototype.forEach.call(box.querySelectorAll('.opt'), function (l) { l.classList.toggle('sel', l.querySelector('input').checked); });
    }
    box.addEventListener('input', refresh);
    box.addEventListener('change', refresh);
    box.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' || checkBtn.disabled || answered || e.target.tagName !== 'INPUT') return;
      e.preventDefault(); checkBtn.click();
    });
    checkBtn.addEventListener('click', function () {
      if (answered) return;
      var c = current(), res;
      if (q.type === 'single') res = { status: c[0] === q.answer ? 'ok' : 'no', key: String(c[0]) };
      else if (q.type === 'multi') res = { status: sameSet(c, q.answer) ? 'ok' : 'no', key: c.slice().sort().join(',') };
      else res = checkText(q, c);
      if (countEl && res.status !== 'digits') countEl.remove();
      if (res.status === 'digits') { fbw.innerHTML = '<div class="fb near pop"><span class="head">Skriv svaret med siffror</span>Till exempel: 5</div>'; return; }
      answered = true;
      Array.prototype.forEach.call(box.querySelectorAll('input'), function (i) { i.disabled = true; });
      if (order) Array.prototype.forEach.call(box.querySelectorAll('.opt'), function (l) {
        var i = +l.getAttribute('data-i'), isRight = q.type === 'single' ? i === q.answer : q.answer.indexOf(i) >= 0, picked = l.querySelector('input').checked, mk = l.querySelector('.mark');
        if (isRight && picked) { l.classList.add('right'); mk.textContent = '✓ Ditt svar'; }
        else if (isRight) { l.classList.add('right', 'missed'); mk.textContent = '✓ Rätt svar'; }
        else if (picked) { l.classList.add('wrong'); mk.textContent = '✗ Ditt svar'; }
      });
      var custom = res.status === 'no' && q.wrongFeedback && res.key != null && q.wrongFeedback[res.key];
      var msg;
      if (res.status === 'ok') msg = '<span class="head">' + pick(['Rätt! 🎉', 'Snyggt! ⭐', 'Precis! 🚀', 'Helt rätt! 💪']) + '</span>' + (q.explain ? fmt(q.explain) : '');
      else if (res.status === 'near') msg = '<span class="head">Nästan rätt – räknas som rätt! 👍</span>Det stavas: <b>' + esc(res.shown) + '</b>' + (q.explain ? '<br>' + fmt(q.explain) : '');
      else msg = '<span class="head">Inte riktigt – bra försök!</span>' + (custom ? fmt(custom) + '<br>' : '') + 'Rätt svar: <b>' + fmt(answerText(q)) + '</b>' + (q.explain ? '<br>' + fmt(q.explain) : '');
      var sayFb = (res.status === 'ok' ? 'Rätt! ' : res.status === 'near' ? 'Nästan rätt. Det stavas ' + res.shown + '. ' : 'Inte riktigt. ' + (custom || '') + ' Rätt svar: ' + answerText(q) + '. ') + (q.explain || '');
      fbw.innerHTML = '<div class="fb ' + (res.status === 'ok' ? 'ok' : res.status === 'near' ? 'near' : 'no') + ' pop">' + msg + '<div class="row end" style="margin-top:6px">' + speakBtn(sayFb) + '</div></div>';
      checkBtn.remove();
      onDone(res.status !== 'no', fbw);
    });
    var first = box.querySelector('input'); if (first && q.type === 'text' && opts.autofocus !== false) setTimeout(function () { try { first.focus({ preventScroll: true }); } catch (e) { } }, 50);
  }
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }

  // ---------- missions: model first, then maths ----------
  // A mission shows the story (sentences or clue cards) and walks through steps.
  // Each step renderer gets (step, ctx, done) and returns { show: fn } for "Visa mig".
  function normNum(s) { return String(s == null ? '' : s).replace(/[−–—]/g, '-').replace(/\s+/g, '').replace(/^\+/, ''); }
  function intLineSVG(o) {
    // o: {min,max,start,marks:[{at,label}],jumps:[{from,to}], pos, tick, label}
    var x0 = 22, x1 = 298, len = x1 - x0, y = 70, span = o.max - o.min, s = '';
    var X = function (v) { return x0 + len * (v - o.min) / span; };
    var tick = o.tick || (span <= 24 ? 1 : span <= 60 ? 5 : span <= 120 ? 10 : 50);
    var lab = o.labelEvery || (span <= 12 ? 1 : span <= 24 ? 2 : span <= 60 ? 10 : span <= 120 ? 20 : 100);
    s += '<line x1="' + x0 + '" y1="' + y + '" x2="' + x1 + '" y2="' + y + '" stroke="' + C.line + '" stroke-width="3"/>';
    for (var v = Math.ceil(o.min / tick) * tick; v <= o.max; v += tick) {
      var big = v % lab === 0, zero = v === 0;
      s += '<line x1="' + X(v) + '" y1="' + (y - (big ? 9 : 5)) + '" x2="' + X(v) + '" y2="' + (y + (big ? 9 : 5)) + '" stroke="' + (zero ? '#e85d04' : C.line) + '" stroke-width="' + (zero ? 3 : 1.5) + '"/>';
      if (big) s += '<text x="' + X(v) + '" y="' + (y + 28) + '" font-size="13" text-anchor="middle" font-family="Lexend,sans-serif" font-weight="' + (zero ? 700 : 600) + '" fill="' + (zero ? '#b54700' : C.line) + '">' + (v < 0 ? '−' + (-v) : v) + '</text>';
    }
    (o.jumps || []).forEach(function (j, i) {
      var a = X(j.from), b = X(j.to), mid = (a + b) / 2, h = 18 + Math.min(26, Math.abs(b - a) / 5), up = j.to > j.from;
      s += '<path d="M' + a + ' ' + (y - 6) + ' Q ' + mid + ' ' + (y - 6 - h * 2) + ' ' + b + ' ' + (y - 6) + '" fill="none" stroke="' + (up ? '#e85d04' : '#1d6fa3') + '" stroke-width="2.5"/>';
      s += '<path d="M' + b + ' ' + (y - 6) + ' l' + (up ? '-7 -6' : '7 -6') + ' m' + (up ? '7 6' : '-7 6') + ' l' + (up ? '-2 -9' : '2 -9') + '" stroke="' + (up ? '#e85d04' : '#1d6fa3') + '" stroke-width="2.5" fill="none"/>';
      var d = j.to - j.from;
      s += '<text x="' + mid + '" y="' + (y - 10 - h) + '" font-size="13" text-anchor="middle" font-family="Lexend,sans-serif" font-weight="700" fill="' + (up ? '#b54700' : '#155a85') + '">' + (d > 0 ? '+' + d : '−' + (-d)) + '</text>';
    });
    (o.marks || []).forEach(function (m) {
      s += '<circle cx="' + X(m.at) + '" cy="' + y + '" r="7" fill="' + (m.color || '#1d6fa3') + '" stroke="#fff" stroke-width="2"/>';
      if (m.label) s += '<text x="' + X(m.at) + '" y="' + (y + 46) + '" font-size="12" text-anchor="middle" font-family="Lexend,sans-serif" fill="' + C.line + '">' + esc(m.label) + '</text>';
    });
    return '<svg class="intline" viewBox="0 0 320 ' + (o.marks && o.marks.some(function (m) { return m.label; }) ? 124 : 108) + '" role="img" aria-label="' + esc(o.label || ('Tallinje från ' + o.min + ' till ' + o.max)) + '">' + s + '</svg>';
  }
  function fmtNum(v) { v = +v; return v < 0 ? '−' + (-v) : String(v); }

  function barHTML(model, vals, labels, editable) {
    // vals: slot -> display string; editable: wrap slots as buttons
    var partNames = labels.parts && labels.parts.indexOf('|') >= 0 ? labels.parts.split('|').map(function (x) { return x.trim(); }) : null;
    function slot(k, grow, cls, name) {
      var v = vals[k], txt = v == null || v === '' ? '' : (v === '?' ? '?' : v);
      return '<' + (editable ? 'button type="button"' : 'div') + ' class="bm-box ' + (cls || '') + (txt === '?' ? ' q' : '') + (txt === '' ? ' empty' : '') + (name ? ' named' : '') + '" data-slot="' + k + '" style="flex-grow:' + grow + '"><span class="bv">' + (txt === '' ? (editable ? '▢' : '') : esc(txt)) + '</span>' + (name ? '<span class="bn">' + esc(name) + '</span>' : '') + '</' + (editable ? 'button' : 'div') + '>';
    }
    var h = '';
    if (model.type === 'partwhole') {
      h += '<div class="bm-row"><span class="bm-lab">' + esc(labels.whole || 'Helhet') + '</span><div class="bm-bar">' + slot('whole', 1, 'whole') + '</div></div>';
      h += '<div class="bm-row"><span class="bm-lab">' + esc(partNames ? 'Delar' : (labels.parts || 'Delar')) + '</span><div class="bm-bar">' + model.sizes.map(function (sz, i) { return slot('p' + i, sz, 'part p' + (i % 3), partNames && partNames[i]); }).join('') + '</div></div>';
    } else if (model.type === 'compare') {
      var big = model.sizes[0], small = model.sizes[1];
      h += '<div class="bm-row"><span class="bm-lab">' + esc(labels.big || 'Störst') + '</span><div class="bm-bar">' + slot('big', big, 'part p0') + '</div></div>';
      h += '<div class="bm-row"><span class="bm-lab">' + esc(labels.small || 'Minst') + '</span><div class="bm-bar">' + slot('small', small, 'part p1') + slot('diff', big - small, 'diff') + '</div></div>';
      h += '<div class="bm-note">streckad ruta = skillnaden</div>';
    } else if (model.type === 'groups') {
      h += '<div class="bm-row"><span class="bm-lab">' + esc(labels.whole || 'Totalt') + '</span><div class="bm-bar">' + slot('whole', 1, 'whole') + '</div></div>';
      var boxes = '';
      for (var i = 0; i < model.n; i++) boxes += i === 0 ? slot('per', 1, 'part p0') : '<div class="bm-box part p0 mirror" style="flex-grow:1">' + esc(vals.per == null || vals.per === '' ? '' : vals.per) + '</div>';
      h += '<div class="bm-row"><span class="bm-lab">' + esc(labels.parts || (model.n + ' lika delar')) + '</span><div class="bm-bar">' + boxes + '</div></div>';
    }
    return '<div class="barmodel">' + h + '</div>';
  }
  function barStatic(o) { return barHTML({ type: o.model, sizes: o.sizes, n: o.n }, o.values || {}, o.labels || {}, false); }

  function tableHTML(t, answer) {
    var h = '<table class="ptable"><thead><tr><th></th>' + t.cols.map(function (c) { return '<th>' + esc(c.name) + '</th>'; }).join('') + '</tr></thead><tbody>';
    t.rows.forEach(function (r, i) {
      h += '<tr><th>' + esc(r) + '</th>' + t.cols.map(function (c, j) {
        var v = answer && answer[i] ? answer[i][j] : '';
        return '<td>' + esc(v || '') + '</td>';
      }).join('') + '</tr>';
    });
    return h + '</tbody></table>';
  }

  var STEP = {};
  STEP.tap = function (st, ctx, done) {
    var box = ctx.stepBox, sents = ctx.panel.querySelectorAll('.sent');
    box.innerHTML = '<p class="sprompt">' + fmt(st.prompt || 'Tryck på meningen som är frågan.') + '</p><div class="sfb" aria-live="polite"></div>';
    var fb = box.querySelector('.sfb'), finished = false;
    Array.prototype.forEach.call(sents, function (b) { b.disabled = false; b.classList.add('tappable'); });
    function finish(helped) {
      finished = true;
      Array.prototype.forEach.call(sents, function (b) { b.disabled = true; b.classList.remove('tappable'); });
      st.answer.forEach(function (i) { sents[i].classList.add('isq'); });
      done(helped);
    }
    ctx.onSent = function (i) {
      if (finished) return;
      if (st.answer.indexOf(i) >= 0) { fb.innerHTML = '<div class="fb ok pop"><span class="head">Rätt! ⭐</span>' + fmt(st.why || 'Frågan berättar vad du ska ta reda på.') + '</div>'; finish(false); }
      else fb.innerHTML = '<div class="fb near pop">' + fmt(st.wrong || 'Det där är en ledtråd. Frågan är meningen som frågar något – ofta slutar den med **?**') + '</div>';
    };
    return { show: function () { fb.innerHTML = '<div class="fb ok pop"><span class="head">Så här:</span>' + fmt(st.why || 'Frågan är den markerade meningen.') + '</div>'; finish(true); } };
  };
  STEP.word = function (st, ctx, done) {
    var box = ctx.stepBox, sent = ctx.sentences[st.sentence];
    var words = sent.split(/(\s+)/);
    box.innerHTML = '<p class="sprompt">' + fmt(st.prompt || 'Tryck på ordet som visar vad som händer.') + '</p><p class="wordrow">' +
      words.map(function (w, i) { return /\s/.test(w) ? ' ' : '<button type="button" class="wbtn" data-w="' + i + '">' + esc(w) + '</button>'; }).join('') + '</p><div class="sfb" aria-live="polite"></div>';
    var fb = box.querySelector('.sfb'), finished = false;
    var clean = function (w) { return w.toLowerCase().replace(/[.,!?:;]/g, ''); };
    function finish(helped) {
      finished = true;
      Array.prototype.forEach.call(box.querySelectorAll('.wbtn'), function (b) { b.disabled = true; if (st.answer.indexOf(clean(b.textContent)) >= 0) b.classList.add('hit'); });
      done(helped);
    }
    box.addEventListener('click', function (e) {
      var b = e.target.closest('.wbtn'); if (!b || finished) return;
      if (st.answer.indexOf(clean(b.textContent)) >= 0) { fb.innerHTML = '<div class="fb ok pop"><span class="head">Precis! 🎯</span>' + fmt(st.why || '') + '</div>'; finish(false); }
      else { b.classList.add('miss'); fb.innerHTML = '<div class="fb near pop">' + fmt(st.wrong || 'Inte det ordet. Leta efter ordet som berättar vad som händer eller vad vi jämför.') + '</div>'; }
    });
    return { show: function () { fb.innerHTML = '<div class="fb ok pop"><span class="head">Så här:</span>' + fmt(st.why || '') + '</div>'; finish(true); } };
  };
  var TOOLS = { numberline: ['📏', 'Tallinje'], table: ['📋', 'Tabell'], bar: ['📊', 'Stapelmodell'] };
  function shuffleKeys(k, mix) { return mix ? shuffle(k) : k; }
  STEP.tool = function (st, ctx, done) {
    var box = ctx.stepBox, opts = st.options || TOOLS;
    box.innerHTML = '<p class="sprompt">' + fmt(st.prompt || 'Vilket verktyg passar för den här uppgiften?') + '</p><div class="tools' + (st.options ? ' alt' : '') + '">' +
      shuffleKeys(Object.keys(opts), !!st.options).map(function (k) { return '<button type="button" class="toolbtn" data-t="' + esc(k) + '">' + (opts[k][0] ? '<span class="ti">' + opts[k][0] + '</span>' : '') + esc(opts[k][1]) + '</button>'; }).join('') + '</div><div class="sfb" aria-live="polite"></div>';
    var fb = box.querySelector('.sfb'), finished = false;
    function finish(helped) { finished = true; Array.prototype.forEach.call(box.querySelectorAll('.toolbtn'), function (b) { b.disabled = true; if (b.getAttribute('data-t') === st.answer) b.classList.add('hit'); }); done(helped); }
    box.addEventListener('click', function (e) {
      var b = e.target.closest('.toolbtn'); if (!b || finished) return;
      if (b.getAttribute('data-t') === st.answer) { fb.innerHTML = '<div class="fb ok pop"><span class="head">Bra val! 🧰</span>' + fmt(st.why || '') + '</div>'; finish(false); }
      else { b.classList.add('miss'); fb.innerHTML = '<div class="fb near pop">' + fmt((st.wrong && st.wrong[b.getAttribute('data-t')]) || (st.options ? (st.label === 'Välj uträkning' ? 'Hmm, prova en annan uträkning. ' : 'Hmm, prova en annan modell. ') : 'Hmm, prova ett annat verktyg. ') + (st.hint || '')) + '</div>'; }
    });
    return { show: function () { fb.innerHTML = '<div class="fb ok pop"><span class="head">Så här:</span>' + fmt(st.why || '') + '</div>'; finish(true); } };
  };
  STEP.numberline = function (st, ctx, done) {
    var box = ctx.stepBox, pos = null, jumps = [], finished = false, dir = st.firstDir || null;
    var up = (st.labels && st.labels.up) || 'Uppåt (+)', down = (st.labels && st.labels.down) || 'Nedåt (−)';
    var mode = st.target != null ? 'target' : 'jumps';
    var end = mode === 'target' ? st.target : st.start + (st.jumps || []).reduce(function (a, b) { return a + b; }, 0);
    function draw() {
      var marks = [];
      if (pos != null) {
        if (mode === 'target') marks.push({ at: st.target, color: '#2a9d8f', label: st.targetLabel || 'mål' });
        marks.push({ at: jumps.length ? jumps[0].from : pos, color: '#1d6fa3', label: jumps.length ? '' : 'start' });
        if (jumps.length) marks.push({ at: pos, color: '#e85d04', label: (mode === 'target' && pos === st.target) ? '' : 'nu: ' + fmtNum(pos) });
      }
      box.querySelector('.nlwrap').innerHTML = intLineSVG({ min: st.min, max: st.max, tick: st.tick, labelEvery: st.labelEvery, marks: marks, jumps: jumps });
      box.querySelector('.undo').disabled = finished || !jumps.length;
      box.querySelector('.jlog').textContent = jumps.length ? 'Dina hopp: ' + jumps.map(function (j) { var d = j.to - j.from; return d > 0 ? '+' + d : '−' + (-d); }).join('  ') : '';
    }
    var startHtml = st.askStart ? '<div class="nl-start"><label>Var börjar du på tallinjen? ' + numInput('nls') + '</label> <button type="button" class="btn small setstart">Sätt start</button></div>' : '';
    box.innerHTML = '<p class="sprompt">' + fmt(st.prompt || 'Gör hoppet på tallinjen.') + '</p>' + startHtml +
      '<div class="nlwrap"></div><p class="note jlog" aria-live="polite"></p>' +
      '<div class="nl-ctrl"' + (st.askStart ? ' hidden' : '') + '><div class="dirs"><button type="button" class="dirbtn" data-d="-1">⬅ ' + esc(down) + '</button><button type="button" class="dirbtn" data-d="1">' + esc(up) + ' ➡</button></div>' +
      '<label class="jsize">Hur många steg? <input class="txt small jn" inputmode="numeric" pattern="[0-9]*" autocomplete="off"></label>' +
      '<div class="row"><button type="button" class="btn small jump">Hoppa!</button><button type="button" class="btn ghost undo">↶ Ångra</button><button type="button" class="btn small secondary nldone">Klar</button></div></div>' +
      '<div class="sfb" aria-live="polite"></div>';
    var fb = box.querySelector('.sfb');
    if (!st.askStart) pos = st.start;
    function setDir(d) { dir = d; Array.prototype.forEach.call(box.querySelectorAll('.dirbtn'), function (b) { b.classList.toggle('sel', +b.getAttribute('data-d') === d); }); }
    box.addEventListener('click', function (e) {
      if (finished) return;
      var t = e.target.closest('button'); if (!t) return;
      if (t.classList.contains('setstart')) {
        var v = normNum(box.querySelector('.nls').value);
        if (v === '' || isNaN(+v)) { fb.innerHTML = '<div class="fb near pop">Skriv ett tal, till exempel 3 eller −4. Tryck ± för minus.</div>'; return; }
        if (+v !== st.start && st.start < 0 && +v === -st.start) { fb.innerHTML = '<div class="fb near pop">Rätt tal – men är det plus eller minus? Tryck ± för minus.</div>'; return; }
        if (+v !== st.start) { fb.innerHTML = '<div class="fb near pop">' + fmt(st.startWrong || 'Läs första meningen igen – där står var du börjar.') + '</div>'; return; }
        pos = st.start; fb.innerHTML = '<div class="fb ok pop"><span class="head">Bra start!</span>Nu gör du hoppet.</div>';
        box.querySelector('.nl-start').hidden = true; box.querySelector('.nl-ctrl').hidden = false; draw(); return;
      }
      if (t.classList.contains('dirbtn')) { setDir(+t.getAttribute('data-d')); return; }
      if (t.classList.contains('jump')) {
        var n = parseInt(box.querySelector('.jn').value, 10);
        if (!dir) { fb.innerHTML = '<div class="fb near pop">Välj först: ' + esc(up) + ' eller ' + esc(down) + '?</div>'; return; }
        if (!(n > 0)) { fb.innerHTML = '<div class="fb near pop">Skriv hur många steg du ska hoppa.</div>'; return; }
        var to = pos + dir * n;
        if (to < st.min || to > st.max) { fb.innerHTML = '<div class="fb near pop">Det hoppet går utanför tallinjen. Kolla talet en gång till.</div>'; return; }
        jumps.push({ from: pos, to: to }); pos = to; fb.innerHTML = ''; box.querySelector('.jn').value = ''; draw();
        if (pos === end) { fb.innerHTML = '<div class="fb ok pop"><span class="head">Snyggt hoppat! 🚀</span>' + fmt(st.why || '') + '</div>'; finish(false); }
        return;
      }
      if (t.classList.contains('undo')) { var j = jumps.pop(); if (j) pos = j.from; fb.innerHTML = ''; draw(); return; }
      if (t.classList.contains('nldone')) {
        if (!jumps.length) { fb.innerHTML = '<div class="fb near pop">Gör minst ett hopp först.</div>'; return; }
        if (pos === end) {
          fb.innerHTML = '<div class="fb ok pop"><span class="head">Snyggt hoppat! 🚀</span>' + fmt(st.why || '') + '</div>'; finish(false);
        } else fb.innerHTML = '<div class="fb near pop">Du hamnade på ' + fmtNum(pos) + '. ' + fmt(st.wrong || (mode === 'target' ? 'Hoppa tills du står på målet.' : 'Läs igen: åt vilket håll, och hur många steg?')) + ' Tryck ↶ Ångra och prova igen.</div>';
      }
    });
    function finish(helped) {
      finished = true;
      Array.prototype.forEach.call(box.querySelectorAll('button,input'), function (b) { b.disabled = true; });
      ctx.result.nl = { start: st.start, end: pos, total: pos - st.start };
      done(helped);
    }
    draw();
    return {
      show: function () {
        pos = st.start; jumps = [];
        var steps = mode === 'target' ? (st.showJumps || [st.target - st.start]) : st.jumps;
        steps.forEach(function (d) { jumps.push({ from: pos, to: pos + d }); pos += d; });
        if (st.askStart) { box.querySelector('.nl-start').hidden = true; box.querySelector('.nl-ctrl').hidden = false; }
        draw(); fb.innerHTML = '<div class="fb ok pop"><span class="head">Så här:</span>' + fmt(st.why || '') + '</div>'; finish(true);
      }
    };
  };
  function numInput(cls) {
    return '<span class="numwrap"><button type="button" class="pm" data-for="' + cls + '" aria-label="Byt plus eller minus">±</button><input class="txt small ' + cls + '" inputmode="numeric" pattern="[0-9]*" autocomplete="off"></span>';
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('.pm'); if (!b || b.disabled) return;
    var inp = b.parentNode.querySelector('input'); var v = inp.value.trim();
    inp.value = /^[-−]/.test(v) ? v.replace(/^[-−]/, '') : '−' + v; inp.focus();
  });
  STEP.bar = function (st, ctx, done) {
    var box = ctx.stepBox, vals = {}, sel = null, finished = false, slots = Object.keys(st.slots);
    var chips = st.chips || (function () {
      var c = []; slots.forEach(function (k) { if (c.indexOf(st.slots[k]) < 0) c.push(st.slots[k]); });
      (st.extra || []).forEach(function (x) { if (c.indexOf(String(x)) < 0) c.push(String(x)); });
      if (c.indexOf('?') < 0) c.push('?');
      return c.sort(function (a, b) { return a === '?' ? 1 : b === '?' ? -1 : (+a) - (+b); });
    })();
    function render() {
      box.querySelector('.bmwrap').innerHTML = barHTML(st.model, vals, st.labels || {}, !finished);
    }
    box.innerHTML = '<p class="sprompt">' + fmt(st.prompt || 'Bygg modellen: tryck på ett tal, sedan på rätt ruta. Det du ska ta reda på blir **?**') + '</p>' +
      '<div class="chips">' + chips.map(function (c) { return '<button type="button" class="chip" data-c="' + esc(c) + '">' + esc(c) + '</button>'; }).join('') + '</div>' +
      '<div class="bmwrap"></div><div class="row end"><button type="button" class="btn small secondary bmdone">Klar</button></div><div class="sfb" aria-live="polite"></div>';
    var fb = box.querySelector('.sfb');
    box.addEventListener('click', function (e) {
      if (finished) return;
      var c = e.target.closest('.chip'), s = e.target.closest('[data-slot]'), d = e.target.closest('.bmdone');
      if (c) { sel = c.getAttribute('data-c'); Array.prototype.forEach.call(box.querySelectorAll('.chip'), function (x) { x.classList.toggle('sel', x === c); }); return; }
      if (s) {
        var k = s.getAttribute('data-slot');
        if (sel == null) { delete vals[k]; } else { vals[k] = sel; sel = null; Array.prototype.forEach.call(box.querySelectorAll('.chip'), function (x) { x.classList.remove('sel'); }); }
        render(); return;
      }
      if (d) {
        var missing = slots.filter(function (k) { return vals[k] == null; });
        if (missing.length) { fb.innerHTML = '<div class="fb near pop">' + fmt('Fyll alla rutor först. Tips: det du inte vet blir **?**') + '</div>'; return; }
        var wrong = slots.filter(function (k) { return String(vals[k]) !== String(st.slots[k]); });
        if (!wrong.length) { fb.innerHTML = '<div class="fb ok pop"><span class="head">Modellen stämmer! 📊</span>' + fmt(st.why || '') + '</div>'; finish(false); }
        else {
          Array.prototype.forEach.call(box.querySelectorAll('[data-slot]'), function (x) { x.classList.toggle('bad', wrong.indexOf(x.getAttribute('data-slot')) >= 0); });
          fb.innerHTML = '<div class="fb near pop">' + (wrong.length === 1 ? 'En ruta' : wrong.length + ' rutor') + ' stämmer inte än (markerade). ' + fmt(st.wrong || 'Läs berättelsen igen: vad är helheten, och vad är delarna?') + '</div>';
        }
      }
    });
    function finish(helped) { finished = true; render(); Array.prototype.forEach.call(box.querySelectorAll('button'), function (b) { b.disabled = true; }); done(helped); }
    render();
    return { show: function () { slots.forEach(function (k) { vals[k] = st.slots[k]; }); fb.innerHTML = '<div class="fb ok pop"><span class="head">Så här:</span>' + fmt(st.why || '') + '</div>'; finish(true); } };
  };
  STEP.table = function (st, ctx, done) {
    var box = ctx.stepBox, finished = false;
    var h = '<p class="sprompt">' + fmt(st.prompt || 'Fyll i tabellen med hjälp av ledtrådarna. Bocka av ledtrådarna du har använt.') + '</p><div class="tscroll"><table class="ptable edit"><thead><tr><th></th>' +
      st.cols.map(function (c) { return '<th>' + esc(c.name) + '</th>'; }).join('') + '</tr></thead><tbody>';
    st.rows.forEach(function (r, i) {
      h += '<tr><th>' + esc(r) + '</th>' + st.cols.map(function (c, j) {
        return '<td><select data-r="' + i + '" data-c="' + j + '" aria-label="' + esc(r + ' ' + c.name) + '"><option value="">–</option>' + c.options.map(function (o) { return '<option>' + esc(o) + '</option>'; }).join('') + '</select></td>';
      }).join('') + '</tr>';
    });
    h += '</tbody></table></div><div class="row end"><button type="button" class="btn small secondary tdone">Klar</button></div><div class="sfb" aria-live="polite"></div>';
    box.innerHTML = h;
    var fb = box.querySelector('.sfb');
    box.querySelector('.tdone').addEventListener('click', function () {
      if (finished) return;
      var sels = box.querySelectorAll('select'), empty = 0, wrong = 0;
      Array.prototype.forEach.call(sels, function (s) {
        var want = st.answer[+s.getAttribute('data-r')][+s.getAttribute('data-c')];
        s.classList.remove('bad');
        if (!s.value) empty++; else if (s.value !== want) { wrong++; s.classList.add('bad'); }
      });
      if (empty) { fb.innerHTML = '<div class="fb near pop">Fyll i alla rutor först (' + empty + ' kvar). Börja med ledtråden som säger något säkert.</div>'; return; }
      if (wrong) { fb.innerHTML = '<div class="fb near pop">' + (wrong === 1 ? 'En ruta' : wrong + ' rutor') + ' stämmer inte än (markerade). Läs ledtrådarna igen, en i taget.</div>'; return; }
      fb.innerHTML = '<div class="fb ok pop"><span class="head">Pusslet är löst! 🧩</span>' + fmt(st.why || '') + '</div>'; finish(false);
    });
    function finish(helped) { finished = true; Array.prototype.forEach.call(box.querySelectorAll('select,button'), function (b) { b.disabled = true; }); done(helped); }
    return { show: function () {
      Array.prototype.forEach.call(box.querySelectorAll('select'), function (s) { s.value = st.answer[+s.getAttribute('data-r')][+s.getAttribute('data-c')]; s.classList.remove('bad'); });
      fb.innerHTML = '<div class="fb ok pop"><span class="head">Så här:</span>' + fmt(st.why || '') + '</div>'; finish(true);
    } };
  };
  STEP.calc = function (st, ctx, done) {
    var box = ctx.stepBox, finished = false, tries = 0;
    box.innerHTML = '<p class="sprompt">' + fmt(st.prompt || 'Nu räknar du. Titta på din modell.') + '</p>' +
      (st.expr ? '<p class="expr">' + fmt(st.expr) + '</p>' : '') +
      '<label class="calcrow">Svar: ' + (st.allowNeg ? numInput('cn') : '<input class="txt small cn" inputmode="numeric" pattern="[0-9]*" autocomplete="off">') + (st.unit ? ' <span class="unit">' + esc(st.unit) + '</span>' : '') + '</label>' +
      '<div class="row end"><button type="button" class="btn small ccheck">Kolla svaret</button></div><div class="sfb" aria-live="polite"></div>';
    var fb = box.querySelector('.sfb'), inp = box.querySelector('.cn');
    function check() {
      if (finished) return;
      var v = normNum(inp.value).replace(/[a-zåäö°]+$/i, '');
      if (v === '' || isNaN(+v)) { fb.innerHTML = '<div class="fb near pop">Skriv svaret med siffror' + (st.allowNeg ? ' (tryck ± för minus)' : '') + '.</div>'; return; }
      if (st.answer.map(normNum).indexOf(String(+v)) >= 0) { fb.innerHTML = '<div class="fb ok pop"><span class="head">' + pick(['Rätt! 🎉', 'Snyggt! ⭐', 'Precis! 🚀']) + '</span>' + fmt(st.why || '') + '</div>'; finish(false); }
      else {
        tries++;
        var custom = st.wrongFeedback && st.wrongFeedback[String(+v)];
        fb.innerHTML = '<div class="fb near pop">' + fmt(custom || (tries === 1 ? 'Inte riktigt. Titta på modellen igen – vad visar den?' : 'Fortfarande inte. Tryck på **Visa mig** om du vill se hur man gör.')) + '</div>';
      }
    }
    box.querySelector('.ccheck').addEventListener('click', check);
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); check(); } });
    function finish(helped) { finished = true; Array.prototype.forEach.call(box.querySelectorAll('button,input'), function (b) { b.disabled = true; }); done(helped); }
    return { show: function () { inp.value = fmtNum(st.answer[0]); fb.innerHTML = '<div class="fb ok pop"><span class="head">Så här:</span>' + fmt(st.why || '') + '</div>'; finish(true); } };
  };

  var STEPNAME = { tap: 'Hitta frågan', word: 'Hitta nyckelordet', tool: 'Välj verktyg', numberline: 'Bygg på tallinjen', bar: 'Bygg modellen', table: 'Fyll i tabellen', calc: 'Räkna' };
  function renderMission(q, box, onDone, opts) {
    opts = opts || {};
    var demo = !!q.demo, t0 = Date.now(), helpedAny = false, idx = -1;
    var sentences = q.sentences || [];
    var panel = '<div class="story">' + (q.title ? '<div class="mtitle">' + fmt(q.title) + '</div>' : '') +
      (sentences.length ? '<p class="sents">' + sentences.map(function (s, i) { return '<button type="button" class="sent" data-s="' + i + '" disabled>' + fmt(s) + '</button>'; }).join(' ') + '</p>' : '') +
      (q.clues ? '<ul class="clues">' + q.clues.map(function (c, i) { return '<li><label><input type="checkbox" class="clue-ck"> <span>' + fmt(c) + '</span></label></li>'; }).join('') + '</ul>' : '') +
      (q.visual ? visual(q.visual) : '') +
      '<div class="row end">' + speakBtn((q.title ? q.title + '. ' : '') + sentences.join(' ') + (q.clues ? ' Ledtrådar: ' + q.clues.join(' ') : '')) + '</div></div>';
    box.innerHTML = panel + '<ol class="msteps" aria-label="Steg"></ol><div class="stepbox"></div><div class="mfoot row between"><span class="note mprog"></span>' + (demo ? '' : '<button type="button" class="btn ghost showme">💡 Visa mig</button>') + '</div><div class="mdone"></div>';
    var ctx = { panel: box.querySelector('.story'), stepBox: box.querySelector('.stepbox'), sentences: sentences, result: {}, onSent: null };
    box.querySelector('.story').addEventListener('click', function (e) { var b = e.target.closest('.sent'); if (b && ctx.onSent) ctx.onSent(+b.getAttribute('data-s')); });
    Array.prototype.forEach.call(box.querySelectorAll('.clue-ck'), function (c) { c.addEventListener('change', function () { c.closest('li').classList.toggle('used', c.checked); }); });
    var stepsOl = box.querySelector('.msteps');
    // In "choose the tool yourself" missions the step names would give the tool away, so later steps stay hidden until the tool is chosen.
    var hideAhead = q.steps[0] && q.steps[0].kind === 'tool' && !q.steps[0].options;
    function stepName(s, i) { return (hideAhead && i > 0 && idx < 1) ? 'Steg ' + (i + 1) : (s.label || STEPNAME[s.kind] || 'Steg'); }
    var current = null, showBtn = box.querySelector('.showme'), stepFin = true, completed = false;
    function guard() { box.classList.add('guard'); setTimeout(function () { box.classList.remove('guard'); }, 450); }
    function next() {
      idx++;
      guard();
      stepsOl.innerHTML = q.steps.map(function (s, i) { return '<li data-i="' + i + '" class="' + (i < idx ? 'done' : i === idx ? 'now' : '') + '">' + esc(stepName(s, i)) + '</li>'; }).join('');
      if (idx >= q.steps.length) return complete();
      box.querySelector('.mprog').textContent = 'Steg ' + (idx + 1) + ' av ' + q.steps.length;
      var st = q.steps[idx], div = document.createElement('div');
      div.className = 'mstep pop'; ctx.stepBox.appendChild(div);
      if (idx > 0) { try { div.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) { } }
      ctx.stepBox = div; ctx.onSent = null;
      stepFin = false;
      var stepDone = function (helped) {
        if (stepFin) return; stepFin = true;
        if (helped && st.kind !== 'tap') helpedAny = true;
        var b = document.createElement('div'); b.className = 'row end';
        b.innerHTML = '<button type="button" class="btn small nextstep">' + (idx + 1 < q.steps.length ? 'Nästa steg →' : 'Klart! →') + '</button>';
        div.appendChild(b);
        var used = false; b.querySelector('button').addEventListener('click', function () { if (used) return; used = true; ctx.stepBox = box.querySelector('.stepbox'); next(); });
        if (showBtn) showBtn.hidden = true;
      };
      current = STEP[st.kind](st, ctx, stepDone);
      if (showBtn) showBtn.hidden = false;
      if (demo) { setTimeout(function () { if (!stepFin) current.show(); }, 30); }
    }
    function complete() {
      if (completed) return; completed = true;
      if (showBtn) showBtn.hidden = true;
      box.querySelector('.mprog').textContent = '';
      var ms = Date.now() - t0;
      box.querySelector('.mdone').innerHTML = '<div class="fb ok pop"><span class="head">' + (demo ? 'Så löser man den! 💡' : helpedAny ? 'Uppdraget klart! 🎖️' : 'Uppdraget klart – helt själv! 🏅') + '</span>' + fmt(q.explain || '') + '</div>';
      onDone(!helpedAny, box.querySelector('.mdone'), ms);
    }
    if (showBtn) showBtn.addEventListener('click', function () { if (current && !stepFin && !completed) current.show(); });
    next();
  }

  // ---------- data loading ----------
  function getJSON(url) { return fetch(url, { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error(url); return r.json(); }); }
  function loadManifest() { return manifest ? Promise.resolve(manifest) : getJSON('content/manifest.json').then(function (m) { manifest = m; return m; }); }
  function loadAssignment(id) {
    return loadAssignmentRaw(id).then(function (d) { answerLang = d.answerLang || null; return d; });
  }
  function loadAssignmentRaw(id) {
    if (cache[id]) return Promise.resolve(cache[id]);
    return loadManifest().then(function (m) {
      var a = m.assignments.filter(function (x) { return x.id === id; })[0];
      if (!a) throw new Error('Hittar inte uppdraget');
      return getJSON(a.file).then(function (d) { cache[id] = d; return d; });
    });
  }

  // ---------- views ----------
  function starsFor(best, total) { if (best == null) return ''; var r = best / total; return r >= 0.9 ? 3 : r >= 0.7 ? 2 : r >= 0.5 ? 1 : 0; }
  function starHTML(n, label) {
    if (n === '' || n == null) return '<span class="note">' + (label || 'inte gjort än') + '</span>';
    if (n === 0) return '<span class="note">Öva igen så kommer stjärnorna ✨</span>';
    return '<span class="stars" aria-label="' + n + ' av 3 stjärnor">' + '★★★'.slice(0, n) + '<span class="off">' + '★★★'.slice(n) + '</span></span>';
  }
  function setView(html) { app.innerHTML = html; window.scrollTo(0, 0); try { app.focus({ preventScroll: true }); } catch (e) { } }
  function assignmentStatus(a) {
    // a = manifest entry; counts finished tests (needs topic ids, stored on manifest entry as parts)
    var items = (progress.items || {}), done = 0, total = 0;
    Object.keys(items).forEach(function (k) { if (k.indexOf(a.id + '/') === 0 && items[k].best != null) done++; });
    total = a.parts || 0;
    return { done: done, total: total };
  }

  // ---------- progress helpers (read-only peek never creates records) ----------
  function peek(id) { return ((progress.items || {})[id]) || {}; }
  function bestLine(best, total) { return best != null ? ' <span class="note">· Bästa: ' + best + ' av ' + total + '</span>' : ''; }
  var selected = {}; // station the child tapped on the map this visit (aid -> station id)
  function setPos(aid, sid) { progress.pos = progress.pos || {}; if (progress.pos[aid] !== sid) { progress.pos[aid] = sid; saveProgress(); } selected[aid] = sid; }

  // ---------- dates ----------
  function today() { var d = new Date(); d.setHours(0, 0, 0, 0); return d; }
  function parseDate(s) { if (!s) return null; var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function daysLeft(a) { var d = parseDate(a.dueDate); return d ? Math.round((d - today()) / 864e5) : null; }
  function isPast(a) { var n = daysLeft(a); return n != null && n < 0; }
  function dueChip(a) {
    if (!a.due) return a.week ? '<span class="pill">' + esc(a.week) + '</span>' : '';
    var n = daysLeft(a), when = n == null || n < 0 ? '' : n === 0 ? ' · i dag!' : n === 1 ? ' · i morgon' : ' · om ' + n + ' dagar';
    return '<span class="pill due' + (n != null && n >= 0 && n <= 2 ? ' soon' : '') + '">' + esc(a.dueLabel || 'Läxa') + ' ' + esc(a.due) + when + '</span>';
  }

  // ---------- stations: one per Del, then the mixed test ----------
  function stationsFor(d) {
    var miss = d.kind === 'missions', list = d.topics.map(function (t, i) {
      var r = peek(d.id + '/' + t.id), len = t.test.length, tested = r.best != null;
      var won = tested && (miss || r.best / len >= 0.7 || !!r.practiced);
      return { id: t.id, n: i + 1, title: t.title, len: len, learnLen: t.learn.length, r: r, kind: 'topic',
        status: won ? 'won' : tested ? 'lost' : r.learned ? 'learning' : 'new' };
    });
    if (d.mixed && d.mixed.length) {
      var r = peek(d.id + '/mixed'), len = d.mixed.length, tested = r.best != null, won = tested && (miss || r.best / len >= 0.7 || !!r.practiced);
      list.push({ id: 'mixed', title: miss ? (d.mixedTitle || 'Välj verktyg själv') : 'Blandat test', len: len, r: r, kind: 'mixed', status: won ? 'won' : tested ? 'lost' : 'new' });
    }
    return list;
  }
  function allWon(st) { return st.every(function (s) { return s.status === 'won'; }); }
  function currentIdx(aid, st, useSel) {
    var sel = useSel ? selected[aid] : null, want = sel || (progress.pos || {})[aid], i = -1;
    st.forEach(function (s, k) { if (s.id === want) i = k; });
    if (i >= 0 && (sel || st[i].status !== 'won')) return i;
    for (var k = 0; k < st.length; k++) { var j = (i + 1 + k) % st.length; if (st[j].status !== 'won') return j; }
    return st.length; // goal
  }
  function actions(d, s) {
    var base = '#/a/' + d.id + (s.kind === 'mixed' ? '/mixed' : '/t/' + s.id), miss = d.kind === 'missions';
    var test = s.kind === 'mixed' ? base : base + '/test', learn = base + '/learn/0', missed = (s.r.missed || []).length;
    var testLbl = s.kind === 'mixed' ? (miss ? '🧰 Starta' : '🏆 Starta blandat test') + ' · ' + s.len + (miss ? ' uppdrag' : ' frågor') : (miss ? '🎖️ Uppdrag · ' + s.len + ' st' : '🎯 Testa dig · ' + s.len + ' frågor');
    if (s.status === 'new' && s.kind === 'topic') return { main: ['📘 Lär dig · ' + s.learnLen + ' kort', learn], more: [['Hoppa direkt till ' + (miss ? 'uppdragen' : 'testet'), test]] };
    if (s.status === 'new' || s.status === 'learning') return { main: [testLbl, test], more: s.kind === 'topic' ? [['📘 Lär dig igen', learn]] : [] };
    if (s.status === 'lost') return { main: [missed ? '🔁 Öva på det du missade (' + missed + ')' : '🔁 Gör testet igen', missed ? base + '/retry' : test], more: (s.kind === 'topic' ? [['📘 Repetera Lär dig', learn]] : []).concat(missed ? [['Gör hela testet igen', test]] : []), lost: true };
    return { main: [(miss ? '🎖️ Gör uppdragen igen' : '🎯 Gör testet igen'), test], more: s.kind === 'topic' ? [['📘 Lär dig igen', learn]] : [], again: true };
  }
  function statusLine(d, s) {
    var r = s.r, miss = d.kind === 'missions';
    if (s.status === 'new') return '<span class="note">Inte startad</span>';
    if (s.status === 'learning') return '<span class="note">📘 Lär dig klar · ' + (miss ? 'uppdragen' : 'testet') + ' kvar</span>';
    if (s.status === 'lost') return '<span class="lostline">🔁 ' + r.best + ' av ' + s.len + ' · öva mer här</span>';
    if (miss) return '<span class="note">✅ Klara · helt själv ' + r.best + ' av ' + s.len + '</span>';
    return starHTML(starsFor(r.best, s.len) || 2) + ' <span class="note">' + r.best + ' av ' + s.len + (r.practiced && r.best / s.len < 0.7 ? ' · övat 💪' : '') + '</span>';
  }

  // ---------- the cadet (original character; rank shows on cap and shoulders, medals on chest) ----------
  function rankIdx(xp) { var k = 0; for (var i = 0; i < RANKS.length; i++) if (xp >= RANKS[i][0]) k = i; return k; }
  function cadetSVG(rk, medals, size) {
    var s = '', gold = '#ffd166', navy = '#13294b';
    s += '<path d="M18 150 L22 114 Q28 96 60 94 Q92 96 98 114 L102 150 Z" fill="#1f3a68"/>';
    s += '<path d="M44 95 L60 120 L76 95 Z" fill="#fff"/><path d="M52 97 L60 110 L68 97 Z" fill="#3fa7d6"/>';
    s += '<circle cx="60" cy="128" r="2.6" fill="' + gold + '"/><circle cx="60" cy="140" r="2.6" fill="' + gold + '"/>';
    // shoulder boards with rank stripes
    var thin = rk <= 3 ? rk : rk - 4, thick = rk >= 4;
    [[20, 101], [78, 101]].forEach(function (p) {
      s += '<rect x="' + p[0] + '" y="' + p[1] + '" width="22" height="10" rx="3" fill="' + navy + '"/>';
      var x = p[0] + 3;
      if (thick) { s += '<rect x="' + x + '" y="' + (p[1] + 2) + '" width="4" height="6" fill="' + gold + '"/>'; x += 6; }
      for (var i = 0; i < thin; i++) { s += '<rect x="' + x + '" y="' + (p[1] + 2) + '" width="2" height="6" fill="' + gold + '"/>'; x += 4; }
    });
    // medals (right chest)
    var cols = ['#e63946', '#2a9d8f', '#3a86ff', '#f4a261'];
    for (var m = 0; m < Math.min(medals, 4); m++) {
      var mx = 68 + m * 7;
      s += '<rect x="' + (mx - 2.5) + '" y="116" width="5" height="6" fill="' + cols[m] + '"/><circle cx="' + mx + '" cy="125" r="3.2" fill="' + gold + '" stroke="#b8860b" stroke-width=".8"/>';
    }
    if (medals > 4) s += '<text x="98" y="136" font-size="9" font-family="Lexend,sans-serif" font-weight="700" fill="' + gold + '" text-anchor="end">+' + (medals - 4) + '</text>';
    s += '<rect x="52" y="82" width="16" height="15" fill="#f2c6a0"/>';
    s += '<circle cx="60" cy="62" r="27" fill="#f6d1b1"/>';
    s += '<path d="M33 60 Q33 42 60 40 Q87 42 87 60 Q80 50 60 50 Q40 50 33 60 Z" fill="#6b4a2b"/>';
    s += '<circle cx="50" cy="65" r="3.4" fill="#1b2333"/><circle cx="70" cy="65" r="3.4" fill="#1b2333"/><circle cx="51.2" cy="63.8" r="1" fill="#fff"/><circle cx="71.2" cy="63.8" r="1" fill="#fff"/>';
    s += '<circle cx="43" cy="73" r="4.5" fill="#f4a3a3" opacity=".55"/><circle cx="77" cy="73" r="4.5" fill="#f4a3a3" opacity=".55"/>';
    s += '<path d="M51 76 Q60 84 69 76" stroke="#8a3b12" stroke-width="3" fill="none" stroke-linecap="round"/>';
    // cap
    s += '<ellipse cx="60" cy="36" rx="33" ry="11" fill="' + (rk >= 3 ? navy : '#fff') + '" stroke="#c9d5e3" stroke-width="1.5"/>';
    s += '<rect x="30" y="36" width="60" height="10" rx="4" fill="' + navy + '"/>';
    s += '<path d="M35 46 Q60 56 85 46 L84 44 Q60 52 36 44 Z" fill="' + (rk >= 3 ? gold : '#0d1d36') + '"/>';
    if (rk >= 7) s += '<path d="M60 35.5 l1.8 3.6 4 .6 -2.9 2.8 .7 4 -3.6-1.9 -3.6 1.9 .7-4 -2.9-2.8 4-.6z" fill="' + gold + '"/>';
    else s += '<circle cx="60" cy="41" r="4.6" fill="' + gold + '"/><path d="M60 38.4 v5.4 M57.6 42 q2.4 2.6 4.8 0" stroke="' + navy + '" stroke-width="1.2" fill="none"/>';
    return '<svg class="cadet" viewBox="0 0 120 150" width="' + size + '" height="' + Math.round(size * 1.25) + '" role="img" aria-label="Din kadett: ' + RANKS[rk][1] + (medals ? ', ' + medals + (medals === 1 ? ' medalj' : ' medaljer') : '') + '">' + s + '</svg>';
  }
  function marker() { // the submarine with the cadet in the hatch
    return '<svg viewBox="0 0 90 56" width="78" height="49" aria-hidden="true">' +
      '<circle cx="40" cy="15" r="9" fill="#f6d1b1"/><path d="M31 13 Q40 2 49 13 Z" fill="#fff" stroke="#c9d5e3"/><rect x="31" y="11" width="18" height="4" rx="2" fill="#13294b"/>' +
      '<circle cx="37" cy="17" r="1.4" fill="#1b2333"/><circle cx="43" cy="17" r="1.4" fill="#1b2333"/>' +
      '<rect x="31" y="20" width="18" height="10" rx="3" fill="#ffd166"/>' +
      '<ellipse cx="42" cy="38" rx="36" ry="14" fill="#ffd166" stroke="#c99a1c" stroke-width="1.5"/>' +
      '<circle cx="28" cy="38" r="4" fill="#13294b"/><circle cx="42" cy="38" r="4" fill="#13294b"/><circle cx="56" cy="38" r="4" fill="#13294b"/>' +
      '<path d="M78 38 l9 -8 v16 z" fill="#ffd166" stroke="#c99a1c" stroke-width="1.5"/></svg>';
  }
  function medalCount() { return (progress.medals || []).length; }
  function xpBar() {
    var xp = progress.xp || 0, r = rankOf(xp), n = nextRank(xp);
    var pct = n ? Math.round(100 * (xp - r[0]) / (n[0] - r[0])) : 100;
    return '<div class="lvl"><b>' + r[1] + '</b><span class="note">' + (n ? (n[0] - xp) + ' poäng kvar till ' + n[1] : 'Högsta graden! ⭐') + '</span>' +
      '<div class="progress" aria-hidden="true"><i style="width:' + pct + '%"></i></div>' +
      (medalCount() ? '<span class="note">🏅 ' + medalCount() + (medalCount() === 1 ? ' medalj' : ' medaljer') + '</span>' : '') + '</div>';
  }
  function awardMedal(aid) {
    progress.medals = progress.medals || [];
    if (progress.medals.indexOf(aid) >= 0) return false;
    progress.medals.push(aid); saveProgress(); return true;
  }

  // ---------- side navigation (big, always there outside lessons) ----------
  function loadAll() {
    return loadManifest().then(function (m) {
      return Promise.all(m.assignments.map(function (a) { return loadAssignmentRaw(a.id).then(function (d) { return { a: a, d: d }; }, function () { return null; }); }))
        .then(function (list) { return { m: m, list: list.filter(Boolean) }; });
    });
  }
  function isDone(x) { return allWon(stationsFor(x.d)); }
  function renderSide(all, active) {
    var side = document.getElementById('side'); if (!side) return;
    var h = '<a class="navi' + (active === 'home' ? ' on' : '') + '" href="#/"' + (active === 'home' ? ' aria-current="page"' : '') + '><span class="ni">🧭</span><span class="nl">Start</span></a>';
    all.m.subjects.forEach(function (s) {
      var open = all.list.filter(function (x) { return x.a.subject === s.id && !isPast(x.a) && !isDone(x); }).length;
      var any = all.list.some(function (x) { return x.a.subject === s.id; });
      h += '<a class="navi' + (active === s.id ? ' on' : '') + (any ? '' : ' dim') + '" href="#/s/' + s.id + '"' + (active === s.id ? ' aria-current="page"' : '') + '><span class="ni">' + s.icon + '</span><span class="nl">' + esc(s.name) + '</span>' + (open ? '<span class="nb" aria-label="' + open + ' att göra">' + open + '</span>' : '') + '</a>';
    });
    side.innerHTML = h;
    var on = side.querySelector('.on');
    if (on && side.scrollWidth > side.clientWidth + 2) { var d = on.getBoundingClientRect().left - side.getBoundingClientRect().left; side.scrollLeft += d - 16; }
  }
  function focusMode(on) { document.body.classList.toggle('focus', !!on); }

  // ---------- Start: one next step, then "Sen" and "Repetera" ----------
  function sortActive(list) {
    return list.filter(function (x) { return !isPast(x.a) && !isDone(x); }).sort(function (p, q) {
      var a = daysLeft(p.a), b = daysLeft(q.a); a = a == null ? 999 : a; b = b == null ? 999 : b; return a - b;
    });
  }
  function viewHome() {
    focusMode(false);
    loadAll().then(function (all) {
      renderSide(all, 'home');
      var act = sortActive(all.list), next = act[0];
      var html = storageBanner() + '<section class="hero card"><div class="herorow">' + cadetSVG(rankIdx(progress.xp || 0), medalCount(), 92) +
        '<div class="herotxt"><p class="bubble">' + (next ? 'Hej, kadett! Här är ditt nästa uppdrag.' : 'Hej, kadett! Allt är klart just nu. Snyggt! 🎉') + '</p>' + xpBar() + '</div></div></section>';
      if (next) {
        var st = stationsFor(next.d), ci = currentIdx(next.a.id, st), s = st[ci] || st[0], ac = actions(next.d, s);
        var subj = all.m.subjects.filter(function (x) { return x.id === next.a.subject; })[0] || {};
        html += '<section class="card nextcard" aria-labelledby="nx"><p class="kicker">Nästa · ' + (subj.icon || '') + ' ' + esc(subj.name || '') + '</p>' +
          '<h1 id="nx">' + (next.a.icon || '') + ' ' + esc(next.a.title) + '</h1><p>' + dueChip(next.a) + '</p>' +
          '<p class="lead" style="margin:10px 0 4px"><b>' + (s.kind === 'mixed' ? esc(s.title) : 'Del ' + s.n + ': ' + esc(s.title)) + '</b></p>' +
          '<a class="btn wide big" href="' + ac.main[1] + '">' + esc(ac.main[0]) + ' →</a>' +
          '<p style="margin:10px 0 0"><a class="more" href="#/a/' + next.a.id + '">🗺️ Visa kartan</a></p></section>';
      }
      var later = act.slice(1);
      if (later.length) {
        html += '<h2>Sen</h2><ul class="later">' + later.map(function (x) {
          var st = stationsFor(x.d), done = st.filter(function (s) { return s.status === 'won'; }).length;
          return '<li><a class="lrow" href="#/a/' + x.a.id + '"><span class="li">' + (x.a.icon || '') + '</span><span class="lt"><b>' + esc(x.a.title) + '</b><span class="lm">' + dueChip(x.a) + ' <span class="note">' + done + ' av ' + st.length + ' klara</span></span></span><span aria-hidden="true">›</span></a></li>';
        }).join('') + '</ul>';
      }
      var weak = [], old = [];
      all.list.forEach(function (x) {
        stationsFor(x.d).forEach(function (s) { if (s.status === 'lost') weak.push({ x: x, s: s }); });
        if (isPast(x.a) || isDone(x)) old.push(x);
      });
      if (weak.length || old.length) {
        html += '<details class="card rep"><summary>🔁 Repetera <span class="note">(' + (weak.length + old.length) + ')</span></summary>' +
          (weak.length ? '<p class="note" style="margin-top:10px">Öva mer på:</p><ul class="later">' + weak.map(function (w) {
            var ac = actions(w.x.d, w.s);
            return '<li><a class="lrow" href="' + ac.main[1] + '"><span class="li">' + (w.x.a.icon || '') + '</span><span class="lt"><b>' + esc(w.s.kind === 'mixed' ? w.s.title : w.s.title) + '</b><span class="lm note">' + esc(w.x.a.title) + ' · ' + w.s.r.best + ' av ' + w.s.len + '</span></span><span aria-hidden="true">›</span></a></li>';
          }).join('') + '</ul>' : '') +
          (old.length ? '<p class="note" style="margin-top:10px">Tidigare uppdrag:</p><ul class="later">' + old.map(function (x) {
            return '<li><a class="lrow" href="#/a/' + x.a.id + '"><span class="li">' + (x.a.icon || '') + '</span><span class="lt"><b>' + esc(x.a.title) + '</b><span class="lm note">' + esc(x.a.week || '') + (isDone(x) ? ' · 🏅 klart' : '') + '</span></span><span aria-hidden="true">›</span></a></li>';
          }).join('') + '</ul>' : '') + '</details>';
      }
      setView(html);
    }).catch(showError);
  }

  // ---------- subject: banner + task bar + route map ----------
  function viewSubject(sid) {
    focusMode(false);
    loadAll().then(function (all) {
      var mine = all.list.filter(function (x) { return x.a.subject === sid; });
      var act = sortActive(mine);
      var pick = act[0] || mine[0];
      if (pick) return renderSubjectMap(all, pick.a.id);
      var subj = all.m.subjects.filter(function (s) { return s.id === sid; })[0];
      if (!subj) { location.replace('#/'); return; }
      renderSide(all, subj.id);
      setView(banner(subj, [], null) + '<div class="card empty"><div class="big">🛰️</div><p><b>Inga uppdrag här än.</b></p><p class="muted">Nya uppdrag dyker upp när skolan ger läxor eller prov i ' + esc(subj.name) + '.</p></div>');
    }).catch(showError);
  }
  function viewAssignment(aid) {
    focusMode(false);
    loadAll().then(function (all) { renderSubjectMap(all, aid); }).catch(showError);
  }
  function banner(subj, mine, aid) {
    var chips = '';
    if (mine.length) {
      var act = sortActive(mine), rest = mine.filter(function (x) { return act.indexOf(x) < 0; });
      var chip = function (x, old) {
        var st = stationsFor(x.d), done = st.filter(function (s) { return s.status === 'won'; }).length;
        return '<a class="tchip' + (x.a.id === aid ? ' on' : '') + (old ? ' old' : '') + '" href="#/a/' + x.a.id + '"' + (x.a.id === aid ? ' aria-current="page"' : '') + '><span class="ti">' + (x.a.icon || '') + '</span><span><b>' + esc(x.a.title) + '</b><span class="tm">' + (isDone(x) ? '🏅 klart' : (x.a.due ? esc(x.a.dueLabel || 'Läxa') + ' ' + esc(x.a.due) : esc(x.a.week || '')) + ' · ' + done + '/' + st.length) + '</span></span></a>';
      };
      chips = '<nav class="tasks" aria-label="Uppdrag i ' + esc(subj.name) + '">' + act.map(function (x) { return chip(x, false); }).join('') +
        (rest.length ? (act.length ? '<span class="tsep">Tidigare</span>' : '') + rest.map(function (x) { return chip(x, true); }).join('') : '') + '</nav>';
    }
    return storageBanner() + '<section class="banner"><div class="brow"><h1>' + subj.icon + ' ' + esc(subj.name) + '</h1><div class="bcadet">' + cadetSVG(rankIdx(progress.xp || 0), medalCount(), 54) + xpBar() + '</div></div>' + chips + '</section>';
  }
  function renderSubjectMap(all, aid) {
    var x = all.list.filter(function (y) { return y.a.id === aid; })[0];
    if (!x) throw new Error('Hittar inte uppdraget');
    var d = x.d, a = x.a, subj = all.m.subjects.filter(function (s) { return s.id === a.subject; })[0] || { icon: '', name: '' };
    renderSide(all, subj.id);
    var mine = all.list.filter(function (y) { return y.a.subject === a.subject; });
    var st = stationsFor(d), ci = currentIdx(aid, st, true), done = st.filter(function (s) { return s.status === 'won'; }).length;
    if (allWon(st)) awardMedal(aid);
    var html = banner(subj, mine, aid);
    html += '<section class="ahead"><h2>' + (a.icon || '') + ' ' + esc(a.title) + '</h2><p class="row" style="gap:8px">' + dueChip(a) + '<span class="note">' + done + ' av ' + st.length + ' klara</span></p>' +
      (d.intro ? '<details class="intro"><summary>💬 Vad handlar uppdraget om?</summary><div class="row between" style="flex-wrap:nowrap;align-items:flex-start"><p class="lead" style="margin:0;flex:1">' + fmt(d.intro) + '</p>' + speakBtn(d.intro) + '</div></details>' : '') + '</section>';
    html += '<section class="route" aria-label="Karta"><svg class="path" aria-hidden="true"></svg><div class="ship" aria-hidden="true">' + marker() + '</div><ol class="stns">';
    st.forEach(function (s, i) {
      var cur = i === ci, side = i % 2 ? ' r' : '';
      var node = s.status === 'won' ? '⭐' : s.status === 'lost' ? '🔁' : s.status === 'learning' ? '📘' : s.kind === 'mixed' ? '🏆' : s.n;
      var head = '<span class="sk">' + (s.kind === 'mixed' ? (d.kind === 'missions' ? 'Slutuppdrag' : 'Alla delar') : 'Del ' + s.n) + '</span><b class="stt">' + esc(s.title) + '</b><span class="sl">' + statusLine(d, s) + '</span>';
      html += '<li class="stn' + side + ' ' + s.status + (cur ? ' cur' : '') + '" data-i="' + i + '"><span class="node" aria-hidden="true">' + node + '</span>';
      if (cur) {
        var ac = actions(d, s);
        html += '<div class="scard open" aria-current="step">' + head +
          (ac.lost ? '<p class="practice">Här kan du bli ännu bättre. Öva lite till – sedan går du vidare! 💪</p>' : '') +
          '<a class="btn wide' + (ac.again ? ' secondary' : '') + '" href="' + ac.main[1] + '">' + esc(ac.main[0]) + '</a>' +
          (ac.more.length ? '<p class="morelinks">' + ac.more.map(function (m) { return '<a href="' + m[1] + '">' + esc(m[0]) + '</a>'; }).join('') + '</p>' : '') + '</div>';
      } else {
        html += '<button class="scard" type="button" data-sel="' + s.id + '">' + head + '</button>';
      }
      html += '</li>';
    });
    var won = allWon(st);
    html += '<li class="stn goal' + (st.length % 2 ? ' r' : '') + (won ? ' won' : '') + (ci === st.length ? ' cur' : '') + '" data-i="' + st.length + '"><span class="node" aria-hidden="true">' + (won ? '🏅' : '🏁') + '</span><div class="scard' + (won ? ' open' : '') + '"><span class="sk">Mål</span><b class="stt">' + (won ? 'Uppdraget klart – du fick en medalj!' : 'Klara alla stationer = medalj 🏅') + '</b></div></li>';
    html += '</ol></section>';
    setView(html);
    app.querySelectorAll('[data-sel]').forEach(function (b) {
      b.addEventListener('click', function () { var sid = b.getAttribute('data-sel'); selected[aid] = sid; st.forEach(function (x) { if (x.id === sid && x.status !== 'won') { progress.pos = progress.pos || {}; progress.pos[aid] = sid; saveProgress(); } }); renderSubjectMap(all, aid); var c = app.querySelector('.stn.cur'); if (c) try { c.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) { } });
    });
    drawRoute(aid, ci, currentIdx(aid, st, false));
  }
  var lastShip = {};
  function drawRoute(aid, ci, base) {
    var route = app.querySelector('.route'); if (!route) return;
    var svg = route.querySelector('.path'), ship = route.querySelector('.ship');
    if (lastShip[aid] == null && progress.ship && progress.ship[aid] != null) lastShip[aid] = progress.ship[aid];
    function centers() {
      var rb = route.getBoundingClientRect();
      return Array.prototype.map.call(route.querySelectorAll('.stn .node'), function (n) { var b = n.getBoundingClientRect(); return [b.left - rb.left + b.width / 2, b.top - rb.top + b.height / 2]; });
    }
    function seg(p, a, b) { var my = (p[a][1] + p[b][1]) / 2; return ' C ' + p[a][0] + ' ' + my + ', ' + p[b][0] + ' ' + my + ', ' + p[b][0] + ' ' + p[b][1]; }
    function draw(animate) {
      var p = centers(); if (!p.length) return;
      var W = route.clientWidth, H = route.scrollHeight;
      svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H); svg.setAttribute('width', W); svg.setAttribute('height', H);
      var done = 'M ' + p[0][0] + ' ' + p[0][1], rest = '';
      for (var i = 1; i < p.length; i++) { if (i <= ci) done += seg(p, i - 1, i); else rest += (rest ? '' : 'M ' + p[i - 1][0] + ' ' + p[i - 1][1]) + seg(p, i - 1, i); }
      svg.innerHTML = (rest ? '<path d="' + rest + '" class="todo"/>' : '') + '<path d="' + done + '" class="did"/>';
      var to = p[Math.min(ci, p.length - 1)], from = lastShip[aid] != null ? p[Math.min(lastShip[aid], p.length - 1)] : to;
      var put = function (q) { ship.style.left = (q[0] - 39) + 'px'; ship.style.top = (q[1] - 72) + 'px'; };
      if (animate && from !== to) { ship.classList.add('still'); put(from); void ship.offsetWidth; ship.classList.remove('still'); }
      else ship.classList.add('still');
      put(to); if (!animate) setTimeout(function () { ship.classList.remove('still'); }, 50);
    }
    draw(true);
    lastShip[aid] = ci;
    progress.ship = progress.ship || {}; if (progress.ship[aid] !== base) { progress.ship[aid] = base; try { localStorage.setItem(KEY, JSON.stringify(progress)); } catch (e) { } }
    if (window.__ovbResize) window.removeEventListener('resize', window.__ovbResize);
    window.__ovbResize = function () { if (document.body.contains(route)) draw(false); };
    window.addEventListener('resize', window.__ovbResize);
  }

  function viewLearn(aid, tid, idx) {
    loadAssignment(aid).then(function (a) {
      var t = a.topics.filter(function (x) { return x.id === tid; })[0];
      if (!t) throw new Error('Hittar inte delen');
      focusMode(true); setPos(aid, tid);
      idx = Math.max(0, Math.min(idx, t.learn.length - 1));
      var c = t.learn[idx], last = idx === t.learn.length - 1;
      var dots = '<div class="dots" aria-label="Kort ' + (idx + 1) + ' av ' + t.learn.length + '">' + t.learn.map(function (_, i) { return '<i class="' + (i <= idx ? 'on' : '') + '"></i>'; }).join('') + '</div>';
      var html = '<a class="crumb" href="#/a/' + a.id + '">← Till kartan</a>' +
        '<p class="note" style="margin:0">📘 ' + esc(t.title) + ' · kort ' + (idx + 1) + ' av ' + t.learn.length + '</p>' + dots +
        '<div class="card pop"><div class="row between" style="flex-wrap:nowrap"><h2 style="margin:0;flex:1">' + fmt(c.title) + '</h2>' + speakBtn(c.title + '. ' + c.text + (c.visual && c.visual.caption ? '. ' + c.visual.caption : '')) + '</div>' +
        '<p class="lead">' + fmt(c.text) + '</p>' + visual(c.visual) +
        (c.example ? '<div class="ex"><div class="row between" style="flex-wrap:nowrap"><span lang="en" class="exen">' + fmt(c.example.en) + '</span>' + speakBtn(c.example.en.replace(/\*\*/g, ''), 'en') + '</div><div class="note">' + fmt(c.example.sv) + '</div></div>' : '') +
        (c.try ? '<div class="try"><h4>' + (c.try.demo ? 'Titta så här! 👀' : 'Prova själv!') + '</h4><div class="trybox"></div></div>' : '') + '</div>' +
        '<div class="row between">' +
        (idx > 0 ? '<a class="btn secondary" href="#/a/' + a.id + '/t/' + t.id + '/learn/' + (idx - 1) + '">← Bakåt</a>' : '<span></span>') +
        (last ? '<a class="btn next" href="#/a/' + a.id + '/t/' + t.id + '/test">' + (a.kind === 'missions' ? 'Klar! Till uppdragen →' : 'Klar! Till testet →') + '</a>' : '<a class="btn" href="#/a/' + a.id + '/t/' + t.id + '/learn/' + (idx + 1) + '">Nästa →</a>') +
        '</div>';
      setView(html);
      if (c.try) {
        var tb = app.querySelector('.trybox');
        var runTry = function () {
          renderQuestion(c.try, tb, function (ok, fbw) {
            if (ok) return;
            var r = document.createElement('div'); r.className = 'row end';
            r.innerHTML = '<button class="btn secondary small again" type="button">' + (c.try.demo ? 'Titta igen' : 'Försök igen') + '</button>';
            fbw.parentNode.appendChild(r);
            r.querySelector('button').addEventListener('click', runTry);
          }, { autofocus: false });
        };
        runTry();
      }
      if (last) { var r = rec(a.id + '/' + t.id); if (!r.learned) { r.learned = true; saveProgress(); } }
    }).catch(showError);
  }

  // quiz session survives reloads (iPad Safari reloads background tabs)
  var SKEY = 'ovb-session-v1';
  function saveSession() {
    try { sessionStorage.setItem(SKEY, JSON.stringify({ aid: session.a.id, tid: session.tid, idxs: session.idxs, pos: session.pos, right: session.right, missed: session.missed, retry: session.retry })); } catch (e) { }
  }
  function clearSession() { try { sessionStorage.removeItem(SKEY); } catch (e) { } }
  function readSession(aid, tid) {
    try { var s = JSON.parse(sessionStorage.getItem(SKEY)); if (s && s.aid === aid && s.tid === tid && !s.retry && s.pos <= s.idxs.length) return s; } catch (e) { }
    return null;
  }

  function startQuiz(aid, tid, onlyIdx) {
    return loadAssignment(aid).then(function (a) {
      var t = tid === 'mixed' ? null : a.topics.filter(function (x) { return x.id === tid; })[0];
      var all = tid === 'mixed' ? a.mixed : (t && t.test);
      if (!all) throw new Error('Hittar inte testet');
      focusMode(true); setPos(aid, tid);
      if (onlyIdx === 'missed') { var mm = (peek(aid + '/' + tid).missed || []).filter(function (i) { return i < all.length; }); onlyIdx = mm.length ? mm : null; }
      var saved = onlyIdx ? null : readSession(aid, tid);
      var idxs = onlyIdx || all.map(function (_, i) { return i; });
      if (!onlyIdx && !saved && a.kind !== 'missions' && rec(a.id + '/' + tid).best != null && idxs.length > 3) idxs = idxs.slice(0, 2).concat(shuffle(idxs.slice(2)));
      session = { t: t, a: a, tid: tid, title: tid === 'mixed' ? (a.mixedTitle || 'Blandat test') : t.title, all: all, idxs: idxs, pos: 0, right: 0, missed: [], retry: !!onlyIdx };
      if (saved && saved.idxs.every(function (i) { return i < all.length; })) { session.idxs = saved.idxs; session.pos = saved.pos; session.right = saved.right; session.missed = saved.missed; session.retry = saved.retry; }
      renderQuizStep();
    }).catch(showError);
  }

  function renderQuizStep() {
    var s = session, n = s.idxs.length;
    if (s.pos >= n) return renderQuizEnd();
    saveSession();
    var base = s.all[s.idxs[s.pos]], q = (s.retry && base.twin) ? base.twin : base;
    var html = '<div class="row between"><a class="crumb cancel" href="#/a/' + s.a.id + '">← Avbryt</a><span class="note">' + (s.retry ? 'Öva igen · ' : '') + esc(s.title) + '</span></div>' +
      '<div class="progress" aria-hidden="true"><i style="width:' + Math.round(100 * s.pos / n) + '%"></i></div>' +
      '<p class="note" style="margin:0 0 4px">' + (s.a.kind === 'missions' ? 'Uppdrag ' : 'Fråga ') + (s.pos + 1) + ' av ' + n + '</p>' +
      '<div class="card qbox pop"></div>';
    setView(html);
    app.querySelector('.qbox').setAttribute('data-idx', s.idxs[s.pos]);
    renderQuestion(q, app.querySelector('.qbox'), function (ok, fbw, ms) {
      if (ok) s.right++; else s.missed.push(s.idxs[s.pos]);
      if (ms) { var tr = rec(s.a.id + '/' + s.tid + '#' + s.idxs[s.pos]); tr.times = (tr.times || []).concat([Math.round(ms / 1000)]).slice(-20); tr.self = (tr.self || []).concat([ok ? 1 : 0]).slice(-20); saveProgress(); }
      s.pos++; saveSession(); // answer is locked in even if the page reloads now
      var b = document.createElement('div'); b.className = 'row end';
      b.innerHTML = '<button class="btn nextq" type="button">' + (s.pos < n ? (s.a.kind === 'missions' ? 'Nästa uppdrag →' : 'Nästa fråga →') : 'Se resultatet →') + '</button>';
      fbw.parentNode.appendChild(b);
      var nb = b.querySelector('button'), used = false;
      nb.addEventListener('click', function () { if (used) return; used = true; renderQuizStep(); });
      try { nb.focus({ preventScroll: true }); } catch (e) { }
      try { b.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch (e) { }
    });
  }

  function renderQuizEnd() {
    var s = session, n = s.idxs.length, key = s.a.id + '/' + s.tid, r = rec(key);
    clearSession();
    try { history.replaceState(null, '', '#/a/' + s.a.id); } catch (e) { }
    var isM = s.a.kind === 'missions';
    var gained = isM ? n * (s.retry ? 5 : 10) : s.right * (s.retry ? 5 : 10);
    progress.xp = (progress.xp || 0) + gained;
    var before = rankOf(progress.xp - gained)[1], after = rankOf(progress.xp)[1];
    var stars = null, ratio = s.right / n;
    if (!s.retry) { r.best = Math.max(r.best || 0, s.right); r.last = s.right; stars = starsFor(s.right, n); r.missed = s.missed.slice(); if (s.right / n >= 0.7) r.practiced = false; }
    else { r.missed = s.missed.slice(); if (!s.missed.length) r.practiced = true; }
    delete selected[s.a.id];
    r.updated = new Date().toISOString();
    saveProgress();
    var newMedal = allWon(stationsFor(s.a)) && awardMedal(s.a.id);
    var big = s.right === n ? '🏆' : ratio >= 0.7 ? '🚀' : '💪';
    var msg = s.right === n ? 'Fullpott! Alla rätt!' : ratio >= 0.7 ? 'Riktigt bra jobbat!' : 'Bra kämpat! Varje försök gör hjärnan starkare.';
    var nextTip = '';
    if (!s.retry && ratio >= 0.7) nextTip = s.tid === 'mixed' ? '🎖️ Blandat test klart! Ta en välförtjänt paus.' : '🎖️ Bra jobbat! Ta en paus när du vill.';
    if (!s.retry && ratio < 0.5 && s.t) nextTip = '📘 Tips: titta på Lär dig en gång till och gör sedan testet igen.';
    var m = s.missed.length;
    var retryLabel = m === 1 ? 'Öva igen på frågan' : 'Öva igen på ' + m + ' frågor';
    var learnBtn = (m && s.t) ? '<a class="btn' + (ratio < 0.5 ? '' : ' secondary') + ' wide" href="#/a/' + s.a.id + '/t/' + s.t.id + '/learn/0">📘 Repetera Lär dig</a>' : '';
    var retryBtn = m ? '<button class="btn' + (ratio < 0.5 ? ' secondary' : '') + ' wide retry" type="button">' + retryLabel + '</button>' : '';
    var html = '<div class="card result pop"><div class="big">' + big + '</div><p class="score">' + s.right + ' av ' + n + ' rätt</p>' +
      (stars != null ? '<p>' + starHTML(stars) + '</p>' : '') + '<p class="lead">' + msg + '</p>' +
      '<p><span class="badge">+' + gained + ' poäng</span></p>' +
      (before !== after ? '<p class="lead">🎖️ Ny grad: <b>' + after + '</b>!</p>' : '') +
      (before !== after || newMedal ? '<div class="levelup">' + cadetSVG(rankIdx(progress.xp), medalCount(), 96) + '</div>' : '') +
      (newMedal ? '<p class="lead">🏅 Du klarade hela uppdraget och fick en medalj!</p>' : '') + '</div>' +
      (nextTip ? '<p class="note" style="text-align:center">' + nextTip + '</p>' : '') +
      '<div class="stack">' + (ratio < 0.5 ? learnBtn + retryBtn : retryBtn + learnBtn) +
      '<a class="btn secondary wide" href="#/a/' + s.a.id + '">🗺️ Till kartan</a></div>';
    if (isM) {
      var mm = s.missed.length;
      html = '<div class="card result pop"><div class="big">🎖️</div><p class="score">' + n + ' uppdrag klara!</p>' +
        '<p class="lead">' + (s.right === n ? 'Alla helt själv – riktigt starkt! 🏅' : s.right > 0 ? s.right + ' av dem helt själv. Bra jobbat!' : 'Du tog hjälp av Visa mig – det är så man lär sig. Bra jobbat!') + '</p>' +
        '<p><span class="badge">+' + gained + ' poäng</span></p>' + (before !== after ? '<p class="lead">🎖️ Ny grad: <b>' + after + '</b>!</p>' : '') + '</div>' +
        (!s.retry ? '<p class="note" style="text-align:center">🎖️ Bra jobbat! Ta en paus när du vill.</p>' : '') +
        '<div class="stack">' + (mm ? '<button class="btn wide retry" type="button">' + (mm === 1 ? 'Gör om uppdraget där du tog hjälp' : 'Gör om de ' + mm + ' där du tog hjälp') + '</button>' : '') +
        '<a class="btn secondary wide" href="#/a/' + s.a.id + '">🗺️ Till kartan</a></div>';
    }
    setView(html);
    var rb = app.querySelector('.retry');
    if (rb) rb.addEventListener('click', function () { startQuiz(s.a.id, s.tid, s.missed.slice()); });
  }

  function storageBanner() {
    try { localStorage.setItem('ovb-t', '1'); localStorage.removeItem('ovb-t'); return ''; }
    catch (e) { return '<div class="card note" style="padding:10px 14px">⚠️ Framsteg sparas inte i privat läge.</div>'; }
  }

  function showError(e) {
    setView('<div class="card empty"><div class="big">🧭</div><p><b>Hoppsan, något gick fel.</b></p><p class="muted">' + esc(e && e.message || '') + '</p><a class="btn" href="#/">Till start</a></div>');
  }

  // ---------- router ----------
  function route() {
    var h = location.hash.replace(/^#\/?/, '').split('/');
    if (h[0] === 's' && h[1]) return viewSubject(h[1]);
    if (h[0] === 'a' && h[1]) {
      if (h[2] === 'mixed') return startQuiz(h[1], 'mixed', h[3] === 'retry' ? 'missed' : undefined);
      if (h[2] === 't' && h[3]) {
        if (h[4] === 'learn') return viewLearn(h[1], h[3], parseInt(h[5] || '0', 10) || 0);
        if (h[4] === 'test') return startQuiz(h[1], h[3]);
        if (h[4] === 'retry') return startQuiz(h[1], h[3], 'missed');
      }
      return viewAssignment(h[1]);
    }
    viewHome();
  }
  window.__ovbTest = { checkText: checkText, fracWords: fracWords };
  // same-hash links (e.g. after replaceState) must still navigate; Avbryt cancels the saved quiz
  document.addEventListener('click', function (e) {
    var l = e.target.closest && e.target.closest('a[href^="#"]');
    if (!l) return;
    if (l.classList.contains('cancel')) {
      if (session && session.pos >= session.idxs.length) { e.preventDefault(); renderQuizEnd(); return; } // finished: show the result instead of throwing it away
      clearSession();
    }
    if (l.getAttribute('href') === location.hash) { e.preventDefault(); schedule(); }
  });
  var routeTimer;
  function schedule() { clearTimeout(routeTimer); routeTimer = setTimeout(route, 0); }
  window.addEventListener('popstate', schedule);
  window.addEventListener('hashchange', schedule);
  renderRank();
  route();
})();
