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
    rankEl.innerHTML = '<b>' + r[1] + '</b><br>' + xp + ' poäng' + (n ? '<span class="tonext"> · ' + (n[0] - xp) + ' kvar till ' + n[1] + '</span>' : ' ⭐');
  }

  // ---------- text helpers ----------
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fracHTML(n, d) { return '<span class="frac" aria-label="' + esc(fracWords(n, d)) + '"><span>' + n + '</span><span>' + d + '</span></span>'; }
  // **bold**, fractions like 3/4 rendered stacked, line breaks
  function fmt(s) {
    var h = esc(s);
    h = h.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
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
    return String(s || '').replace(/\*\*/g, '').replace(/→/g, ', sedan ').replace(/=/g, ' blir ').replace(/(\d{1,2})\/(\d{1,2})/g, function (m, n, d) { return fracWords(n, d); });
  }

  // ---------- read aloud (Swedish) ----------
  var svVoice = null;
  function pickVoice() {
    if (!('speechSynthesis' in window)) return;
    var vs = speechSynthesis.getVoices() || [];
    svVoice = vs.filter(function (v) { return /^sv/i.test(v.lang); })[0] || null;
  }
  if ('speechSynthesis' in window) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
  function speakBtn(text) {
    if (!('speechSynthesis' in window)) return '';
    return '<button class="speak" type="button" data-say="' + esc(speechText(text)) + '" aria-label="Läs upp">🔊</button>';
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-say]');
    if (!b) return;
    try {
      speechSynthesis.cancel();
      var u = new SpeechSynthesisUtterance(b.getAttribute('data-say'));
      u.lang = 'sv-SE'; u.rate = 0.92; if (svVoice) u.voice = svVoice;
      speechSynthesis.speak(u);
    } catch (err) { /* ignore */ }
  });

  // ---------- visuals (SVG generators) ----------
  var C = { fill: '#3fa7d6', fill2: '#ffb703', line: '#1b2333', soft: '#dbe7f3' };
  function bar(o) {
    var w = 300, h = 46, parts = o.parts, fw = w / parts, s = '';
    for (var i = 0; i < parts; i++) s += '<rect x="' + (10 + i * fw) + '" y="8" width="' + fw + '" height="' + h + '" fill="' + (i < o.filled ? (o.color || C.fill) : '#fff') + '" stroke="' + C.line + '" stroke-width="2"/>';
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
  function visual(v) {
    if (!v) return '';
    var f = { bar: bar, compareBars: compareBars, numberLine: numberLine, compareLines: compareLines, groups: groups }[v.type];
    var svg = f ? f(v) : (v.type === 'emoji' ? '<div style="font-size:48px">' + esc(v.text) + '</div>' : '');
    return '<div class="vis">' + svg + (v.caption ? '<div class="note">' + fmt(v.caption) + '</div>' : '') + '</div>';
  }

  // ---------- answer checking ----------
  function norm(s) { return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim().replace(/[.!?,;:]+$/, ''); }
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
    var m = String(raw || '').trim().toLowerCase().match(/^(-?\d+)\s*[a-zåäö]*\s*[.!]?$/);
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
  function answerText(q) {
    if (q.type === 'single') return q.options[q.answer];
    if (q.type === 'multi') return q.answer.map(function (i) { return q.options[i]; }).join(' och ');
    return q.answer[0];
  }

  // ---------- question rendering (shared by learn "try" and tests) ----------
  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function renderQuestion(q, box, onDone, opts) {
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
      html += '<input class="txt" ' + (q.input === 'number' ? 'inputmode="numeric"' : 'autocapitalize="off" spellcheck="false"') + ' autocomplete="off" aria-label="Skriv ditt svar" placeholder="Skriv ditt svar här">';
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

  // ---------- data loading ----------
  function getJSON(url) { return fetch(url, { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error(url); return r.json(); }); }
  function loadManifest() { return manifest ? Promise.resolve(manifest) : getJSON('content/manifest.json').then(function (m) { manifest = m; return m; }); }
  function loadAssignment(id) {
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

  function viewSubject(sid) {
    loadManifest().then(function (m) {
      var subj = m.subjects.filter(function (s) { return s.id === sid; })[0] || m.subjects[0];
      var tabs = '<nav class="tabs" aria-label="Ämnen">' + m.subjects.map(function (s) {
        return '<a class="tab" href="#/s/' + s.id + '"' + (s.id === subj.id ? ' aria-current="page"' : '') + '>' + s.icon + ' ' + esc(s.name) + '</a>';
      }).join('') + '</nav>';
      var list = m.assignments.filter(function (a) { return a.subject === subj.id; });
      var body = list.length ? list.map(function (a) {
        var st = assignmentStatus(a);
        var prog = st.total ? '<p class="note" style="margin:6px 0 0">' + (st.done >= st.total ? '✅ Alla tester gjorda' : '🎯 ' + st.done + ' av ' + st.total + ' tester gjorda') + '</p>' : '';
        return '<a class="card tile" href="#/a/' + a.id + '"><div class="mission"><div class="ico">' + (a.icon || subj.icon) + '</div><div><h3>' + esc(a.title) + '</h3>' +
          '<span class="pill">' + esc(a.week || '') + '</span> ' + (a.due ? '<span class="note">Läxa till ' + esc(a.due) + '</span>' : '') +
          '<p class="muted" style="margin:6px 0 0">' + esc(a.summary || '') + '</p>' + prog + '</div></div></a>';
      }).join('') : '<div class="card empty"><div class="big">🛰️</div><p><b>Inga uppdrag här än.</b></p><p class="muted">Nya uppdrag dyker upp när skolan ger läxor eller prov i ' + esc(subj.name) + '.</p></div>';
      setView(storageBanner() + tabs + '<h1>' + subj.icon + ' ' + esc(subj.name) + '</h1>' + body);
    }).catch(showError);
  }
  function bestLine(best, total) { return best != null ? ' <span class="note">· Bästa: ' + best + ' av ' + total + '</span>' : ''; }

  function viewAssignment(aid) {
    loadAssignment(aid).then(function (a) {
      var html = '<a class="crumb" href="#/s/' + a.subject + '">← ' + esc(a.subjectName || 'Tillbaka') + '</a>';
      html += '<h1>' + (a.icon || '') + ' ' + esc(a.title) + '</h1>';
      if (a.intro) html += '<div class="card"><div class="row between" style="flex-wrap:nowrap;align-items:flex-start"><p class="lead" style="margin:0;flex:1">' + fmt(a.intro) + '</p>' + speakBtn(a.intro) + '</div></div>';
      a.topics.forEach(function (t, i) {
        var r = rec(a.id + '/' + t.id), sTest = starsFor(r.best, t.test.length);
        html += '<div class="card"><h2 style="margin-top:0">Del ' + (i + 1) + ': ' + esc(t.title) + '</h2><ul class="steps">' +
          '<li class="step"><span class="lbl">📘 Lär dig ' + (r.learned ? '<span class="note">✓ klar</span>' : '') + '</span><a class="btn small' + (r.learned ? ' secondary' : '') + '" href="#/a/' + a.id + '/t/' + t.id + '/learn/0">' + (r.learned ? 'Igen' : 'Starta') + '</a></li>' +
          '<li class="step"><span class="lbl">🎯 Testa dig <span class="note">(' + t.test.length + ' frågor)</span><br>' + starHTML(sTest) + bestLine(r.best, t.test.length) + '</span><a class="btn small' + (r.best != null ? ' secondary' : '') + '" href="#/a/' + a.id + '/t/' + t.id + '/test">' + (r.best != null ? 'Igen' : 'Starta') + '</a></li>' +
          '</ul></div>';
      });
      if (a.mixed && a.mixed.length) {
        var rm = rec(a.id + '/mixed');
        html += '<div class="card"><h2 style="margin-top:0">🏆 Blandat test</h2><p class="muted">Frågor från alla delar. Gör det en annan dag än delarna – då minns hjärnan bättre.</p><div class="row between"><span>' + starHTML(starsFor(rm.best, a.mixed.length)) + bestLine(rm.best, a.mixed.length) + '</span><a class="btn small' + (rm.best != null ? ' secondary' : '') + '" href="#/a/' + a.id + '/mixed">' + (rm.best != null ? 'Igen' : 'Starta') + '</a></div></div>';
      }
      setView(html);
    }).catch(showError);
  }

  function viewLearn(aid, tid, idx) {
    loadAssignment(aid).then(function (a) {
      var t = a.topics.filter(function (x) { return x.id === tid; })[0];
      if (!t) throw new Error('Hittar inte delen');
      idx = Math.max(0, Math.min(idx, t.learn.length - 1));
      var c = t.learn[idx], last = idx === t.learn.length - 1;
      var dots = '<div class="dots" aria-label="Kort ' + (idx + 1) + ' av ' + t.learn.length + '">' + t.learn.map(function (_, i) { return '<i class="' + (i <= idx ? 'on' : '') + '"></i>'; }).join('') + '</div>';
      var html = '<a class="crumb" href="#/a/' + a.id + '">← ' + esc(a.title) + '</a>' +
        '<p class="note" style="margin:0">📘 ' + esc(t.title) + ' · kort ' + (idx + 1) + ' av ' + t.learn.length + '</p>' + dots +
        '<div class="card pop"><div class="row between" style="flex-wrap:nowrap"><h2 style="margin:0;flex:1">' + esc(c.title) + '</h2>' + speakBtn(c.title + '. ' + c.text + (c.visual && c.visual.caption ? '. ' + c.visual.caption : '')) + '</div>' +
        '<p class="lead">' + fmt(c.text) + '</p>' + visual(c.visual) +
        (c.try ? '<div class="try"><h4>Prova själv!</h4><div class="trybox"></div></div>' : '') + '</div>' +
        '<div class="row between">' +
        (idx > 0 ? '<a class="btn secondary" href="#/a/' + a.id + '/t/' + t.id + '/learn/' + (idx - 1) + '">← Bakåt</a>' : '<span></span>') +
        (last ? '<a class="btn next" href="#/a/' + a.id + '/t/' + t.id + '/test">Klar! Till testet →</a>' : '<a class="btn" href="#/a/' + a.id + '/t/' + t.id + '/learn/' + (idx + 1) + '">Nästa →</a>') +
        '</div>';
      setView(html);
      if (c.try) {
        var tb = app.querySelector('.trybox');
        var runTry = function () {
          renderQuestion(c.try, tb, function (ok, fbw) {
            if (ok) return;
            var r = document.createElement('div'); r.className = 'row end';
            r.innerHTML = '<button class="btn secondary small again" type="button">Försök igen</button>';
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
    try { var s = JSON.parse(sessionStorage.getItem(SKEY)); if (s && s.aid === aid && s.tid === tid && s.pos < s.idxs.length) return s; } catch (e) { }
    return null;
  }

  function startQuiz(aid, tid, onlyIdx) {
    return loadAssignment(aid).then(function (a) {
      var t = tid === 'mixed' ? null : a.topics.filter(function (x) { return x.id === tid; })[0];
      var all = tid === 'mixed' ? a.mixed : (t && t.test);
      if (!all) throw new Error('Hittar inte testet');
      var saved = onlyIdx ? null : readSession(aid, tid);
      var idxs = onlyIdx || all.map(function (_, i) { return i; });
      if (!onlyIdx && !saved && rec(a.id + '/' + tid).best != null && idxs.length > 3) idxs = idxs.slice(0, 2).concat(shuffle(idxs.slice(2)));
      session = { t: t, a: a, tid: tid, title: tid === 'mixed' ? 'Blandat test' : t.title, all: all, idxs: idxs, pos: 0, right: 0, missed: [], retry: !!onlyIdx };
      if (saved && saved.idxs.every(function (i) { return i < all.length; })) { session.idxs = saved.idxs; session.pos = saved.pos; session.right = saved.right; session.missed = saved.missed; session.retry = saved.retry; }
      renderQuizStep();
    }).catch(showError);
  }

  function renderQuizStep() {
    var s = session, n = s.idxs.length;
    if (s.pos >= n) return renderQuizEnd();
    saveSession();
    var base = s.all[s.idxs[s.pos]], q = (s.retry && base.twin) ? base.twin : base;
    var html = '<div class="row between"><a class="crumb" href="#/a/' + s.a.id + '">← Avbryt</a><span class="note">' + (s.retry ? 'Öva igen · ' : '') + esc(s.title) + '</span></div>' +
      '<div class="progress" aria-hidden="true"><i style="width:' + Math.round(100 * s.pos / n) + '%"></i></div>' +
      '<p class="note" style="margin:0 0 4px">Fråga ' + (s.pos + 1) + ' av ' + n + '</p>' +
      '<div class="card qbox pop"></div>';
    setView(html);
    app.querySelector('.qbox').setAttribute('data-idx', s.idxs[s.pos]);
    renderQuestion(q, app.querySelector('.qbox'), function (ok, fbw) {
      if (ok) s.right++; else s.missed.push(s.idxs[s.pos]);
      s.pos++; saveSession(); // answer is locked in even if the page reloads now
      var b = document.createElement('div'); b.className = 'row end';
      b.innerHTML = '<button class="btn nextq" type="button">' + (s.pos < n ? 'Nästa fråga →' : 'Se resultatet →') + '</button>';
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
    var gained = s.right * (s.retry ? 5 : 10);
    progress.xp = (progress.xp || 0) + gained;
    var before = rankOf(progress.xp - gained)[1], after = rankOf(progress.xp)[1];
    var stars = null, ratio = s.right / n;
    if (!s.retry) { r.best = Math.max(r.best || 0, s.right); r.last = s.right; stars = starsFor(s.right, n); }
    r.updated = new Date().toISOString();
    saveProgress();
    var big = s.right === n ? '🏆' : ratio >= 0.7 ? '🚀' : '💪';
    var msg = s.right === n ? 'Fullpott! Alla rätt!' : ratio >= 0.7 ? 'Riktigt bra jobbat!' : 'Bra kämpat! Varje försök gör hjärnan starkare.';
    var nextTip = '';
    if (!s.retry && ratio >= 0.7) nextTip = s.tid === 'mixed' ? '🎖️ Uppdraget klart! Ta en välförtjänt paus.' : '🎖️ Dags för paus! Nästa steg kan vänta till i morgon.';
    if (!s.retry && ratio < 0.5 && s.t) nextTip = '📘 Tips: titta på Lär dig en gång till och gör sedan testet igen.';
    var m = s.missed.length;
    var retryLabel = m === 1 ? 'Öva igen på frågan' : 'Öva igen på ' + m + ' frågor';
    var learnBtn = (m && s.t) ? '<a class="btn' + (ratio < 0.5 ? '' : ' secondary') + ' wide" href="#/a/' + s.a.id + '/t/' + s.t.id + '/learn/0">📘 Repetera Lär dig</a>' : '';
    var retryBtn = m ? '<button class="btn' + (ratio < 0.5 ? ' secondary' : '') + ' wide retry" type="button">' + retryLabel + '</button>' : '';
    var html = '<div class="card result pop"><div class="big">' + big + '</div><p class="score">' + s.right + ' av ' + n + ' rätt</p>' +
      (stars != null ? '<p>' + starHTML(stars) + '</p>' : '') + '<p class="lead">' + msg + '</p>' +
      '<p><span class="badge">+' + gained + ' poäng</span></p>' +
      (before !== after ? '<p class="lead">🎖️ Ny grad: <b>' + after + '</b>!</p>' : '') + '</div>' +
      (nextTip ? '<p class="note" style="text-align:center">' + nextTip + '</p>' : '') +
      '<div class="stack">' + (ratio < 0.5 ? learnBtn + retryBtn : retryBtn + learnBtn) +
      '<a class="btn secondary wide" href="#/a/' + s.a.id + '">Till uppdraget</a></div>';
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
      if (h[2] === 'mixed') return startQuiz(h[1], 'mixed');
      if (h[2] === 't' && h[3]) {
        if (h[4] === 'learn') return viewLearn(h[1], h[3], parseInt(h[5] || '0', 10) || 0);
        if (h[4] === 'test') return startQuiz(h[1], h[3]);
      }
      return viewAssignment(h[1]);
    }
    loadManifest().then(function (m) {
      var withContent = m.subjects.filter(function (s) { return m.assignments.some(function (a) { return a.subject === s.id; }); })[0];
      viewSubject((withContent || m.subjects[0]).id);
    }).catch(showError);
  }
  window.__ovbTest = { checkText: checkText, fracWords: fracWords };
  window.addEventListener('hashchange', route);
  renderRank();
  route();
})();
