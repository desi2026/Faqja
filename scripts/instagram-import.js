#!/usr/bin/env node
/*
 * Instagram → properties. Reads the agency's own Instagram posts and turns every property post into
 * data/listings/<code>.json plus its photos in static/images/uploads/. No npm dependencies (Node 20+, global fetch).
 * GitHub Actions runs it every hour (.github/workflows/instagram.yml); the caption template is in README → "Instagram".
 *
 *   node scripts/instagram-import.js                       import new and edited posts (needs IG_ACCESS_TOKEN)
 *   node scripts/instagram-import.js --preview 5           show how the 5 latest posts would be read, changing nothing
 *   node scripts/instagram-import.js --check               only check that property codes are unique (run before pushing)
 *   node scripts/instagram-import.js --refresh-token FILE  renew the 60-day Instagram token and write it to FILE
 *
 * Rules:
 * - Only posts from the first run on are read (IG_SINCE=YYYY-MM-DD brings in older ones once).
 * - A post with the deal line ("Shitje" / "Qira"), a "Kodi:" line, or both "Zona:" and "Çmimi:" is a property post;
 *   other posts (greetings, team photos) are skipped.
 * - A complete post (deal, type, zone and at least one photo) goes online at once. An incomplete one is saved hidden
 *   ("Fshih plotësisht nga faqja") with the reason in "Shënim i brendshëm", to finish in the panel.
 * - Editing the caption updates the property, deleting the post hides it, as long as nobody has changed that property
 *   in the panel. Once it is saved in the panel, the panel wins and Instagram never touches it again.
 * - Posts older than 180 days are no longer followed; their properties are changed in the panel.
 * - data/instagram.json remembers which post became which property. Commits that change only that file skip the Netlify deploy.
 */
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.resolve(__dirname, "..");
const LIST_DIR = "data/listings";
const UPLOAD_DIR = "static/images/uploads";
const PUBLIC_DIR = "/images/uploads";
const STATE_FILE = "data/instagram.json";
const MAX_PHOTOS = 20;
const MAX_TRIES = 6; // a post whose photos keep failing is retried for about six hours, then reported
const FIRST_CODE = 1001; // Instagram codes start here, so they never clash with codes typed in the panel (101, 102 …)
const MAX_HIDE = 3; // above this many "deleted" posts in one run, a post that is still there is checked first
const WINDOW_DAYS = 180; // edits and deletions of posts older than this are no longer followed (the panel is used for those)

const env = process.env;
const HOST = (env.IG_GRAPH_HOST || "graph.instagram.com").replace(/^https?:\/\//, "").replace(/\/+$/, "");
const API = `https://${HOST}${env.IG_API_VERSION ? "/" + env.IG_API_VERSION.trim() : ""}`;
const USER = (env.IG_USER_ID || "").trim() || (HOST === "graph.instagram.com" ? "me" : "");
const TOKEN = (env.IG_ACCESS_TOKEN || "").trim();
const FIXTURE_FILE = env.IG_FIXTURE ? path.resolve(env.IG_FIXTURE) : "";
const FIXTURE = FIXTURE_FILE ? JSON.parse(fs.readFileSync(FIXTURE_FILE, "utf8")) : null; // tests: posts from a file, no network
const NOW = env.IG_NOW ? new Date(env.IG_NOW) : new Date();

/* ------------------------------ files ------------------------------ */
const abs = (p) => path.join(ROOT, p);
const readText = (p) => fs.readFileSync(abs(p), "utf8");
const readJSON = (p) => JSON.parse(readText(p));
const exists = (p) => fs.existsSync(abs(p));
const hash = (s) => crypto.createHash("sha256").update(s).digest("hex").slice(0, 16);
const toJSON = (o) => JSON.stringify(o, null, 2) + "\n";
const listingFile = (code) => `${LIST_DIR}/${code}.json`;
function write(p, data) {
  fs.mkdirSync(path.dirname(abs(p)), { recursive: true });
  fs.writeFileSync(abs(p), data);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Messages end up in public places (Actions log, commit message, data/instagram.json), so the key never appears in them.
const scrub = (m) => (TOKEN ? String(m).split(TOKEN).join("***") : String(m));
const log = (m) => console.log(m);

// Every listing file and its code. Codes must be whole numbers above 0 and unique (build.js stops otherwise).
function readCodes() {
  const codes = new Map();
  const bad = [];
  if (!exists(LIST_DIR)) return { codes, bad };
  for (const f of fs.readdirSync(abs(LIST_DIR)).filter((f) => f.endsWith(".json")).sort()) {
    let id;
    try { id = Number(readJSON(`${LIST_DIR}/${f}`).id); } catch (e) { bad.push(`${f} nuk lexohet (${e.message})`); continue; }
    if (!Number.isInteger(id) || id <= 0) bad.push(`${f} ka kod të pavlefshëm`);
    else if (codes.has(id)) bad.push(`kodi ${id} përdoret nga ${codes.get(id)} dhe ${f}`);
    else codes.set(id, f);
  }
  return { codes, bad };
}

/* ------------------------------ text ------------------------------- */
// Lowercase without ë/ç/accents, for matching what people type ("Cmimi", "çmimi", "ÇMIMI").
const fold = (s) => String(s || "").toLowerCase().replace(/ë/g, "e").replace(/ç/g, "c").normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/\s+/g, " ").trim();
const EMOJI = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}‍︎️⃣]/gu;
const stripEmoji = (s) => String(s || "").replace(EMOJI, "").replace(/[ \t]{2,}/g, " ").trim();
// Leading bullets, emojis and dashes ("📍 Zona: Blloku", "• 2+1", "– Kati 4").
const stripLead = (s) => stripEmoji(s).replace(/^[^\p{L}\p{N}+\-€]+/u, "").replace(/^[-–—]\s+/, "").trim();
const isHashtagLine = (s) => /^([#@][\p{L}\p{N}_.]+[\s,.]*)+$/u.test(s.trim());
const PHONE = /(\+\s?355|\b0)\s?6[6-9][\d\s.\-]{6,}/;
const cleanHashtags = (s) => s.replace(/(\s*#[\p{L}\p{N}_]+)+\s*$/u, "").replace(/#([\p{L}\p{N}_]+)/gu, "$1").trim();
function sentenceCase(s) {
  const letters = s.replace(/[^\p{L}]/gu, "");
  const upper = letters.replace(/[^\p{Lu}]/gu, "");
  if (letters.length < 6 || upper.length / letters.length < 0.7) return s;
  const lower = s.toLocaleLowerCase("sq");
  return lower.charAt(0).toLocaleUpperCase("sq") + lower.slice(1);
}
function cut(s, max) {
  if (s.length <= max) return s;
  const x = s.slice(0, max + 1);
  return (x.lastIndexOf(" ") > max * 0.6 ? x.slice(0, x.lastIndexOf(" ")) : s.slice(0, max)).replace(/[\s,;:–-]+$/, "");
}
const int = (v) => { const m = String(v).match(/-?\d+/); return m ? Number(m[0]) : undefined; };
function num(v) {
  const m = String(v).replace(/(\d)[.,\s'](?=\d{3}\b)/g, "$1").match(/\d+(?:[.,]\d+)?/);
  return m ? Number(m[0].replace(",", ".")) : undefined;
}

/* --------------------------- caption parser --------------------------- */
const KEYS = [
  ["code", /^(kodi|kod|code|ref|referenca)$/],
  ["deal", /^(oferta|qellimi|per|transaksioni)$/],
  ["type", /^(lloji|tipi|lloji i prones|prona)$/],
  ["zone", /^(zona|vendndodhja|lagjja|lagja|lokacioni|vendi)$/],
  ["price", /^(cmimi|cmim|price|vlera)$/],
  ["rooms", /^(dhoma|dhomat|tipologjia|struktura|konfigurimi)$/],
  ["area", /^(siperfaqja|siperfaqe|siperfaqja bruto|bruto|metrazhi|m2|m²)$/],
  ["area_net", /^(neto|siperfaqja neto)$/],
  ["plot_area", /^(truall|trualli|oborr|oborri|toka|siperfaqja e truallit|siperfaqja e oborrit)$/],
  ["floor", /^(kati)$/],
  ["baths", /^(banjo|banja|tualete|wc)$/],
  ["features", /^(karakteristika|karakteristikat|vecori|vecorite|ka|extra|perfshin)$/],
  ["deed", /^(hipoteka|hipoteke|dokumentacioni|dokumentet)$/],
  ["condition", /^(gjendja)$/],
  ["year", /^(viti|viti i ndertimit|ndertuar)$/],
  ["sea", /^(deti|nga deti|larg detit|largesia nga deti|distanca nga deti)$/],
  ["orientation", /^(orientimi|ekspozimi)$/],
  ["deposit", /^(depozita|depozite)$/],
  ["term", /^(afati|afati minimal|kohezgjatja)$/],
  ["available", /^(e lire nga|lire nga|e disponueshme nga|disponueshme nga)$/],
  ["status", /^(statusi)$/],
  ["agent", /^(agjenti|agjentja)$/],
  ["video", /^(video|tur virtual)$/],
  ["title", /^(titulli)$/],
  ["desc", /^(pershkrimi)$/],
];
const DEAL_LINES = {
  sale: ["shitje", "ne shitje", "per shitje", "shitet", "sale", "for sale"],
  rent: ["qira", "me qira", "per qira", "ne qira", "jepet me qira", "jepet me qera", "rent", "for rent"],
};
const DEAL_TAGS = { sale: ["shitje", "neshitje", "pershitje", "shitet"], rent: ["qira", "meqira", "perqira", "jepetmeqira"] };
function dealOf(v) {
  const f = fold(v);
  if (/\b(qira|qera|qeraje|rent)\b/.test(f)) return "rent";
  if (/\b(shitje|shitet|shes|sale)\b/.test(f)) return "sale";
  return "";
}
function typeOf(v) {
  const f = fold(v);
  const pats = {
    apartment: /\b(apartament\w*|garsonier\w*|penthouse|dupleks|duplex|studio|apartment)\b/,
    villa: /\b(vile|vila|vilen|shtepi\w*|villa|house)\b/,
    office: /\b(zyre|zyra|zyren|ambient\w*|dyqan\w*|lokal\w*|magazin\w*|biznes\w*|office|njesi tregtare)\b/,
    land: /\b(truall\w*|toke|tokë|terren\w*|parcel\w*|land)\b/,
  };
  let best = "", at = Infinity;
  for (const [t, re] of Object.entries(pats)) { const m = f.match(re); if (m && m.index < at) { best = t; at = m.index; } }
  return best; // the first type word wins: "Vilë me truall" is a villa
}
const FEATURE_WORDS = [
  ["garage", /garazh|garage/], ["parking", /parkim|parking/], ["elevator", /ashensor|\blift\b|elevator/],
  ["furnished", /mobiluar|mobilim|furnished/], ["seaview", /pamje (nga |ne )?det|pamje deti|sea ?view/],
  ["balcony", /ballkon|verand|balcony/], ["terrace", /tarrac|terrace/], ["pool", /pishin|\bpool\b/],
  ["garden", /oborr|kopsht|garden/], ["heating", /ngrohje|kaldaj|heating|radiator/],
  ["ac", /kondicioner|klimatiz|\bac\b|air ?condition/], ["security", /\broje\b|siguri|24\/7|security|portier/],
  ["storage", /\bdepo\b|bodrum|magazin|storage|qilar/],
];
function featuresOf(v, notes) {
  const out = [];
  for (const raw of String(v).split(/[,;·•|\/]|\s+dhe\s+/)) {
    const t = fold(stripEmoji(raw));
    if (!t) continue;
    if (/^(pa|jo)\b/.test(t)) continue; // "pa mobilim"
    const hit = FEATURE_WORDS.filter(([, re]) => re.test(t)).map(([k]) => k);
    if (hit.length) hit.forEach((k) => out.includes(k) || out.push(k));
    else if (!/^(24|7)$/.test(t)) notes.push(`karakteristika „${raw.trim()}” nuk njihet`);
  }
  return out;
}
// "185.000 €", "€185.000", "120.000,00 €", "145,000", "85 000", "185k", "1,2 mln", "me marrëveshje".
// The number right next to € wins, so "110 m², 185.000 €" is 185000. Prices in lek or per m² are not taken.
const NUM = String.raw`(\d{1,3}(?:[.\s']\d{3})+(?:,\d{1,2})?|\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:[.,]\d+)?)`;
const MULT = String.raw`(?:\s*(k|mije|mij|mln|milion|million)\b)?`;
const PRICE_RES = [new RegExp(NUM + MULT + String.raw`\s*(?:€|eur)`), new RegExp(String.raw`(?:€|eur\w*)\s*` + NUM + MULT), new RegExp(NUM + MULT)];
function priceOf(v) {
  const f = fold(v);
  if (!/\d/.test(f)) return /marreveshje|negocio|kontakt|telefon|inbox|privat|\bdm\b/.test(f) ? { none: true } : null;
  if (/\blek|\d\s*all\b/.test(f)) return { bad: "është në lekë" };
  if (/\/\s*m(2|²|q)|\bper m(2|²|eter|q)/.test(f)) return { bad: "duket çmim për m²" };
  const m = PRICE_RES.map((re) => f.match(re)).find(Boolean);
  if (!m) return null;
  let t = m[1].replace(/[\s']/g, ""), n;
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) n = Number(t.replace(/,\d+$/, "").replace(/\./g, ""));
  else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) n = Number(t.replace(/\.\d+$/, "").replace(/,/g, ""));
  else n = Number(t.replace(",", "."));
  if (m[2]) n *= /mln|milion|million/.test(m[2]) ? 1e6 : 1000;
  n = Math.round(n);
  return n > 0 ? { value: n } : null;
}
function floorOf(v) {
  const f = fold(v);
  const m = f.match(/(-?\d+)(?:\s*(?:\/|nga|prej|of)\s*(\d+))?/);
  if (/perdhe|perdhes|zero|^0\b/.test(f) && !(m && Number(m[1]) > 0)) return { floor: 0, total: m && m[2] ? Number(m[2]) : undefined };
  if (/bodrum|nentoke|gjysem ?bodrum/.test(f) && !(m && Number(m[1]) > 0)) return { floor: -1 };
  if (!m) return null;
  return { floor: Number(m[1]), total: m[2] ? Number(m[2]) : undefined };
}
function dateOf(v) {
  const s = String(v);
  let m = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = s.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return "";
}
// Specs written as a free line: "2+1 · 95 m² · kati 4/10 · 2 banjo".
function specsFrom(line, out) {
  const f = fold(line);
  const rooms = f.match(/\b(\d{1,2})\s*\+\s*(\d)\b/);
  if (rooms && out.beds === undefined) out.beds = Number(rooms[1]);
  const beds = f.match(/(\d{1,2})\s*dhoma gjumi/);
  if (beds && out.beds === undefined) out.beds = Number(beds[1]);
  const areaRe = /(\d+(?:[.,]\d+)?)\s*(?:m2|m²|m\^2|mq|metra katror\w*)(?![\p{L}\d])/gu;
  for (const m of f.matchAll(areaRe)) {
    const around = f.slice(Math.max(0, m.index - 12), m.index + m[0].length + 8);
    const n = Math.round(Number(m[1].replace(",", ".")));
    if (/neto/.test(around)) { if (out.area_net === undefined) out.area_net = n; }
    else if (/truall|oborr|toke/.test(around)) { if (out.plot_area === undefined) out.plot_area = n; }
    else if (out.area === undefined) out.area = n;
  }
  const fl = f.match(/\bkati\s*(?:i\s*)?(-?\d+|perdhes\w*)(?:\s*(?:\/|nga|prej)\s*(\d+))?/);
  if (fl && out.floor === undefined) {
    const r = floorOf(fl[0].replace(/^kati\s*(i\s*)?/, ""));
    if (r) { out.floor = r.floor; if (r.total) out.floors_total = r.total; }
  }
  const baths = f.match(/(\d)\s*(?:banjo|tualete|wc)\b/);
  if (baths && out.baths === undefined) out.baths = Number(baths[1]);
}
const isSpecLine = (s) => {
  const f = fold(s);
  return f.length < 90 && /^(\d|kati\b)/.test(f) && /\d\s*\+\s*\d|m2|m²|mq\b|\bkati\b|banjo|dhoma gjumi/.test(f);
};
// "💶 145.000 €" written without "Çmimi:".
const isPriceLine = (s) => { const f = fold(s); return f.length < 40 && /\d/.test(f) && /(€|\beur\b|\beuro\b|\blek)/.test(f); };
// "📍 Blloku, Tiranë": a location line.
const PIN = /^\s*(?:\u{1F4CD}|\u{1F4CC}|\u{1F5FA})/u;
// A first line such as "Shitet apartament 2+1" or "Jepet me qira vilë" also says the deal.
function titleDeal(s) {
  const f = fold(s);
  if (/\b(shitje|shitet)\b/.test(f) && /\b(qira|qera)\b/.test(f)) return ""; // "Shitje / Qira": unclear
  if (/^(shitet|shes|ne shitje|per shitje|shitje)\b/.test(f)) return "sale";
  if (/^(jepet me qira|jepet me qera|jap me qira|me qira|per qira|qira)\b/.test(f)) return "rent";
  return "";
}

function parseCaption(caption, ctx) {
  const notes = [];
  const r = { notes };
  const free = []; // [{ text, blank, desc }]
  const raw = {};
  const specLines = [], locLines = [];
  let descMode = false, dealLine = "", priceLine = "";
  const tags = new Set();
  for (const rawLine of String(caption || "").replace(/\r/g, "").split("\n")) {
    const bare = stripEmoji(rawLine);
    if (bare && isHashtagLine(bare)) {
      for (const tag of bare.match(/#[\p{L}\p{N}_]+/gu) || []) {
        const t = fold(tag.slice(1));
        if (DEAL_TAGS.sale.includes(t)) tags.add("sale");
        if (DEAL_TAGS.rent.includes(t)) tags.add("rent");
      }
      continue;
    }
    const line = stripLead(rawLine);
    if (!line) { free.push({ blank: true }); continue; }
    const kv = line.match(/^([^:：]{1,32})[:：]\s*(.*)$/);
    const key = kv ? (KEYS.find(([, re]) => re.test(fold(kv[1]).replace(/[^a-z0-9 ²]/g, "").trim())) || [])[0] : undefined;
    if (key === "desc") { descMode = true; if (kv[2].trim()) free.push({ text: kv[2].trim(), desc: true }); continue; }
    if (key && !descMode) { if (raw[key] === undefined) raw[key] = kv[2].trim(); continue; }
    const f = fold(line).replace(/[^a-z ]/g, "").trim();
    if (!descMode && DEAL_LINES.sale.includes(f)) { dealLine = dealLine || "sale"; continue; }
    if (!descMode && DEAL_LINES.rent.includes(f)) { dealLine = dealLine || "rent"; continue; }
    if (!descMode && isSpecLine(line)) { specLines.push(line); if (/€|\beur/i.test(line)) priceLine = priceLine || line; continue; }
    if (!descMode && PIN.test(rawLine)) { locLines.push(line); continue; }
    if (!descMode && !priceLine && isPriceLine(line)) { priceLine = line; continue; }
    free.push({ text: line, desc: descMode });
  }

  // Title: "Titulli:" or the first free line (unless it is a whole paragraph); the rest is the description.
  let firstFree = free.findIndex((x) => x.text && !x.desc);
  if (firstFree >= 0 && free[firstFree].text.length > 90) firstFree = -1;
  const titleLine = raw.title || (firstFree >= 0 ? free[firstFree].text : "");
  const descLines = free.filter((x, i) => raw.title || i !== firstFree);
  const fromTitle = titleDeal(titleLine);
  const dealTag = tags.size === 1 ? [...tags][0] : ""; // "#shitje #qira" says nothing
  // "E SHITUR!" / "U dha me qira": news about a property, not a new one (an edited caption marks the property sold).
  const done = fold(titleLine).match(/\b(e shitur|u shit\w*|shitur|sold|u dha me qira|e dhene me qira|rented)\b/);
  if (done) { r.isProperty = false; r.closed = /qira|rented/.test(done[0]) ? "rented" : "sold"; return r; }
  r.isProperty = Boolean(dealLine || raw.deal || raw.code || (raw.zone && raw.price)
    || ((fromTitle || dealTag) && (raw.zone || raw.price || locLines.length || priceLine || specLines.length)));
  if (!r.isProperty) return r;

  const out = {};
  out.deal = dealOf(raw.deal || "") || dealLine || fromTitle || dealTag || "";
  if (raw.code !== undefined) { const c = int(raw.code); if (Number.isInteger(c) && c > 0 && c < 1e6) out.code = c; else notes.push(`„Kodi: ${raw.code}” nuk është numër i vlefshëm`); }
  out.type = typeOf(raw.type || "") || typeOf(titleLine) || "";
  if (raw.type && !typeOf(raw.type)) notes.push(`lloji „${raw.type}” nuk njihet`);
  if (raw.zone !== undefined) {
    const z = ctx.zoneOf(raw.zone);
    if (z) out.zone = z; else notes.push(`zona „${raw.zone}” nuk është në listën e zonave`);
  } else if (locLines.length) {
    const z = locLines.map(ctx.zoneOf).find(Boolean);
    if (z) out.zone = z; else notes.push(`zona „${locLines[0]}” nuk është në listën e zonave`);
  } else {
    const z = ctx.zoneIn(titleLine);
    if (z) out.zone = z;
  }
  if (raw.price !== undefined) {
    const p = priceOf(raw.price);
    if (p && p.value) out.price = p.value;
    else if (!p || p.bad) { notes.push(`çmimi „${raw.price}” ${p ? p.bad : "nuk u kuptua"}, ndaj nuk u vendos`); out.priceUnclear = true; }
  } else if (priceLine) {
    const p = priceOf(priceLine);
    if (p && p.value) out.price = p.value; else if (p && p.bad) { notes.push(`çmimi „${priceLine}” ${p.bad}, ndaj nuk u vendos`); out.priceUnclear = true; }
  }
  if (raw.rooms !== undefined) {
    const m = fold(raw.rooms).match(/(\d{1,2})\s*\+\s*\d|(\d{1,2})/);
    if (m) out.beds = Number(m[1] || m[2]); else if (/garsonier|studio/.test(fold(raw.rooms))) out.beds = 0;
  }
  for (const k of ["area", "area_net", "plot_area"]) if (raw[k] !== undefined) { const n = num(raw[k]); if (n > 0) out[k] = Math.round(n); }
  if (raw.floor !== undefined) { const fl = floorOf(raw.floor); if (fl) { out.floor = fl.floor; if (fl.total) out.floors_total = fl.total; } }
  if (raw.baths !== undefined) { const n = int(raw.baths); if (n >= 0) out.baths = n; }
  for (const s of specLines) specsFrom(s, out);
  specsFrom(titleLine, out);
  if (out.beds === undefined && out.type === "apartment" && /garsonier|studio/.test(fold(titleLine))) out.beds = 0;
  if (raw.features !== undefined) { const fs_ = featuresOf(raw.features, notes); if (fs_.length) out.features = fs_; }
  if (raw.deed !== undefined) {
    const f = fold(raw.deed);
    out.deed = /proces/.test(f) ? "process" : /\b(pa|jo|nuk)\b/.test(f) ? "no" : /\b(po|me|ka|e plote|rregull)\b/.test(f) ? "yes" : undefined;
  }
  if (raw.condition !== undefined) {
    const f = fold(raw.condition);
    out.condition = /per (t.?u )?rikonstrukt|per renovim|kerkon rikonstrukt/.test(f) ? "torenovate"
      : /rikonstruktuar|renovuar|rinovuar/.test(f) ? "renovated" : /\b(e re|i ri|i re|ndertim i ri|sapo ndertuar|new)\b/.test(f) ? "new"
      : /mire|good/.test(f) ? "good" : undefined;
  }
  if (raw.year !== undefined) { const m = String(raw.year).match(/\b(19|20)\d{2}\b/); if (m) out.year_built = Number(m[0]); }
  if (raw.sea !== undefined && !/min|ore|\bh\b/.test(fold(raw.sea))) { const n = num(raw.sea); if (n >= 0) out.sea_m = Math.round(/km/.test(fold(raw.sea)) ? n * 1000 : n); }
  if (raw.orientation !== undefined) {
    const f = fold(raw.orientation);
    const o = [["north", /veri/], ["south", /jug/], ["east", /lindj/], ["west", /perendim/]].filter(([, re]) => re.test(f)).map(([k]) => k);
    if (o.length) out.orientation = o;
  }
  if (raw.deposit !== undefined) { const n = int(raw.deposit); if (n >= 0) out.deposit_months = n; }
  if (raw.term !== undefined) { const n = int(raw.term); if (n > 0) out.min_term_months = /vit/.test(fold(raw.term)) ? n * 12 : n; }
  if (raw.available !== undefined) { const d = dateOf(raw.available); if (d) out.available_from = d; }
  if (raw.status !== undefined) {
    const f = fold(raw.status);
    out.status = /rezerv/.test(f) ? "reserved" : /shitur|sold/.test(f) ? "sold" : /dhene|rented|zene/.test(f) ? "rented" : /lire|available|disponuesh/.test(f) ? "available" : undefined;
    if (!out.status) notes.push(`statusi „${raw.status}” nuk njihet`);
  }
  if (raw.agent !== undefined) { const a = ctx.agentOf(raw.agent); if (a) out.agent = a; else notes.push(`agjenti „${raw.agent}” nuk është te ekipi`); }
  if (raw.video !== undefined && /^https:\/\/\S+$/.test(raw.video.trim())) out.video = raw.video.trim();

  // Clean title and description: no emojis, hashtags or phone numbers; all-caps lines become sentence case.
  const tidy = (t) => { const c = sentenceCase(t); return c === t ? t : ctx.fixNames(c); };
  out.title = cut(tidy(cleanHashtags(stripEmoji(titleLine)).replace(/[\s,.;:–-]+$/, "")), 100);
  const desc = [];
  for (const x of descLines) {
    if (x.blank) { if (desc.length && desc[desc.length - 1] !== "") desc.push(""); continue; }
    if (PHONE.test(x.text) || (/(^|\s)@[\p{L}\p{N}_.]{2,}/u.test(x.text) && x.text.length < 80)) continue; // contact lines
    const t = cleanHashtags(stripEmoji(x.text));
    if (t) desc.push(tidy(t));
  }
  while (desc.length && desc[desc.length - 1] === "") desc.pop();
  out.desc = desc.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  r.fields = out;
  return r;
}

/* ------------------------ generated text (sq, en) ------------------------ */
const TYPE_SQ = { apartment: "Apartament", villa: "Vilë", office: "Ambient biznesi", land: "Truall" };
const TYPE_EN = { apartment: "apartment", villa: "villa", office: "commercial space", land: "building plot" };
const FEAT_EN = { parking: "parking", garage: "garage", elevator: "lift", furnished: "furnished", seaview: "sea view", balcony: "balcony",
  terrace: "terrace", pool: "pool", garden: "garden", heating: "central heating", ac: "air conditioning", security: "24/7 security", storage: "storage room" };
const COND_EN = { new: "new build", renovated: "renovated", good: "in good condition", torenovate: "to renovate" };
function genTitleSq(l, z) {
  const rooms = l.type === "apartment" && l.beds > 0 ? ` ${l.beds}+1` : "";
  return `${TYPE_SQ[l.type] || "Pronë"}${rooms} ${l.deal === "rent" ? "me qira " : ""}${z ? z.in_sq || "në " + z.sq : ""}`.replace(/\s+/g, " ").trim();
}
function genDescSq(l, z) {
  const bits = [];
  if (l.area) bits.push(`${l.area} m²`);
  if (l.beds) bits.push(l.beds === 1 ? "1 dhomë gjumi" : `${l.beds} dhoma gjumi`);
  if (l.baths) bits.push(`${l.baths} banjo`);
  if (l.floor !== undefined && l.type !== "land") bits.push(l.floor === 0 ? "kati përdhes" : l.floor < 0 ? "bodrum" : `kati ${l.floor}${l.floors_total ? " nga " + l.floors_total : ""}`);
  return `${TYPE_SQ[l.type] || "Pronë"} ${l.deal === "rent" ? "me qira" : "në shitje"}${z ? " " + (z.in_sq || "në " + z.sq) : ""}${bits.length ? ": " + bits.join(", ") : ""}.`;
}
function genTitleEn(l, z) {
  const kind = l.type === "apartment" && l.beds === 0 ? "studio apartment" : `${l.beds > 0 && l.type !== "land" && l.type !== "office" ? l.beds + "-bed " : ""}${TYPE_EN[l.type] || "property"}`;
  const t = `${kind} ${l.deal === "rent" ? "for rent" : "for sale"}${z ? " in " + z.en : ""}`;
  return t.charAt(0).toUpperCase() + t.slice(1);
}
function genDescEn(l, z) {
  const kind = TYPE_EN[l.type] || "property";
  const where = z ? ` in ${z.en}${z.group && z.group.city ? ", " + z.group.en : z.region && z.region !== z.sq ? ", " + z.region : ""}` : "";
  const s = [`${kind.charAt(0).toUpperCase() + kind.slice(1)} ${l.deal === "rent" ? "for rent" : "for sale"}${where}.`];
  const bits = [];
  if (l.area) bits.push(`${l.area} m²`);
  if (l.beds) bits.push(`${l.beds} ${l.beds === 1 ? "bedroom" : "bedrooms"}`);
  if (l.baths) bits.push(`${l.baths} ${l.baths === 1 ? "bathroom" : "bathrooms"}`);
  if (l.floor !== undefined && l.type !== "land") bits.push(l.floor === 0 ? "ground floor" : l.floor < 0 ? "basement" : `floor ${l.floor}${l.floors_total ? " of " + l.floors_total : ""}`);
  if (l.condition) bits.push(COND_EN[l.condition]);
  if (bits.length) s.push(bits.join(", ").replace(/^./, (c) => c.toUpperCase()) + ".");
  if (l.features && l.features.length) s.push(`Features: ${l.features.map((f) => FEAT_EN[f]).join(", ")}.`);
  s.push("Message us on WhatsApp for details or to book a viewing.");
  return s.join(" ");
}

/* ------------------------------ Instagram ------------------------------ */
function explain(err, status) {
  if (err.code === 190) return "Çelësi i Instagram-it (IG_ACCESS_TOKEN) ka skaduar ose nuk vlen më. Krijo një të ri dhe vendose te GitHub → Settings → Secrets (README → Instagram).";
  if (err.code === 100 && /caption/i.test(err.message || "")) return "Instagram nuk e jep përshkrimin e postimit me këtë lidhje. Përdor lidhjen me Facebook (IG_GRAPH_HOST=graph.facebook.com, README → Instagram).";
  if (err.code === 4 || err.code === 17 || err.code === 32 || err.code === 613) return "Instagram kufizoi përkohësisht kërkesat; provohet sërish në orën tjetër.";
  return `Instagram ktheu gabim${err.code ? " " + err.code : ""}${status ? " (HTTP " + status + ")" : ""}: ${err.message || "pa përshkrim"}`;
}
// The token travels in the URL, so errors never print the URL.
async function getJSON(url) {
  for (let attempt = 1; ; attempt++) {
    let res, body;
    try {
      res = await fetch(url, { signal: AbortSignal.timeout(30000) });
      body = await res.json().catch(() => ({}));
    } catch (e) {
      if (attempt < 3) { await sleep(3000 * attempt); continue; }
      throw new Error(scrub(`Instagram nuk u arrit (${e.name === "TimeoutError" ? "nuk u përgjigj" : e.message}).`));
    }
    if (res.ok && !body.error) return body;
    const err = body.error || {};
    if ((res.status >= 500 || err.is_transient) && attempt < 3) { await sleep(3000 * attempt); continue; }
    const e = new Error(scrub(explain(err, res.status)));
    Object.assign(e, { code: err.code, subcode: err.error_subcode, status: res.status, raw: err.message || "" });
    throw e;
  }
}
function apiURL(p, params) {
  const u = new URL(`${API}/${p}`);
  for (const [k, v] of Object.entries(params || {})) u.searchParams.set(k, v);
  u.searchParams.set("access_token", TOKEN);
  return u.toString();
}
const tsOf = (t) => new Date(String(t).replace(/([+-]\d{2})(\d{2})$/, "$1:$2"));
const FIELDS = "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp";

// Posts newer than `since`, newest first. complete = false when the list was cut short.
async function listPosts(since) {
  if (FIXTURE) return { posts: (FIXTURE.media || []).filter((p) => tsOf(p.timestamp) >= since), complete: true };
  const posts = [];
  let url = apiURL(`${USER}/media`, { fields: FIELDS, limit: "50" });
  let older = 0, complete = false;
  for (let page = 0; page < 40 && url && !complete; page++) {
    const body = await getJSON(url);
    for (const p of body.data || []) {
      // Up to three pinned posts can sit on top of the newest ones, so the list ends after four older posts in a row.
      if (tsOf(p.timestamp) < since) { if (++older > 3) { complete = true; break; } continue; }
      older = 0;
      posts.push(p);
    }
    url = body.paging && body.paging.next;
  }
  if (posts.length >= 3 && posts.every((p) => !p.caption)) {
    throw new Error("Instagram nuk ktheu asnjë përshkrim postimi. Përdor lidhjen me Facebook (IG_GRAPH_HOST=graph.facebook.com, README → Instagram).");
  }
  return { posts, complete: complete || !url };
}
async function childrenOf(post) {
  if (FIXTURE) return post.children || [];
  const body = await getJSON(apiURL(`${post.id}/children`, { fields: "id,media_type,media_url,thumbnail_url" }));
  return body.data || [];
}
// true / false, or null when Instagram could not say (then nothing is hidden).
async function postExists(id) {
  if (FIXTURE) return !FIXTURE.brokenLookup && !(FIXTURE.deleted || []).includes(id);
  try { await getJSON(apiURL(id, { fields: "id" })); return true; }
  catch (e) { return e.code === 100 && (e.subcode === 33 || /does not exist/i.test(e.raw || "")) ? false : null; }
}
async function download(url) {
  if (FIXTURE) return fs.readFileSync(path.resolve(path.dirname(FIXTURE_FILE), url));
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(60000) });
      if (!res.ok) throw new Error("HTTP " + res.status);
      return Buffer.from(await res.arrayBuffer());
    } catch (e) {
      if (attempt < 3) { await sleep(3000 * attempt); continue; }
      throw new Error(scrub(`foto nuk u shkarkua (${e.message})`));
    }
  }
}

/* ------------------------------- photos ------------------------------- */
function imageExt(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg";
  if (buf.length > 8 && buf.readUInt32BE(0) === 0x89504e47) return "png";
  if (buf.length > 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "webp";
  return "";
}
// Drops EXIF/XMP (APP1), IPTC (APP13) and comments from a JPEG, so no location or camera data is published.
function stripJpeg(buf) {
  const out = [buf.subarray(0, 2)];
  let i = 2;
  while (i + 1 < buf.length && buf[i] === 0xff) {
    const marker = buf[i + 1];
    if (marker === 0xff) { i++; continue; }
    if (marker === 0xda) break; // start of scan: image data follows
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) { out.push(buf.subarray(i, i + 2)); i += 2; continue; }
    if (i + 4 > buf.length) return buf;
    const len = buf.readUInt16BE(i + 2);
    if (len < 2 || i + 2 + len > buf.length) return buf; // unusual layout: keep the file as Instagram sent it
    if (!(marker === 0xe1 || marker === 0xed || marker === 0xfe)) out.push(buf.subarray(i, i + 2 + len));
    i += 2 + len;
  }
  if (i >= buf.length || buf[i] !== 0xff) return buf;
  out.push(buf.subarray(i));
  return Buffer.concat(out);
}
// Downloads the post's photos (carousel items, or a video's cover) once; file names come from Instagram ids, so they never change.
// A photo that fails makes the whole post wait for the next run; from the third try on it is skipped instead (lenient).
async function savePhotos(post, notes, lenient) {
  let items;
  if (post.media_type === "CAROUSEL_ALBUM") items = await childrenOf(post);
  else items = [post];
  const images = [];
  for (const it of items.slice(0, MAX_PHOTOS)) {
    const id = String(it.id || "").replace(/[^0-9A-Za-z_]/g, ""); // becomes part of a file name
    const url = it.media_type === "VIDEO" ? it.thumbnail_url : it.media_url;
    if (!url) { notes.push(it.media_type === "VIDEO" ? "një video pa kopertinë u anashkalua" : "një foto pa link u anashkalua"); continue; }
    if (!id) continue;
    const known = ["jpg", "png", "webp"].map((e) => `${UPLOAD_DIR}/ig-${id}.${e}`).find(exists);
    if (known) { images.push(known.replace(UPLOAD_DIR, PUBLIC_DIR)); continue; }
    let buf;
    try { buf = await download(url); }
    catch (e) { if (!lenient) throw e; notes.push(`një ${e.message} dhe u anashkalua`); continue; }
    const ext = imageExt(buf);
    if (!ext) { notes.push("një foto në format të panjohur u anashkalua"); continue; }
    if (buf.length > 15e6) { notes.push("një foto mbi 15 MB u anashkalua"); continue; }
    write(`${UPLOAD_DIR}/ig-${id}.${ext}`, ext === "jpg" ? stripJpeg(buf) : buf);
    images.push(`${PUBLIC_DIR}/ig-${id}.${ext}`);
  }
  if (items.length > MAX_PHOTOS) notes.push(`u morën vetëm ${MAX_PHOTOS} fotot e para`);
  return images;
}

/* ------------------------------ listings ------------------------------ */
function context() {
  const zones = readJSON("data/zones.json");
  // Zone names only (never the ids, which are short words like "liqeni"), plus the common forms of one-word names
  // ("Astiri", "Golemit", "Vlora", "Sarandës").
  const zoneIdx = new Map(), areas = {};
  const noPrep = (s) => s.replace(/^(në|ne|te|tek)\s+/i, "");
  for (const g of zones.groups || []) for (const a of g.areas || []) {
    areas[a.id] = { ...a, group: g };
    const forms = [a.sq, a.en, a.in_sq && noPrep(a.in_sq)].filter(Boolean);
    if (a.id !== "qender" && !/\s/.test(a.sq)) {
      if (/[ë]$/.test(a.sq)) forms.push(a.sq.slice(0, -1) + "a", a.sq.slice(0, -1) + "ës");
      else if (/[^aeiouyë]$/i.test(a.sq)) forms.push(a.sq + "i", a.sq + "it");
    }
    for (const n of forms) zoneIdx.set(fold(n).replace(/[^a-z0-9 ]/g, "").trim(), a.id);
  }
  // The city or region that may stand next to a zone ("Blloku, Tiranë", "Golem, Durrës").
  const homeOf = (id) => new Set([areas[id].group.sq, areas[id].group.en, areas[id].group.in_sq && noPrep(areas[id].group.in_sq), areas[id].region,
    ...(areas[id].group.city ? ["Tirana", "Tiranës", "Tiranën"] : []), "Shqipëri", "Shqipëria", "Albania"].filter(Boolean).map((n) => fold(n)));
  // One zone, or none when two are named; "Golem, Durrës" is Golem, because Durrës is Golem's region.
  const pick = (ids) => {
    let list = [...new Set(ids)];
    list = list.filter((x) => !list.some((y) => y !== x && fold(areas[y].region || "") === fold(areas[x].sq)));
    return list.length === 1 ? list[0] : "";
  };
  // A zone named anywhere in a text ("Shitet apartament në Bllok"). "Qendër" is too common a word to count here.
  const zoneIn = (v) => {
    const f = " " + fold(stripEmoji(v)).replace(/[^a-z0-9]+/g, " ") + " ";
    return pick([...zoneIdx].filter(([n, id]) => id !== "qender" && n.length >= 4 && f.includes(` ${n} `)).map(([, id]) => id));
  };
  const zoneOf = (v) => {
    const f = fold(stripEmoji(v)).replace(/^(zona|lagjja|lagja|tek|te|ne)\s+/, "");
    const whole = zoneIdx.get(f.replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim());
    if (whole) return whole;
    const parts = f.split(/\s*[,\-–\/|()]\s*/).map((x) => x.replace(/[^a-z0-9 ]/g, "").trim()).filter(Boolean);
    const ids = parts.map((x) => zoneIdx.get(x)).filter(Boolean);
    const id = ids.length ? pick(ids) : zoneIn(v);
    // "Qendër, Vlorë" or "Qendër, Shkodër" is not Tirana's centre.
    if (id === "qender" && parts.some((x) => !zoneIdx.has(x) && !homeOf(id).has(x))) return "";
    return id;
  };
  // Place names written back with capitals after an all-caps line was lowercased ("në bllok" → "në Bllok").
  const names = new Set(["Tiranë", "Tirana", "Tiranës", "Tiranën", "Shqipëri", "Shqipëria", "Shqipërisë"]);
  for (const g of zones.groups || []) {
    for (const n of [g.sq, g.in_sq && g.in_sq.replace(/^(në|te|tek)\s+/i, "")]) if (n) names.add(n);
    for (const a of g.areas || []) for (const n of [a.sq, a.in_sq && a.in_sq.replace(/^(në|te|tek)\s+/i, ""), a.region]) if (n) names.add(n);
  }
  names.delete("Qendër"); // also a common word ("në qendër të qytetit")
  const nameRes = [...names].sort((a, b) => b.length - a.length)
    .map((n) => [new RegExp(`(?<![\\p{L}\\p{N}])${n.toLocaleLowerCase("sq").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}])`, "gu"), n]);
  const fixNames = (s) => nameRes.reduce((t, [re, n]) => t.replace(re, n), s);
  const team = exists("data/about.json") ? readJSON("data/about.json").team || [] : [];
  const agentOf = (v) => {
    const f = fold(v);
    const hits = team.filter((m) => m.key && (fold(m.key) === f || fold(m.name) === f));
    return hits.length === 1 ? hits[0].key : "";
  };
  return { areas, zoneOf, zoneIn, agentOf, fixNames };
}
const tiranaDate = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Tirane", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

// The listing file for a parsed post. Missing deal, type, zone or photos keep it hidden for the panel.
function makeListing({ code, post, parsed, images, added, ctx }) {
  const f = parsed.fields;
  const z = f.zone ? ctx.areas[f.zone] : null;
  const l = { id: code, added, deal: f.deal || undefined, type: f.type || undefined, zone: f.zone || undefined, status: f.status || "available" };
  for (const k of ["agent", "price", "area", "area_net", "plot_area", "beds", "baths", "floor", "floors_total", "orientation", "sea_m"]) if (f[k] !== undefined) l[k] = f[k];
  if (f.deal === "rent") for (const k of ["deposit_months", "min_term_months"]) if (f[k] !== undefined) l[k] = f[k];
  if (f.available_from) l.available_from = f.available_from;
  const facts = { ...f, beds: f.beds, deal: f.deal, type: f.type };
  l.title_sq = f.title && f.title.length >= 3 ? f.title : cut(genTitleSq(facts, z), 100);
  l.title_en = cut(genTitleEn(facts, z), 100);
  l.desc_sq = f.desc || genDescSq(facts, z);
  l.desc_en = genDescEn(facts, z);
  l.images = images.map((image) => ({ image, alt: "" }));
  for (const k of ["deed", "condition", "year_built", "features"]) if (f[k] !== undefined) l[k] = f[k];
  if (f.video) l.video = f.video;
  else if (post.media_type === "VIDEO" && post.permalink) l.video = post.permalink;
  const missing = [];
  if (!f.deal) missing.push("shitje apo qira (shkruaj rreshtin „Shitje” ose „Qira”)");
  if (!f.type) missing.push("lloji i pronës");
  if (!f.zone) missing.push("zona nga lista");
  if (!images.length) missing.push("fotot");
  if (f.priceUnclear) missing.push("çmimi në euro");
  const notes = [...parsed.notes];
  l.note = [`Nga Instagram: ${post.permalink || post.id}.`, missing.length ? `PËR T'U PLOTËSUAR: mungon ${missing.join(", ")}.` : "", notes.length ? `Shënime: ${notes.join("; ")}.` : ""]
    .filter(Boolean).join(" ");
  if (missing.length) l.hidden = true;
  for (const k of Object.keys(l)) if (l[k] === undefined) delete l[k];
  return { listing: l, missing, notes };
}

/* -------------------------------- run -------------------------------- */
function loadState() {
  const s = exists(STATE_FILE) ? readJSON(STATE_FILE) : {};
  return { note: "Lidhja me Instagram-in (scripts/instagram-import.js): cili postim u bë cila pronë. Mos e ndrysho me dorë.", account: s.account || "", since: s.since || "", month: s.month || "", posts: s.posts || {} };
}
function output(vars) {
  if (!env.GITHUB_OUTPUT) return;
  fs.appendFileSync(env.GITHUB_OUTPUT, Object.entries(vars).map(([k, v]) => `${k}=${v}\n`).join(""));
}

async function run() {
  if (!TOKEN && !FIXTURE) {
    log("Instagram nuk është lidhur ende (mungon IG_ACCESS_TOKEN). Asgjë për të bërë.");
    output({ changed: "false", deploy: "false", failed: "false" });
    return;
  }
  if (!USER) throw new Error("Mungon IG_USER_ID (duhet kur përdoret graph.facebook.com).");
  const ctx = context();
  const state = loadState();
  const before = toJSON(state);
  const sinceArg = env.IG_SINCE ? new Date(env.IG_SINCE) : null;
  if (sinceArg && isNaN(sinceArg)) throw new Error(`IG_SINCE „${env.IG_SINCE}” nuk është datë (VVVV-MM-DD).`);
  if (!state.since) state.since = (sinceArg || NOW).toISOString();
  else if (sinceArg && sinceArg < new Date(state.since)) state.since = sinceArg.toISOString();
  state.month = NOW.toISOString().slice(0, 7); // a commit at least once a month keeps GitHub's hourly schedule switched on

  const windowStart = new Date(NOW - WINDOW_DAYS * 864e5);
  const from = sinceArg && sinceArg < windowStart ? sinceArg : new Date(Math.max(new Date(state.since), windowStart));
  for (const [id, p] of Object.entries(state.posts)) if (!p.code && p.posted && new Date(p.posted) < from) delete state.posts[id];
  // The key must belong to the account connected first; otherwise every property would look deleted.
  const account = FIXTURE ? FIXTURE.username || "test" : String((await getJSON(apiURL(USER, { fields: "username" }))).username || "");
  if (state.account && account && state.account !== account) {
    throw new Error(`Çelësi i Instagram-it është për @${account}, jo për @${state.account} që ishte lidhur. Nëse kjo është me qëllim (llogaria ndryshoi emër), fshi rreshtin "account" te data/instagram.json.`);
  }
  if (account) state.account = account;
  const { posts, complete } = await listPosts(from);
  const { codes, bad } = readCodes();
  if (bad.length) throw new Error(`Pronat në data/listings kanë probleme, ndaj Instagram-i pret: ${bad.join("; ")}.`);
  const usedCodes = new Set([...codes.keys(), ...Object.values(state.posts).map((p) => p.code).filter(Boolean)]);
  const nextCode = () => { const c = Math.max(FIRST_CODE - 1, ...[...usedCodes].filter((x) => x >= FIRST_CODE)) + 1; usedCodes.add(c); return c; };
  const report = [];
  const failed = [];
  const changedCodes = [];

  for (const post of [...posts].sort((a, b) => tsOf(a.timestamp) - tsOf(b.timestamp))) {
    const prev = state.posts[post.id];
    const capHash = hash(post.caption || "");
    const link = post.permalink || "";
    const posted = tsOf(post.timestamp).toISOString();
    if (prev && prev.caption === capHash && prev.result !== "retry") continue;
    const priorTries = prev && prev.result === "retry" ? prev.tries || 0 : 0; // an edited caption starts the tries again
    try {
      // Edited caption of a post that is already a property.
      if (prev && prev.code && ["published", "draft"].includes(prev.result)) {
        const file = listingFile(prev.code);
        if (!exists(file)) { Object.assign(prev, { caption: capHash, result: "removed", note: "prona u fshi nga paneli" }); continue; }
        if (hash(readText(file)) !== prev.file) { Object.assign(prev, { caption: capHash, result: "panel", note: "u ndryshua në panel; Instagram-i nuk e prek më" }); continue; }
        const parsed = parseCaption(post.caption, ctx);
        const old = readJSON(file);
        if (!parsed.isProperty && parsed.closed) { // caption changed to "E SHITUR" / "U dha me qira"
          const text = toJSON({ ...old, status: parsed.closed, updated: tiranaDate(NOW) });
          write(file, text);
          Object.assign(prev, { caption: capHash, file: hash(text), note: `statusi u bë ${parsed.closed} nga Instagram-i` });
          changedCodes.push(`${prev.code} (${parsed.closed === "sold" ? "e shitur" : "e dhënë me qira"})`);
          report.push(`Statusi ${prev.code}: ${parsed.closed === "sold" ? "e shitur" : "e dhënë me qira"}`);
          continue;
        }
        if (!parsed.isProperty) { Object.assign(prev, { caption: capHash, note: "përshkrimi i ri nuk duket si pronë; prona mbeti siç ishte" }); continue; }
        const images = (old.images || []).map((x) => x.image).filter(Boolean);
        const { listing, missing } = makeListing({ code: prev.code, post, parsed, images, added: old.added, ctx });
        if (tiranaDate(NOW) !== old.added) listing.updated = tiranaDate(NOW);
        if (parsed.fields.code && parsed.fields.code !== prev.code) listing.note += ` Kodi mbetet ${prev.code}; kodi nuk ndryshohet pas publikimit.`;
        const text = toJSON(listing);
        write(file, text);
        Object.assign(prev, { caption: capHash, file: hash(text), result: missing.length ? "draft" : "published", note: missing.length ? `mungon ${missing.join(", ")}` : "" });
        changedCodes.push(`${prev.code} (përditësuar)`);
        report.push(`Përditësuar ${prev.code}: ${listing.title_sq}${missing.length ? " – e fshehur, mungon " + missing.join(", ") : ""}`);
        continue;
      }
      if (prev && ["panel", "removed", "deleted"].includes(prev.result)) { prev.caption = capHash; continue; }

      // New post (or one that was not a property before, or failed last time).
      const parsed = parseCaption(post.caption, ctx);
      if (!parsed.isProperty) {
        state.posts[post.id] = { result: "ignored", caption: capHash, link, posted };
        report.push(`Anashkaluar (${parsed.closed ? "njoftim për pronë të shitur / dhënë me qira" : "nuk është postim prone"}): ${link}`);
        continue;
      }
      const notes = parsed.notes;
      let code = parsed.fields.code;
      const repost = code && usedCodes.has(code) ? code : 0;
      if (repost) { notes.push(`kodi ${repost} është i një prone që ekziston, ndaj ky postim u ruajt i fshehur që prona të mos dalë dy herë (nëse është pronë tjetër, hiq „Fshih”)`); code = 0; }
      const images = await savePhotos(post, notes, priorTries >= 2);
      code = code || nextCode(); // only once the photos are in, so a failed post leaves no gap in the codes
      usedCodes.add(code);
      const { listing, missing } = makeListing({ code, post, parsed, images, added: tiranaDate(tsOf(post.timestamp)), ctx });
      if (repost) listing.hidden = true;
      const hidden = Boolean(listing.hidden);
      if (exists(listingFile(code))) throw new Error(`skedari ${listingFile(code)} ekziston tashmë`);
      const text = toJSON(listing);
      write(listingFile(code), text);
      state.posts[post.id] = { code, result: hidden ? "draft" : "published", caption: capHash, file: hash(text), link, posted, note: missing.length ? `mungon ${missing.join(", ")}` : repost ? `ripostim i ${repost}?` : "" };
      changedCodes.push(`${code}${hidden ? " (e fshehur)" : " (e re)"}`);
      report.push(`${hidden ? "E fshehur, për t'u plotësuar në panel" : "Online"} ${code}: ${listing.title_sq}${missing.length ? " – mungon " + missing.join(", ") : ""}${notes.length ? " – " + notes.join("; ") : ""}`);
    } catch (e) {
      const msg = scrub(e.message);
      const tries = priorTries + 1;
      if (prev && prev.code && ["published", "draft"].includes(prev.result)) { report.push(`Gabim te ${link}: ${msg}`); continue; }
      state.posts[post.id] = { result: tries >= MAX_TRIES ? "error" : "retry", tries, link, posted, caption: tries >= MAX_TRIES ? capHash : "", note: msg };
      report.push(`Gabim te ${link} (prova ${tries}${tries >= MAX_TRIES ? ", e fundit: ndrysho përshkrimin e postimit për ta provuar sërish" : ""}): ${msg}`);
      if (tries >= MAX_TRIES) failed.push(`Postimi ${link} nuk u kthye dot në pronë: ${msg}`);
    }
  }

  // Posts deleted on Instagram: their properties are hidden, unless they were changed in the panel.
  // Many at once could be a key without the right permissions: then a post that is surely there is looked up the same way,
  // and if that one also looks deleted, nothing is hidden.
  if (complete) {
    const seen = new Set(posts.map((p) => p.id));
    const gone = [];
    for (const [id, p] of Object.entries(state.posts)) {
      if (seen.has(id) || !p.code || !["published", "draft"].includes(p.result) || (p.posted && new Date(p.posted) < from)) continue;
      if ((await postExists(id)) === false) gone.push(p);
    }
    const trusted = gone.length <= MAX_HIDE || (posts.length > 0 && (await postExists(posts[0].id)) === true);
    if (!trusted) {
      failed.push(`${gone.length} postime duken të fshira njëherësh (pronat ${gone.map((p) => p.code).join(", ")}). Asnjë pronë nuk u fsheh; kontrollo çelësin e Instagram-it.`);
    } else for (const p of gone) {
      const file = listingFile(p.code);
      if (exists(file) && hash(readText(file)) === p.file) {
        const l = readJSON(file);
        l.hidden = true;
        l.note = `${l.note || ""} Postimi u fshi nga Instagram-i, ndaj prona u fsheh.`.trim();
        write(file, toJSON(l));
        changedCodes.push(`${p.code} (u fsheh)`);
        report.push(`U fsheh ${p.code}: postimi u fshi nga Instagram-i`);
        Object.assign(p, { result: "deleted", note: "postimi u fshi; prona u fsheh" });
      } else {
        Object.assign(p, { result: "deleted", note: "postimi u fshi; prona ishte ndryshuar në panel dhe nuk u prek" });
        report.push(`Postimi i pronës ${p.code} u fshi nga Instagram-i; prona u ndryshua në panel, ndaj mbeti siç është`);
      }
    }
  }

  const stateText = toJSON(state);
  const stateChanged = stateText !== before;
  if (stateChanged) write(STATE_FILE, stateText);
  const deploy = changedCodes.length > 0;
  const subject = deploy ? `Instagram: pronat ${changedCodes.join(", ")}` : "Instagram: gjendja e lidhjes [skip netlify]";
  const msgFile = env.IG_COMMIT_MSG_FILE || path.join(os.tmpdir(), "ig-commit-msg");
  fs.writeFileSync(msgFile, [subject, "", ...report].join("\n") + "\n");
  output({ changed: String(stateChanged || deploy), deploy: String(deploy), failed: String(failed.length > 0) });
  if (env.GITHUB_ACTIONS) for (const f of failed) console.log(`::error::${f.replace(/\r?\n/g, " ")}`);
  else for (const f of failed) console.error("KUJDES: " + f);
  log(report.length ? report.join("\n") : `Asnjë postim i ri (${posts.length} postime të kontrolluara).`);
  if (env.GITHUB_STEP_SUMMARY && report.length + failed.length) fs.appendFileSync(env.GITHUB_STEP_SUMMARY, "### Instagram → pronat\n\n" + [...failed, ...report].map((x) => `- ${x}`).join("\n") + "\n");
}

async function refreshToken(file) {
  if (!file) throw new Error("Jep skedarin ku ruhet çelësi i ri.");
  if (!TOKEN) { log("Mungon IG_ACCESS_TOKEN; nuk ka çfarë të rifreskohet."); return; }
  if (HOST !== "graph.instagram.com") { log("Me lidhjen përmes Facebook-ut çelësi nuk skadon; nuk rifreskohet."); return; }
  const body = await getJSON(`https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(TOKEN)}`);
  if (!body.access_token) throw new Error("Instagram nuk ktheu çelës të ri.");
  fs.writeFileSync(file, body.access_token, { mode: 0o600 });
  log(`Çelësi i Instagram-it u rifreskua; vlen edhe ${Math.round((body.expires_in || 0) / 86400)} ditë.`);
}

// Shows how the latest posts would become properties, without changing anything. Used to test the connection and the captions.
async function preview(n) {
  if (!TOKEN && !FIXTURE) { log("Instagram nuk është lidhur ende (mungon IG_ACCESS_TOKEN)."); return; }
  if (!USER) throw new Error("Mungon IG_USER_ID (duhet kur përdoret graph.facebook.com).");
  const ctx = context();
  const posts = FIXTURE ? (FIXTURE.media || []).slice(0, n) : (await getJSON(apiURL(`${USER}/media`, { fields: FIELDS, limit: String(n) }))).data || [];
  const lines = [`Lidhja me Instagram-in punon: u lexuan ${posts.length} postimet e fundit. Asgjë nuk u ndryshua.`];
  if (posts.length && posts.every((p) => !p.caption)) lines.push("", "KUJDES: asnjë postim nuk erdhi me përshkrim. Përdor lidhjen me Facebook (README → Instagram).");
  const show = (k, v) => v !== undefined && v !== "" && lines.push(`  ${k}: ${Array.isArray(v) ? v.join(", ") : v}`);
  for (const p of posts) {
    lines.push("", `${p.permalink || p.id} (${tiranaDate(tsOf(p.timestamp))})`);
    const parsed = parseCaption(p.caption, ctx);
    if (!parsed.isProperty) { lines.push("  Nuk duket postim prone: do të anashkalohej."); continue; }
    const { listing, missing, notes } = makeListing({ code: parsed.fields.code || 0, post: p, parsed, images: ["foto"], added: tiranaDate(tsOf(p.timestamp)), ctx });
    lines.push(missing.length ? `  Do të ruhej E FSHEHUR: mungon ${missing.join(", ")}` : "  Do të dilte online menjëherë");
    for (const k of ["deal", "type", "zone", "price", "beds", "area", "floor", "floors_total", "baths", "features", "status", "title_sq", "title_en"]) show(k, listing[k]);
    show("desc_sq", listing.desc_sq && cut(listing.desc_sq.replace(/\n+/g, " / "), 160));
    if (notes.length) lines.push(`  Shënime: ${notes.join("; ")}`);
  }
  log(lines.join("\n"));
  if (env.GITHUB_STEP_SUMMARY) fs.appendFileSync(env.GITHUB_STEP_SUMMARY, "### Instagram: prova\n\n```\n" + lines.join("\n") + "\n```\n");
}

function check() {
  const { bad } = readCodes();
  if (bad.length) { console.error("Kodet e pronave kanë probleme: " + bad.join("; ")); process.exit(1); }
  log("Kodet e pronave janë në rregull.");
}

if (require.main === module) {
  const [cmd, arg] = process.argv.slice(2);
  const job = cmd === "--check" ? Promise.resolve(check()) : cmd === "--refresh-token" ? refreshToken(arg)
    : cmd === "--preview" ? preview(Math.min(25, Math.max(1, Number(arg) || 5))) : run();
  job.catch((e) => { console.error("GABIM: " + scrub(e.message)); process.exit(1); });
}
module.exports = { parseCaption, makeListing, priceOf, typeOf, floorOf, featuresOf, stripJpeg, context };
