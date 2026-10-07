// RideBot HK website: language switch, fare tables, place search and the fare estimator.
// The fare maths mirrors ridebot/core/fares.py; the data comes from it via data.js.
(() => {
  "use strict";
  const D = window.RIDEBOT;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const HK_REGION = ["hong kong", "香港"];
  const BIAS = { lat: 22.3193, lon: 114.1694 };

  // ------------------------------------------------------------------ language
  let lang = initialLang();
  let region = "hk";
  let lastResult = null;

  function initialLang() {
    const asked = new URLSearchParams(location.search).get("lang");  // shareable: ?lang=zh-Hant
    if (asked && D.text[asked]) return asked;
    try {
      const saved = localStorage.getItem("lang");
      if (saved && D.text[saved]) return saved;
    } catch (e) { /* storage unavailable */ }
    const nav = (navigator.language || "en").toLowerCase();
    if (nav.startsWith("zh")) return /cn|sg|hans/.test(nav) ? "zh-Hans" : "zh-Hant";
    return "en";
  }

  function T(key, vars) {
    let s = (D.text[lang] && D.text[lang][key]) || D.text.en[key] || key;
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.split("{" + k + "}").join(v);
    return s;
  }

  function setLang(next) {
    lang = next;
    try { localStorage.setItem("lang", next); } catch (e) { /* ignore */ }
    applyText();
  }

  function applyText() {
    document.documentElement.lang = { en: "en", "zh-Hant": "zh-Hant-HK", "zh-Hans": "zh-Hans" }[lang];
    $$("[data-t]").forEach(el => { el.textContent = T(el.dataset.t); });
    $$("[data-t-ph]").forEach(el => { el.placeholder = T(el.dataset.tPh); });
    $$("[data-lang]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.lang === lang)));
    renderMeterTable();
    renderTollTable();
    renderAirport();
    if (lastResult) renderResult(lastResult);
  }

  const money = n => "HK$" + (Number.isInteger(n) ? n : n.toFixed(1));
  const tollName = key => {
    const t = D.tolls[key];
    return lang === "en" ? t.en : lang === "zh-Hans" ? t.zhs : t.zh;
  };
  const districtName = row => (lang === "en" ? row.en : lang === "zh-Hans" ? row.zhs : row.zh);

  // ------------------------------------------------------------------ tables
  function renderMeterTable() {
    const types = ["urban", "nt", "lantau"];
    const head = `<tr><th>${T("fares_col_item")}</th><th>🔴 ${T("fares_urban")}</th><th>🟢 ${T("fares_nt")}</th>` +
                 `<th>🔵 ${T("fares_lantau")}</th></tr>`;
    const row = (label, fn) => `<tr><th scope="row">${label}</th>${types.map(k => `<td class="num-cell">${fn(D.tariffs[k])}</td>`).join("")}</tr>`;
    $("#meter-table").innerHTML = head +
      row(T("fares_first"), t => money(t[0])) +
      row(T("fares_step"), t => money(t[1])) +
      row(T("fares_after"), t => T("fares_after_step", { threshold: money(t[2]), step: money(t[3]) }));
  }

  function renderTollTable() {
    const rows = Object.keys(D.tolls).map(k =>
      `<tr><td>${esc(tollName(k))}${D.tolls[k].harbour ? `<span class="tag">${T("est_single")}</span>` : ""}</td>` +
      `<td class="num-cell">${money(D.tolls[k].fee)}</td></tr>`);
    $("#toll-table").innerHTML = `<tr><th>${T("col_tunnel")}</th><th>${T("col_fee")}</th></tr>` + rows.join("");
  }

  function renderAirport() {
    $$("#region-tabs button").forEach(b => b.setAttribute("aria-selected", String(b.dataset.region === region)));
    const rows = D.airport.filter(r => r.region === region).map(r => {
      const via = r.tunnels.length ? r.tunnels.map(tollName).join(" + ") : `<span class="muted">${T("via_none")}</span>`;
      return `<tr><td>${esc(districtName(r))}</td><td class="num-cell">${money(r.low)}–${money(r.high)}</td>` +
             `<td>${via}</td><td class="num-cell">${r.km} km</td></tr>`;
    });
    $("#airport-table").innerHTML = `<tr><th>${T("col_district")}</th><th>${T("col_fare")}</th><th>${T("col_via")}</th>` +
                                   `<th>${T("col_km")}</th></tr>` + rows.join("");
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  const { estimate, detectTunnels } = window.RideBotFares(D);

  // ------------------------------------------------------------------ place search
  const picked = { from: null, to: null };

  async function photon(path, query) {
    const url = new URL("https://photon.komoot.io/" + path);
    Object.entries(query).forEach(([k, v]) => url.searchParams.set(k, v));
    const res = await fetch(url);
    if (!res.ok) throw new Error("search failed");
    return (await res.json()).features || [];
  }

  // Hong Kong places only. Names can be bilingual ("香港 Hong Kong") or just a district, so accept
  // anything that mentions Hong Kong, or lies inside Hong Kong unless it's marked as Shenzhen/Guangdong.
  const mentions = (p, words) => ["state", "city", "district", "county"]
    .some(k => words.some(w => (p[k] || "").toLowerCase().includes(w)));
  function inHongKong(f) {
    const p = f.properties, [lon, lat] = f.geometry.coordinates;
    if (mentions(p, HK_REGION)) return true;
    const inBox = lat > 22.15 && lat < 22.57 && lon > 113.82 && lon < 114.45;
    return inBox && !mentions(p, ["深圳", "shenzhen", "广东", "廣東", "guangdong"]);
  }

  function placeLabel(p) {
    const street = [p.street, p.housenumber].filter(Boolean).join(" ");
    const main = p.name || street || "–";
    const sub = [p.name ? street : null, p.district, p.city].filter(Boolean)
      .filter(x => x !== main && !HK_REGION.some(w => x.toLowerCase().includes(w)));
    return { main, sub: [...new Set(sub)].join(", ") };
  }

  function setupStop(key) {
    const field = $(`[data-stop="${key}"]`);
    const input = $("input", field);
    const list = $(".suggest", field);
    let timer, seq = 0;

    field.choose = place => {
      picked[key] = place;
      input.value = place.label;
      list.innerHTML = "";
      field.classList.add("chosen");
    };

    input.addEventListener("input", () => {
      picked[key] = null;
      field.classList.remove("chosen");
      clearTimeout(timer);
      const q = input.value.trim();
      if (q.length < 2) { list.innerHTML = ""; return; }
      timer = setTimeout(async () => {
        const mine = ++seq;
        try {
          let feats = await photon("api/", { q, limit: 20, lat: BIAS.lat, lon: BIAS.lon,
                                             lang: lang === "en" ? "en" : "default" });
          if (mine !== seq) return;
          feats = feats.filter(inHongKong);
          const seen = new Set();
          feats = feats.filter(f => {
            const l = placeLabel(f.properties), id = l.main + "|" + l.sub;
            return !seen.has(id) && seen.add(id);
          }).slice(0, 6);
          list.innerHTML = "";
          for (const f of feats) {
            const l = placeLabel(f.properties);
            const li = document.createElement("li");
            li.setAttribute("role", "option");
            li.innerHTML = `<span class="s-main">${esc(l.main)}</span><span class="s-sub">${esc(l.sub)}</span>`;
            const [lon, lat] = f.geometry.coordinates;
            li.addEventListener("click", () => field.choose({ lat, lon, label: l.sub ? `${l.main}, ${l.sub}` : l.main }));
            list.append(li);
          }
          status(feats.length ? "" : T("est_noresults"));
        } catch (e) {
          status(T("est_error"));
        }
      }, 300);
    });
    input.addEventListener("blur", () => setTimeout(() => { list.innerHTML = ""; }, 200));
  }

  const status = msg => { $("#est-status").textContent = msg; };

  function locate() {
    if (!navigator.geolocation) return status(T("est_locate_fail"));
    status(T("est_locating"));
    navigator.geolocation.getCurrentPosition(pos => {
      status("");
      $('[data-stop="from"]').choose({ lat: pos.coords.latitude, lon: pos.coords.longitude, label: "📍 " + T("est_here") });
    }, () => status(T("est_locate_fail")), { enableHighAccuracy: true, timeout: 10000 });
  }

  // ------------------------------------------------------------------ estimator
  async function onEstimate(ev) {
    ev.preventDefault();
    if (!picked.from || !picked.to) return status(T("est_need_both"));
    const go = $("#est-go");
    go.disabled = true;
    status(T("est_working"));
    try {
      const { from, to } = picked;
      const url = `https://router.project-osrm.org/route/v1/driving/${from.lon},${from.lat};${to.lon},${to.lat}` +
                  "?overview=full&geometries=geojson";
      const res = await fetch(url);
      const route = (await res.json()).routes[0];
      const path = route.geometry.coordinates.map(([lon, lat]) => [lat, lon]);
      const km = route.distance / 1000, minutes = route.duration / 60;
      const type = $("#type").value;
      const est = estimate(km, minutes, detectTunnels(path), type, Number($("#luggage").value), $("#pet").checked ? 1 : 0);
      lastResult = { ...est, km, minutes, from, to };
      renderResult(lastResult);
      status("");
    } catch (e) {
      status(T("est_error"));
    } finally {
      go.disabled = false;
    }
  }

  function renderResult(r) {
    const box = $("#est-result");
    const lines = [`<li><span>${T("est_meter")}</span><span>${money(r.meterLow)}–${money(r.meterHigh)}</span></li>`];
    for (const [k, fee] of r.tolls) {
      const single = D.tolls[k].harbour ? ` <span class="muted">(${T("est_single")})</span>` : "";
      lines.push(`<li><span>${esc(tollName(k))}${single}</span><span>${money(fee)}</span></li>`);
    }
    if (!r.tolls.length) lines.push(`<li><span>${T("est_no_tunnel")}</span><span>–</span></li>`);
    if (r.luggage) lines.push(`<li><span>${T("est_luggage_line", { n: r.luggage })}</span><span>${money(r.luggage * D.luggage)}</span></li>`);
    if (r.pets) lines.push(`<li><span>${T("est_pet_line")}</span><span>${money(D.pet)}</span></li>`);
    const code = n => Math.round(n * 1e5);
    const start = `trip_${code(r.from.lat)}_${code(r.from.lon)}_${code(r.to.lat)}_${code(r.to.lon)}`.replace(/-/g, "m");
    box.innerHTML =
      `<p class="muted small">${T("est_result")}</p>` +
      `<p class="range">${money(r.low)}–${money(r.high)}</p>` +
      `<p class="route">${T("est_route", { km: r.km.toFixed(1), min: Math.max(1, Math.round(r.minutes)) })}</p>` +
      `<ul>${lines.join("")}</ul>` +
      `<p class="note">ℹ️ ${T("est_disclaimer")}</p>` +
      `<a class="btn btn-primary wide" href="${D.bots.rider}?start=${start}">${T("est_book")}</a>`;
  }

  // ------------------------------------------------------------------ wiring
  $$(".rider-link").forEach(a => { a.href = D.bots.rider; });
  $$(".driver-link").forEach(a => { a.href = D.bots.driver; });
  $$("[data-lang]").forEach(b => b.addEventListener("click", () => setLang(b.dataset.lang)));
  $$("#region-tabs button").forEach(b => b.addEventListener("click", () => { region = b.dataset.region; renderAirport(); }));
  setupStop("from");
  setupStop("to");
  $("#locate").addEventListener("click", locate);
  $("#est-form").addEventListener("submit", onEstimate);
  applyText();
})();
