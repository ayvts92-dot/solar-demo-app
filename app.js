(function () {
  "use strict";

  /* =====================================================================
     SETTINGS - change the business details and numbers here (only here).
     All prices are EXAMPLES in PKR, not real offers.
     ===================================================================== */
  var SETTINGS = {
    businessName: "BrightSun Solar",
    whatsappNumber: "923000000000",   // demo number, digits only
    phoneNumber: "+923000000000",     // for the Call button
    WEBHOOK_URL: "",                  // n8n webhook (Production URL); empty = WhatsApp only
    ratePerUnit: 55,                  // PKR per unit (kWh)
    peakSunHours: 5,
    systemEfficiencyPercent: 80,
    hybridExtraLossPercent: 5,
    daysPerMonth: 30,
    panelWatts: 585,
    minPanels: 4,
    coverPercent: 90,
    ongridPricePerKwLow: 160000, ongridPricePerKwHigh: 200000,
    hybridInverterExtraPerKwLow: 20000, hybridInverterExtraPerKwHigh: 30000,
    batteryKwhPerKw: 1.5, batteryPricePerKwhLow: 80000, batteryPricePerKwhHigh: 120000,
    bill:  { min: 10000, max: 300000, step: 1000, start: 50000 },
    units: { min: 200,   max: 5000,   step: 50,   start: 900 }
  };
  var S = SETTINGS, STORE = "brightsun.saved.v1";

  function $(id) { return document.getElementById(id); }
  function fmt(n) { return Math.round(n).toLocaleString("en-US"); }
  function money(n) { return n >= 1e6 ? (n / 1e6).toFixed(2) + "M" : fmt(n); }
  function pkr(n) { return "PKR " + money(n); }
  function yrs(y) { return (Math.round(y * 10) / 10).toFixed(1); }

  /* ---------- the calculation (same model as the website) ---------- */
  function model(units, hybrid) {
    var eff = S.systemEfficiencyPercent * (hybrid ? 1 - S.hybridExtraLossPercent / 100 : 1);
    var perKw = S.peakSunHours * (eff / 100) * S.daysPerMonth;
    var target = units * S.coverPercent / 100;
    var panels = Math.max(S.minPanels, Math.ceil(target / perKw * 1000 / S.panelWatts - 1e-9));
    var kw = panels * S.panelWatts / 1000;
    var saved = Math.min(kw * perKw, target);
    var monthly = saved * S.ratePerUnit;
    var before = units * S.ratePerUnit;
    var batt = hybrid ? Math.round(kw * S.batteryKwhPerKw * 2) / 2 : 0;
    var low = kw * S.ongridPricePerKwLow, high = kw * S.ongridPricePerKwHigh;
    if (hybrid) {
      low += kw * S.hybridInverterExtraPerKwLow + batt * S.batteryPricePerKwhLow;
      high += kw * S.hybridInverterExtraPerKwHigh + batt * S.batteryPricePerKwhHigh;
    }
    return { kw: kw, panels: panels, batt: batt, low: low, high: high, monthly: monthly,
             before: before, after: Math.max(0, before - monthly),
             payLow: low / (monthly * 12), payHigh: high / (monthly * 12) };
  }

  /* ---------- state ---------- */
  var mode = "bill", hybrid = false, last = null;

  function setPressed(a, b, firstOn) { a.setAttribute("aria-pressed", firstOn); b.setAttribute("aria-pressed", !firstOn); }

  function applyMode(newMode) {
    var cfg = newMode === "bill" ? S.bill : S.units;
    var cur = parseFloat($("usage").value) || 0;
    var unitsNow = mode === "bill" ? cur / S.ratePerUnit : cur;
    mode = newMode;
    setPressed($("modeBill"), $("modeUnits"), mode === "bill");
    $("usage").min = cfg.min; $("usage").max = cfg.max; $("usage").step = cfg.step;
    $("usageRange").min = cfg.min; $("usageRange").max = cfg.max; $("usageRange").step = cfg.step;
    var v = unitsNow > 0 ? (mode === "bill" ? unitsNow * S.ratePerUnit : unitsNow) : cfg.start;
    v = Math.min(cfg.max, Math.max(cfg.min, Math.round(v / cfg.step) * cfg.step));
    $("usage").value = v; $("usageRange").value = v;
    $("unitTag").textContent = mode === "bill" ? "PKR" : "kWh";
    $("usageLabel").textContent = mode === "bill" ? "Your monthly electricity bill" : "Your monthly units (kWh)";
    calc();
  }

  function getUnits() {
    var v = parseFloat($("usage").value);
    if (!(v > 0)) return 0;
    return mode === "bill" ? v / S.ratePerUnit : v;
  }

  function reset() {
    ["rSize", "rPanels", "rBackup", "rCost", "rPay", "rSave", "vBefore", "vAfter"].forEach(function (id) { $(id).textContent = "-"; });
    $("barBefore").style.height = "0%"; $("barAfter").style.height = "0%";
    $("waBtn").href = "https://wa.me/" + S.whatsappNumber;
    $("saveBtn").disabled = true; last = null;
  }

  function calc() {
    var units = getUnits(), bill = units * S.ratePerUnit;
    $("typeHint").textContent = hybrid ? "Hybrid: keeps your lights on in a power cut. Costs more." : "On-grid: cheaper, switches off in a power cut.";
    if (!(bill >= 1000)) { $("hint").textContent = "Enter your monthly " + (mode === "bill" ? "bill" : "units") + " to see an estimate."; reset(); return; }
    $("hint").textContent = mode === "bill"
      ? "About " + fmt(units) + " units (kWh) a month at PKR " + S.ratePerUnit + " per unit."
      : "About PKR " + fmt(bill) + " a month at PKR " + S.ratePerUnit + " per unit.";
    var m = model(units, hybrid);
    var size = (Math.round(m.kw * 10) / 10).toFixed(1) + " kW";
    $("rSize").textContent = size;
    $("rPanels").textContent = m.panels;
    $("rBackup").textContent = hybrid ? m.batt + " kWh" : "None";
    $("rCost").textContent = pkr(m.low) + " – " + money(m.high);
    $("rPay").textContent = yrs(m.payLow) + "–" + yrs(m.payHigh) + " yrs";
    $("rSave").textContent = pkr(m.monthly);
    $("vBefore").textContent = pkr(m.before); $("vAfter").textContent = pkr(m.after);
    $("barBefore").style.height = "100%";
    $("barAfter").style.height = Math.max(2, m.after / m.before * 100) + "%";
    var type = hybrid ? "Hybrid" : "On-grid";
    last = { units: Math.round(units), bill: Math.round(bill), type: type, size: size, panels: m.panels,
             batt: m.batt, cost: pkr(m.low) + " – " + money(m.high),
             pay: yrs(m.payLow) + "–" + yrs(m.payHigh) + " years", save: pkr(m.monthly) };
    $("waBtn").href = "https://wa.me/" + S.whatsappNumber + "?text=" + encodeURIComponent(summary(last));
    $("saveBtn").disabled = false; $("savedOk").hidden = true;
  }

  function summary(e) {
    return "Hello " + S.businessName + ", I used your app (demo). My monthly use is about " + e.units + " units (PKR " + fmt(e.bill) + "). " +
      e.type + " system, " + e.size + " (" + e.panels + " panels)" + (e.batt ? ", battery " + e.batt + " kWh" : "") +
      ". Estimated cost " + e.cost + ", payback " + e.pay + ", saving " + e.save + " a month. I would like a free site survey.";
  }

  /* ---------- saved estimates (on this phone only) ---------- */
  function load() { try { return JSON.parse(localStorage.getItem(STORE)) || []; } catch (e) { return []; } }
  function store(list) { try { localStorage.setItem(STORE, JSON.stringify(list)); } catch (e) {} }

  function renderSaved() {
    var list = load(), box = $("savedList");
    box.textContent = "";
    $("savedEmpty").hidden = list.length > 0;
    $("clearAll").hidden = list.length === 0;
    $("badge").hidden = list.length === 0; $("badge").textContent = list.length;
    list.forEach(function (e) {
      var d = document.createElement("article"); d.className = "card item";
      var date = new Date(e.ts).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
      d.innerHTML = "<h3></h3><p class='when'></p><p class='a'></p><p class='b'></p><div class='row'></div>";
      d.querySelector("h3").textContent = e.size + " " + e.type;
      d.querySelector(".when").textContent = date + " · bill PKR " + fmt(e.bill);
      d.querySelector(".a").textContent = "Cost: " + e.cost;
      d.querySelector(".b").textContent = "Payback " + e.pay + " · saves " + e.save + " a month";
      var row = d.querySelector(".row");
      var wa = document.createElement("a"); wa.className = "btn wa"; wa.textContent = "WhatsApp"; wa.target = "_blank"; wa.rel = "noopener";
      wa.href = "https://wa.me/" + S.whatsappNumber + "?text=" + encodeURIComponent(summary(e)); row.appendChild(wa);
      if (navigator.share) {
        var sh = document.createElement("button"); sh.className = "btn ghost"; sh.type = "button"; sh.textContent = "Share";
        sh.onclick = function () { navigator.share({ title: S.businessName + " estimate", text: summary(e) }).catch(function () {}); };
        row.appendChild(sh);
      }
      var del = document.createElement("button"); del.className = "btn ghost"; del.type = "button"; del.textContent = "Delete";
      del.onclick = function () { ask("Delete this estimate?", function () { store(load().filter(function (x) { return x.id !== e.id; })); renderSaved(); }); };
      row.appendChild(del);
      box.appendChild(d);
    });
  }

  function ask(msg, yes) {
    var dlg = $("confirmDlg"); $("confirmMsg").textContent = msg;
    $("confirmYes").onclick = function () { dlg.close(); yes(); };
    $("confirmNo").onclick = function () { dlg.close(); };
    dlg.showModal();
  }

  /* ---------- tabs ---------- */
  function route() {
    var id = (location.hash || "#estimate").slice(1);
    if (!document.getElementById(id) || !document.querySelector("[data-tab=" + id + "]")) id = "estimate";
    document.querySelectorAll(".screen").forEach(function (s) { s.hidden = s.id !== id; });
    document.querySelectorAll(".tabs a").forEach(function (a) {
      if (a.dataset.tab === id) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
    if (id === "saved") renderSaved();
    window.scrollTo(0, 0);
  }

  /* ---------- contact form ---------- */
  function wireForm() {
    $("waChat").href = "https://wa.me/" + S.whatsappNumber;
    $("callBtn").href = "tel:" + S.phoneNumber;
    var form = $("quoteForm");
    function show(id, bad) { $(id).style.display = bad ? "block" : "none"; }
    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var name = $("fName").value.trim(), phone = $("fPhone").value.trim(), area = $("fArea").value.trim(), b = parseFloat($("fBill").value);
      var okN = name.length > 1, okP = phone.replace(/\D/g, "").length >= 10, okA = area.length > 1, okB = b > 0;
      show("eName", !okN); show("ePhone", !okP); show("eArea", !okA); show("eBill", !okB);
      if (!(okN && okP && okA && okB)) return;
      var msg = "Hello " + S.businessName + ", I would like a free site survey (demo app).\nName: " + name + "\nPhone: " + phone + "\nArea: " + area + "\nMonthly bill: PKR " + fmt(b);
      function openWa() { window.open("https://wa.me/" + S.whatsappNumber + "?text=" + encodeURIComponent(msg), "_blank", "noopener"); }
      if (!S.WEBHOOK_URL) { openWa(); return; }
      var btn = $("fBtn"), label = btn.textContent; btn.disabled = true; btn.textContent = "Sending...";
      fetch(S.WEBHOOK_URL, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name, phone: phone, area: area, bill: b, page: "app" }) })
        .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
        .then(function () { form.reset(); $("fOk").hidden = false; btn.textContent = label; btn.disabled = false; })
        .catch(function () { btn.disabled = false; btn.textContent = label; openWa(); });
    });
  }

  /* ---------- start ---------- */
  function start() {
    $("modeBill").onclick = function () { if (mode !== "bill") applyMode("bill"); };
    $("modeUnits").onclick = function () { if (mode !== "units") applyMode("units"); };
    $("typeOn").onclick = function () { hybrid = false; setPressed($("typeOn"), $("typeHy"), true); calc(); };
    $("typeHy").onclick = function () { hybrid = true; setPressed($("typeOn"), $("typeHy"), false); calc(); };
    $("usage").addEventListener("input", function () { $("usageRange").value = $("usage").value; calc(); });
    $("usageRange").addEventListener("input", function () { $("usage").value = $("usageRange").value; calc(); });
    $("saveBtn").onclick = function () {
      if (!last) return;
      var list = load(); list.unshift(Object.assign({ id: Date.now(), ts: Date.now() }, last)); store(list.slice(0, 50));
      $("savedOk").hidden = false; renderSaved();
    };
    $("clearAll").onclick = function () { ask("Delete all saved estimates from this phone?", function () { store([]); renderSaved(); }); };
    function net() { $("offlineChip").hidden = navigator.onLine; }
    window.addEventListener("online", net); window.addEventListener("offline", net); net();
    window.addEventListener("hashchange", route);
    wireForm(); applyMode("bill"); renderSaved(); route();
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(function () {});
  }
  start();
})();
