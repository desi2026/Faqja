#!/usr/bin/env node
/*
 * Static site builder. No npm dependencies: `node build.js` writes the whole site to dist/.
 *   node build.js            production build (clean URLs, Netlify image CDN, map, CSP)
 *   node build.js --preview  preview build (relative .../index.html links, plain images, no iframes)
 *
 * Content: data/site.json, data/zones.json, data/about.json, data/terms.json, one file per listing in data/listings/,
 * one file per article in content/articles/ (all editable in /admin). Interface text: src/i18n.js.
 * The build stops with a clear message when the data is broken (duplicate codes, unknown zones, bad WhatsApp number),
 * so Netlify keeps the last good version online instead of publishing a broken one.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { Marked } = require("./src/vendor/marked.cjs");

const ROOT = __dirname;
const PREVIEW = process.argv.includes("--preview");
const OUT = path.join(ROOT, PREVIEW ? "dist-preview" : "dist");
const readJSON = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), "utf8"));
const exists = (f) => fs.existsSync(path.join(ROOT, f));

const problems = []; // stop the build
const warnings = []; // print, keep building
const fail = (m) => problems.push(m);
const warn = (m) => warnings.push(m);

const T = require("./src/i18n.js");
const privacyHTML = require("./src/privacy.js");
const LANGS = ["sq", "en"];
const TYPES = ["apartment", "villa", "office", "land"];
const BUILD_DATE = new Date().toISOString().slice(0, 10);
const ID_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/* ------------------------------ helpers ------------------------------ */
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fill = (s, o) => String(s).replace(/\{(\w+)\}/g, (m, k) => (k in o ? o[k] : m));
const slugify = (s) => String(s || "").toLowerCase().replace(/ë/g, "e").replace(/ç/g, "c").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const slugPart = (s) => slugify(s).slice(0, 80).replace(/-+$/, "");
const okDate = (d, where) => {
  if (typeof d === "string" && /^\d{4}-\d{2}-\d{2}/.test(d) && !isNaN(Date.parse(d.slice(0, 10)))) return d.slice(0, 10) > BUILD_DATE ? BUILD_DATE : d.slice(0, 10);
  if (d) warn(`Data "${d}" te ${where} nuk është e saktë; u përdor data e sotme.`);
  else warn(`Mungon data te ${where}; u përdor data e sotme.`);
  return BUILD_DATE;
};

/* --------------------------- site settings --------------------------- */
const RAW = readJSON("data/site.json");
const SITE = { ...RAW };
SITE.brand = String(RAW.brand || "Agjencia").trim();
SITE.tagline = String(RAW.tagline || "").trim();
// Full trading name: brand + tagline ("ISA Consulting" + "& Properties"); used where the whole name is shown.
const FULL_NAME = `${SITE.brand} ${SITE.tagline || "Real Estate"}`;

// Domain: accept "isaproperties.al" or "https://www.isaproperties.al/"; on Netlify the primary domain wins if they differ.
let SITE_ORIGIN = "https://example.com";
try { SITE_ORIGIN = new URL(/^https?:\/\//i.test(String(RAW.domain || "").trim()) ? String(RAW.domain).trim() : "https://" + String(RAW.domain || "").trim()).origin; }
catch (e) { fail(`Domeni te Cilësimet nuk është i saktë: "${RAW.domain}". Shkruaje p.sh. https://www.isaproperties.al`); }
let NETLIFY_ORIGIN = "";
try { if (process.env.CONTEXT === "production" && process.env.URL) NETLIFY_ORIGIN = new URL(process.env.URL).origin; } catch (e) {}
const NETLIFY_CUSTOM = NETLIFY_ORIGIN && !/\.netlify\.app$/i.test(new URL(NETLIFY_ORIGIN).host);
if (NETLIFY_CUSTOM && new URL(NETLIFY_ORIGIN).host !== new URL(SITE_ORIGIN).host)
  warn(`Domeni te Cilësimet (${SITE_ORIGIN}) nuk përputhet me domenin kryesor në Netlify (${NETLIFY_ORIGIN}); u përdor ${NETLIFY_ORIGIN}.`);
const DOMAIN = NETLIFY_CUSTOM ? NETLIFY_ORIGIN : SITE_ORIGIN;
const USE_IMAGE_CDN = !PREVIEW && SITE.imageCdn !== false;

// WhatsApp number: digits with the country code, e.g. 355691234567 (accepts "+355 69…", "0035569…", "069…").
function waNum(v, where) {
  if (!v) return "";
  let d = String(v).replace(/\D/g, "").replace(/^00/, "");
  if (/^0\d{8,9}$/.test(d)) d = "355" + d.slice(1);
  if (!/^[1-9]\d{7,14}$/.test(d)) { fail(`Numri i WhatsApp nuk është i saktë (${where}): "${v}". Shkruaje p.sh. 355691234567.`); return ""; }
  return d;
}
SITE.whatsapp = waNum(RAW.whatsapp, "Cilësimet");
if (!SITE.whatsapp) fail("Mungon numri i WhatsApp te Cilësimet.");
// Shown under "WhatsApp" in the contact block: +355 69 123 4567 for Albanian mobiles, +<digits> otherwise.
const waDisplay = (d) => (/^355(\d{2})(\d{3})(\d{4})$/.test(d) ? d.replace(/^355(\d{2})(\d{3})(\d{4})$/, "+355 $1 $2 $3") : "+" + d);

// Social links: accept "@handle", "handle", "instagram.com/handle?igsh=…".
function socialUrl(v, host) {
  v = String(v || "").trim();
  if (!v) return "";
  if (!/[/:]/.test(v) && !v.toLowerCase().includes(host)) return `https://${host}/${v.replace(/^@/, "")}`;
  if (!/^https?:\/\//i.test(v)) v = "https://" + v.replace(/^\/+/, "");
  try {
    const u = new URL(v);
    const keepQuery = /profile\.php/.test(u.pathname) ? u.search : "";
    return `https://${u.host.replace(/^(m|mobile|web)\./, "www.")}${u.pathname.replace(/\/+$/, "")}${keepQuery}`;
  } catch (e) { warn(`Linku "${v}" nuk është i saktë; nuk u shfaq.`); return ""; }
}
SITE.instagram = socialUrl(RAW.instagram, "instagram.com");
SITE.facebook = socialUrl(RAW.facebook, "facebook.com");
const handleOf = (u) => "@" + decodeURIComponent(new URL(u).pathname.split("/").filter(Boolean).pop() || "");

// Tracking IDs: keep only the ID even if a whole snippet was pasted.
const gaM = String(RAW.googleAnalyticsId || "").match(/G-[A-Z0-9]{4,}/i);
SITE.googleAnalyticsId = gaM ? gaM[0].toUpperCase() : "";
if (RAW.googleAnalyticsId && !gaM) warn(`Google Analytics ID "${RAW.googleAnalyticsId}" nuk duket si G-XXXXXXX; nuk u përdor.`);
const pxM = String(RAW.metaPixelId || "").match(/\b\d{10,20}\b/);
SITE.metaPixelId = pxM ? pxM[0] : "";
if (RAW.metaPixelId && !pxM) warn(`Meta Pixel ID "${RAW.metaPixelId}" nuk duket si numër; nuk u përdor.`);
let gsv = String(RAW.googleSiteVerification || "").trim();
const gsvM = gsv.match(/content=["']([^"']+)["']/i);
if (gsvM) gsv = gsvM[1];
gsv = gsv.replace(/^google-site-verification[=:]\s*/i, "");
if (gsv && !/^[A-Za-z0-9_-]{10,}$/.test(gsv)) { warn("Kodi i Google Search Console nuk është i saktë; nuk u përdor."); gsv = ""; }
SITE.googleSiteVerification = gsv;
SITE.gbpUrl = /^https:\/\/\S+$/.test(String(RAW.gbpUrl || "").trim()) ? String(RAW.gbpUrl).trim() : "";
const HAS_TRACKERS = !!(SITE.googleAnalyticsId || SITE.metaPixelId);
for (const k of ["legalName", "nipt", "brokerName", "brokerCertificate", "email", "phoneDisplay", "address"]) SITE[k] = String(RAW[k] || "").trim();
SITE.nipt = SITE.nipt.toUpperCase();
if (!SITE.legalName || !SITE.nipt || !SITE.brokerName || !SITE.brokerCertificate)
  warn("PARA PUBLIKIMIT: plotëso te Cilësimet emrin ligjor të shoqërisë, NIPT-in, emrin e ndërmjetësit dhe numrin e certifikatës (ligji 9/2022, neni 5.2).");
else if (!/^[A-Z]\d{8}[A-Z]$/.test(SITE.nipt)) warn(`NIPT "${SITE.nipt}" nuk duket në formatin L12345678A.`);
// Office coordinates are optional; use them only when both are filled in and inside Albania (same check as listings).
{
  const g = RAW.geo || {};
  const hasInput = [g.lat, g.lng].some((v) => v !== undefined && v !== null && v !== "");
  const lat = parseFloat(g.lat), lng = parseFloat(g.lng);
  const ok = isFinite(lat) && isFinite(lng) && lat > 39 && lat < 43 && lng > 18.5 && lng < 21.5;
  if (hasInput && !ok) warn(`Koordinatat e zyrës nuk janë të plota ose janë jashtë Shqipërisë (lat ${g.lat}, lng ${g.lng}); nuk u përdorën.`);
  SITE.geo = ok ? { lat, lng } : null;
}
// The agency hasn't given an email yet, so this one is a stand-in; empty the constant once the address is confirmed.
const PROVISIONAL_EMAIL = "info@isaproperties.al";
if (PROVISIONAL_EMAIL && SITE.email.toLowerCase() === PROVISIONAL_EMAIL)
  warn(`PARA PUBLIKIMIT: emaili ${SITE.email} është vendosur përkohësisht. Vendos emailin e vërtetë te Cilësimet; nëse mbetet ky, krijoje pasi të blihet domeni dhe bëje bosh PROVISIONAL_EMAIL te build.js.`);
const OFFICE_MAP = SITE.gbpUrl || (SITE.geo ? `https://www.google.com/maps/search/?api=1&query=${SITE.geo.lat},${SITE.geo.lng}`
  : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${FULL_NAME}, ${SITE.address}`)}`);
const PRIVACY_DATE = okDate(RAW.privacyUpdated || BUILD_DATE, "data e politikës së privatësisë");

const t = (lang, key, o = {}) => fill(T[lang][key] ?? key, { brand: SITE.brand, ...o });
// Singular/plural: uses "key.one" when n is 1.
const tn = (lang, key, n, o = {}) => t(lang, n === 1 && T[lang][key + ".one"] != null ? key + ".one" : key, { n, ...o });
const andList = (arr, lang) => arr.length <= 1 ? arr.join("") : arr.slice(0, -1).join(", ") + " " + t(lang, "and") + " " + arr[arr.length - 1];

/* ------------------------------- zones ------------------------------- */
const ZONES = readJSON("data/zones.json").groups || [];
const AREAS = {};
const seenZone = new Set();
for (const g of ZONES) {
  if (!ID_RE.test(String(g.id))) fail(`Kodi i grupit të zonave "${g.id}" duhet të ketë vetëm shkronja të vogla pa ë/ç, shifra dhe viza.`);
  for (const a of g.areas || []) {
    if (!ID_RE.test(String(a.id))) fail(`Kodi i zonës "${a.id}" (${a.sq}) duhet të ketë vetëm shkronja të vogla pa ë/ç, shifra dhe viza.`);
    if (seenZone.has(a.id)) fail(`Kodi i zonës "${a.id}" përdoret dy herë.`);
    seenZone.add(a.id);
    AREAS[a.id] = { ...a, group: g };
  }
}
const isCityGroup = (g) => g.city ?? g.id === "tirana";
const IN = { sq: "në ", en: "in " };
const zoneName = (id, lang) => AREAS[id] ? AREAS[id][lang] || AREAS[id].sq : id;
// For the coast the "city" of a zone is the zone itself; for Tirana it's Tirana.
const cityOf = (id, lang) => AREAS[id] && isCityGroup(AREAS[id].group) ? AREAS[id].group[lang] : zoneName(id, lang);
// "Blloku, Tiranë" for Tirana neighbourhoods, just "Durrës" for coastal towns.
const placeOf = (id, lang) => AREAS[id] && isCityGroup(AREAS[id].group) ? `${zoneName(id, lang)}, ${AREAS[id].group[lang]}` : zoneName(id, lang);
// With the preposition and the right case: "në Bllok, Tiranë", "in Blloku, Tirana", "në Durrës".
function inPlaceOf(id, lang) {
  const a = AREAS[id];
  if (!a) return IN[lang] + id;
  const loc = a["in_" + lang] || IN[lang] + (a[lang] || a.sq);
  return isCityGroup(a.group) ? `${loc}, ${a.group[lang]}` : loc;
}
const inGroup = (g, lang) => g["in_" + lang] || IN[lang] + g[lang];
const groupSlug = (g, lang) => slugify(g[lang] || g.id) || g.id;
for (const g of ZONES) for (const lang of LANGS) if (AREAS[groupSlug(g, lang)])
  fail(`Emri i grupit "${g[lang]}" përputhet me kodin e një zone; ndrysho njërin prej tyre.`);

/* ------------------------------ listings ----------------------------- */
const LIST_DIR = "data/listings";
const RAW_LISTINGS = exists(LIST_DIR) ? fs.readdirSync(path.join(ROOT, LIST_DIR)).filter((f) => f.endsWith(".json")).sort()
  .map((f) => { try { return { ...readJSON(`${LIST_DIR}/${f}`), _file: f }; } catch (e) { fail(`Skedari ${LIST_DIR}/${f} nuk lexohet: ${e.message}`); return null; } }).filter(Boolean) : [];
const byId = new Map();
for (const l of RAW_LISTINGS) {
  const id = Number(l.id);
  if (!Number.isInteger(id) || id <= 0) { fail(`Prona "${l.title_sq || l._file}" ka kod të pavlefshëm (${l.id}). Kodi duhet të jetë numër i plotë mbi 0.`); continue; }
  if (byId.has(id)) fail(`Kodi ${id} përdoret nga dy prona: "${byId.get(id).title_sq}" dhe "${l.title_sq}". Ndryshoje njërin.`);
  byId.set(id, l);
}
function cleanSlug(s, id) {
  const x = slugPart(s);
  if (!x) return "";
  return x.endsWith(`-${id}`) || x === String(id) ? x : `${x}-${id}`;
}
function normListing(l) {
  const id = Number(l.id);
  const imgs = (l.images || []).map((x) => (typeof x === "string" ? { image: x } : x || {})).filter((x) => x.image);
  const hasGeoInput = [l.lat, l.lng].some((v) => v !== undefined && v !== null && v !== "");
  const lat = parseFloat(l.lat), lng = parseFloat(l.lng);
  const geoOk = isFinite(lat) && isFinite(lng) && lat > 39 && lat < 43 && lng > 18.5 && lng < 21.5;
  if (hasGeoInput && !geoOk) warn(`Koordinatat e pronës ${id} nuk janë të plota ose janë jashtë Shqipërisë (lat ${l.lat}, lng ${l.lng}); harta nuk u shfaq.`);
  if (!["sale", "rent"].includes(l.deal)) fail(`Prona ${id}: "Qëllimi" duhet të jetë shitje ose qira.`);
  if (!TYPES.includes(l.type)) fail(`Prona ${id}: lloji "${l.type}" nuk njihet.`);
  if (!AREAS[l.zone]) fail(`Prona ${id} ("${l.title_sq}") ka zonën "${l.zone}", që nuk ekziston më. Zgjidh një zonë tjetër te prona.`);
  const sq = cleanSlug(l.slug_sq, id) || `${slugPart(l.title_sq || "prona") || "prona"}-${id}`;
  const en = cleanSlug(l.slug_en, id) || `${slugPart(l.title_en || l.title_sq || "property") || "property"}-${id}`;
  return {
    ...l, id, added: okDate(l.added, `prona ${id}`), updated: l.updated ? okDate(l.updated, `prona ${id}`) : "",
    images: imgs.map((x) => String(x.image)), alts: imgs.map((x) => String(x.alt || "")),
    lat: geoOk ? lat : undefined, lng: geoOk ? lng : undefined,
    price: Number(l.price) > 0 ? Number(l.price) : 0, area: Number(l.area) > 0 ? Number(l.area) : 0,
    floor: l.floor === "" || l.floor === null || l.floor === undefined || isNaN(Number(l.floor)) ? undefined : Number(l.floor),
    slug: { sq, en },
  };
}
const LISTINGS = RAW_LISTINGS.filter((l) => Number(l.id) > 0 && !l.hidden).map(normListing)
  .sort((a, b) => b.added.localeCompare(a.added) || b.id - a.id);
for (const lang of LANGS) {
  const seen = new Map();
  for (const l of LISTINGS) {
    if (seen.has(l.slug[lang])) fail(`Prona ${l.id} dhe ${seen.get(l.slug[lang])} kanë të njëjtin link (${l.slug[lang]}).`);
    seen.set(l.slug[lang], l.id);
  }
}
// Sold and rented listings keep their pages (and links) but leave the main lists.
const isClosed = (l) => l.status === "sold" || l.status === "rented";
const ACTIVE = LISTINGS.filter((l) => !isClosed(l));
const CLOSED = LISTINGS.filter(isClosed);
const hasPrice = (l) => l.price > 0;
const mod = (l) => [l.added, l.updated].filter(Boolean).sort().pop();
// Coordinates are shown rounded to a ~250 m grid: the page says the location is approximate.
const pubGeo = (l) => (l.lat != null && l.lng != null ? { lat: Math.round(l.lat * 400) / 400, lng: Math.round(l.lng * 400) / 400 } : null);
const FEATURES = ["parking", "garage", "elevator", "furnished", "seaview", "balcony", "terrace", "pool", "garden", "heating", "ac", "security", "storage"];
const ORIENT = ["north", "south", "east", "west"];

/* --------------------------- about, terms --------------------------- */
const ABOUT = readJSON("data/about.json");
ABOUT.team = (ABOUT.team || []).map((m, i) => ({ ...m, whatsapp: waNum(m.whatsapp, `ekipi, ${m.name || i + 1}`) }));
const AGENTS = {};
for (const m of ABOUT.team) if (m.key) AGENTS[m.key] = m;
for (const l of LISTINGS) if (l.agent && !AGENTS[l.agent]) warn(`Prona ${l.id}: agjenti "${l.agent}" nuk ekziston te ekipi; u përdor numri i agjencisë.`);
const TERMS = exists("data/terms.json") ? readJSON("data/terms.json") : null;

/* ------------------------------ articles ----------------------------- */
const ARTICLES = fs.readdirSync(path.join(ROOT, "content/articles")).filter((f) => f.endsWith(".json")).sort()
  .map((f) => ({ ...readJSON("content/articles/" + f), _file: f })).filter((a) => a && a.slug_sq && !a.draft)
  .map((a) => ({ ...a, date: okDate(a.date, `artikulli ${a._file}`), updated: a.updated ? okDate(a.updated, `artikulli ${a._file}`) : "" }))
  .sort((a, b) => b.date.localeCompare(a.date));
for (const [key, get] of [["slug_sq", (a) => a.slug_sq], ["slug_en", (a) => a.slug_en || a.slug_sq]]) {
  const seen = new Map();
  for (const a of ARTICLES) {
    if (!ID_RE.test(get(a))) fail(`Artikulli ${a._file}: linku "${get(a)}" duhet të ketë vetëm shkronja të vogla, shifra dhe viza.`);
    if (seen.has(get(a))) fail(`Artikujt ${seen.get(get(a))} dhe ${a._file} kanë të njëjtin link (${key}: ${get(a)}).`);
    seen.set(get(a), a._file);
  }
}

if (problems.length) {
  console.error("\nNDËRTIMI U NDAL / BUILD STOPPED. Faqja e vjetër mbetet online derisa të rregullohen këto:\n");
  problems.forEach((p) => console.error(" ✗ " + p));
  console.error("");
  process.exit(1);
}

/* ------------------------------ formats ------------------------------ */
const fmtNum = (n, lang) => Math.round(n).toLocaleString(lang === "sq" ? "de-DE" : "en-GB");
const eur = (n, lang) => "€" + fmtNum(n, lang);
const fmtDate = (d, lang) => { const x = new Date(d); return `${x.getUTCDate()} ${T[lang].months[x.getUTCMonth()]} ${x.getUTCFullYear()}`; };
const title = (l, lang) => l[`title_${lang}`] || l.title_sq;
const desc = (l, lang) => l[`desc_${lang}`] || l.desc_sq || "";
function youtubeId(url) {
  const m = String(url || "").match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})/);
  return m ? m[1] : "";
}
const waLink = (msg, num = SITE.whatsapp) => `https://wa.me/${num}?text=${encodeURIComponent(msg)}`;
const telHref = (s) => "tel:" + String(s).replace(/[^\d+]/g, "");
const ppm = (l) => (l.deal === "sale" && hasPrice(l) && l.area > 0 ? Math.round(l.price / l.area) : 0);
const hasFloor = (l) => l.floor !== undefined && l.type !== "land";
const floorText = (l, lang) => l.floor === 0 ? t(lang, "floor.ground") : l.floor < 0 ? t(lang, "floor.basement") + (l.floor < -1 ? " " + l.floor : "")
  : `${t(lang, "floor")} ${l.floor}${l.floors_total ? "/" + l.floors_total : ""}`;
const floorShort = (l, lang) => {
  const f = l.floor === 0 ? t(lang, "floor.groundShort") : l.floor < 0 ? t(lang, "floor.basementShort") + (l.floor < -1 ? " " + l.floor : "") : String(l.floor);
  return l.floors_total && l.floor > 0 ? t(lang, "floorOf", { floor: f, total: l.floors_total }) : f;
};
const typesText = (list, lang) => andList(TYPES.filter((k) => list.some((l) => l.type === k)).map((k) => t(lang, "typeWord." + k)), lang) || t(lang, "stat.listings");

/* ------------------------------- routes ------------------------------ */
// Every page has a path like "prona/slug/" ("" is the home page).
const R = {
  home: (lang) => (lang === "sq" ? "" : "en/"),
  latest: (lang) => (lang === "sq" ? "te-fundit/" : "en/latest/"),
  sell: (lang) => (lang === "sq" ? "shit-pronen/" : "en/list-your-property/"),
  privacy: (lang) => (lang === "sq" ? "privatesia/" : "en/privacy/"),
  terms: (lang) => (lang === "sq" ? "kushtet-dhe-tarifat/" : "en/terms-and-fees/"),
  zone: (lang, id) => (lang === "sq" ? `zona/${id}/` : `en/zone/${id}/`),
  group: (lang, g) => (lang === "sq" ? `zona/${groupSlug(g, "sq")}/` : `en/zone/${groupSlug(g, "en")}/`),
  groupDeal: (lang, g, deal) => (lang === "sq" ? `${deal === "sale" ? "ne-shitje" : "me-qira"}/${groupSlug(g, "sq")}/` : `en/${deal === "sale" ? "for-sale" : "for-rent"}/${groupSlug(g, "en")}/`),
  prop: (lang, l) => (lang === "sq" ? `prona/${l.slug.sq}/` : `en/property/${l.slug.en}/`),
  map: (lang) => (lang === "sq" ? "harta/" : "en/map/"),
  about: (lang) => (lang === "sq" ? "rreth-nesh/" : "en/about-us/"),
  articles: (lang) => (lang === "sq" ? "artikuj/" : "en/articles/"),
  article: (lang, a) => (lang === "sq" ? `artikuj/${a.slug_sq}/` : `en/articles/${a.slug_en || a.slug_sq}/`),
};
const abs = (p) => `${DOMAIN}/${p}`;
// Relative link from page `from` to page `to`, so the site works from any folder (and in the preview).
function rel(from, to, isPage = true) {
  const depth = from.split("/").filter(Boolean).length;
  let r = "../".repeat(depth) + to;
  if (isPage && PREVIEW) r += (r === "" || r.endsWith("/") ? "index.html" : "");
  if (r === "") r = "./";
  return r;
}
// Same, for targets with a #hash ("en/#calculator").
function relHash(from, to) {
  const [p, hash] = to.split("#");
  return hash === undefined ? rel(from, p) : rel(from, p) + "#" + hash;
}
// Link to a root-relative URL written in content ("/zona/blloku/", "/#calculator").
const contentLinks = [];
function relUrl(from, url) {
  if (!url.startsWith("/")) return url;
  const [pathPart, hash] = url.slice(1).split("#");
  contentLinks.push({ from, to: pathPart });
  return rel(from, pathPart) + (hash ? "#" + hash : "");
}
const imgPath = (p) => String(p).replace(/^\//, "");
const safeExt = (p) => /^https:\/\/[^\s"'<>`]+$/.test(p);
const absImg = (p) => (/^https?:/i.test(p) ? (safeExt(p) ? p : "") : abs(encodeURI(imgPath(p))));
// Share image: a 1200×630 JPEG cut by the image CDN, so WhatsApp and Facebook show the preview.
const ogImg = (p) => (USE_IMAGE_CDN && !/^https?:/i.test(p)
  ? { url: `${DOMAIN}/.netlify/images?url=${encodeURIComponent("/" + imgPath(p))}&w=1200&h=630&fit=cover&fm=jpg&q=70`, sized: true }
  : { url: absImg(p), sized: false });
function imgSrc(from, p, w) {
  if (/^https?:/i.test(p)) return safeExt(p) ? p : "";
  if (USE_IMAGE_CDN && w) return `/.netlify/images?url=${encodeURIComponent("/" + imgPath(p))}&w=${w}&q=75`;
  return encodeURI(rel(from, imgPath(p), false));
}
const CARD_SIZES = "(max-width: 627px) calc(100vw - 40px), (max-width: 980px) 50vw, 380px";
const srcsetOf = (from, p, widths) => (USE_IMAGE_CDN && !/^https?:/i.test(p) ? widths.map((w) => `${imgSrc(from, p, w)} ${w}w`).join(", ") : "");
function img(from, p, alt, { widths = [480, 800, 1200], sizes = CARD_SIZES, eager = false, cls = "", attrs = "" } = {}) {
  const ss = srcsetOf(from, p, widths);
  return `<img${cls ? ` class="${cls}"` : ""} src="${esc(imgSrc(from, p, widths[1] || widths[0]))}"${ss ? ` srcset="${esc(ss)}" sizes="${sizes}"` : ""} alt="${esc(alt)}" width="1200" height="900" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async"${attrs}>`;
}

/* ------------------------------ assets ------------------------------- */
fs.rmSync(OUT, { recursive: true, force: true });
const written = new Set();
function write(p, content) { const f = path.join(OUT, p); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, content); }
function copyDir(src, dst) {
  if (!fs.existsSync(src)) return;
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (e.isDirectory()) { fs.mkdirSync(d, { recursive: true }); copyDir(s, d); } else fs.copyFileSync(s, d);
  }
}
fs.mkdirSync(OUT, { recursive: true });
copyDir(path.join(ROOT, "static"), OUT);
const hash = (f) => crypto.createHash("md5").update(fs.readFileSync(path.join(ROOT, f))).digest("hex").slice(0, 8);
write("assets/style.css", fs.readFileSync(path.join(ROOT, "src/style.css")));
write("assets/app.js", fs.readFileSync(path.join(ROOT, "src/app.js")));
const V = { css: hash("src/style.css"), js: hash("src/app.js") };
const FONTS = ["assets/fonts/manrope-latin-wght-v5.woff2", "assets/fonts/marcellus-latin-400-v5.woff2"];
const LEAFLET = "assets/vendor/leaflet-1.9.4/", CLUSTER = "assets/vendor/markercluster-1.5.3/";
const usedImages = new Set();

/* ------------------------------ icons ------------------------------- */
const ICON = {
  wa: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91S17.5 2 12.04 2Zm5.8 14.05c-.24.68-1.42 1.3-1.95 1.35-.5.05-.97.23-3.27-.68-2.77-1.09-4.52-3.92-4.66-4.1-.13-.18-1.11-1.48-1.11-2.82 0-1.34.7-2 .95-2.27.25-.27.54-.34.72-.34h.52c.17 0 .39-.06.61.47.24.55.79 1.9.86 2.04.07.14.11.3.02.48-.09.18-.14.3-.27.46-.14.16-.29.36-.41.48-.14.14-.28.29-.12.56.16.27.71 1.17 1.52 1.89 1.05.93 1.93 1.22 2.2 1.36.27.14.43.11.59-.07.16-.18.68-.79.86-1.07.18-.27.36-.23.61-.14.25.09 1.59.75 1.86.89.27.14.45.2.52.32.07.11.07.66-.17 1.35Z"/></svg>`,
  ig: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 7.2A4.8 4.8 0 1 0 12 16.8 4.8 4.8 0 0 0 12 7.2Zm0 7.9a3.1 3.1 0 1 1 0-6.2 3.1 3.1 0 0 1 0 6.2Zm6.1-8.1a1.1 1.1 0 1 1-2.2 0 1.1 1.1 0 0 1 2.2 0ZM21.9 8.1c-.06-1.5-.4-2.83-1.5-3.93S18 2.72 16.5 2.65C14.96 2.56 9.04 2.56 7.5 2.65 6 2.72 4.68 3.06 3.57 4.16S2.13 6.6 2.06 8.1c-.09 1.54-.09 7.46 0 9 .07 1.5.41 2.83 1.51 3.93s2.43 1.44 3.93 1.51c1.54.09 7.46.09 9 0 1.5-.07 2.83-.41 3.93-1.51s1.44-2.43 1.5-3.93c.09-1.54.09-7.46 0-9Zm-2 10.74a3.17 3.17 0 0 1-1.78 1.78c-1.24.49-4.17.38-5.53.38s-4.3.11-5.53-.38a3.17 3.17 0 0 1-1.78-1.78c-.49-1.24-.38-4.17-.38-5.53s-.11-4.3.38-5.53A3.17 3.17 0 0 1 7.06 6c1.24-.49 4.17-.38 5.53-.38s4.3-.11 5.53.38a3.17 3.17 0 0 1 1.78 1.78c.49 1.24.38 4.17.38 5.53s.11 4.3-.38 5.53Z"/></svg>`,
  fb: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M22 12.06C22 6.5 17.52 2 12 2S2 6.5 2 12.06c0 5.02 3.66 9.18 8.44 9.94v-7.03H7.9v-2.91h2.54V9.85c0-2.52 1.49-3.91 3.78-3.91 1.1 0 2.24.2 2.24.2v2.47h-1.26c-1.24 0-1.63.78-1.63 1.57v1.88h2.78l-.44 2.91h-2.34V22c4.78-.76 8.43-4.92 8.43-9.94Z"/></svg>`,
  area: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h16v16H4zM4 9h5V4"/></svg>`,
  bed: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 18V7M3 13h18v5M21 13a3 3 0 0 0-3-3h-7v3M7 10.5h.01"/></svg>`,
  bath: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h16v3a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4ZM6 12V6a2 2 0 0 1 4 0"/></svg>`,
  floor: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4v-4h4v-4h4V8h4"/></svg>`,
  pin: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.5"/></svg>`,
  check: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>`,
  play: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5Z"/></svg>`,
  phone: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.6 3h2.9l1.5 4.4-2.1 1.5a12.6 12.6 0 0 0 6.2 6.2l1.5-2.1 4.4 1.5v2.9A2.2 2.2 0 0 1 18.6 20 15.6 15.6 0 0 1 4 5.4 2.2 2.2 0 0 1 6.6 3Z"/></svg>`,
  heart: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.3s-7.4-4.5-9.2-9C1.6 8 3.6 4.6 7.1 4.6c2 0 3.6 1.1 4.9 2.8 1.3-1.7 2.9-2.8 4.9-2.8 3.5 0 5.5 3.4 4.3 6.7-1.8 4.5-9.2 9-9.2 9Z"/></svg>`,
  expand: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>`,
};

/* --------------------------- components --------------------------- */
function specs(l, lang) {
  const s = [];
  if (l.area) s.push(`<span title="${t(lang, "area")}">${ICON.area}${fmtNum(l.area, lang)} m²</span>`);
  if (l.beds) s.push(`<span>${ICON.bed}${l.beds} ${tn(lang, "beds", l.beds)}</span>`);
  if (l.baths) s.push(`<span>${ICON.bath}${l.baths} ${tn(lang, "baths", l.baths)}</span>`);
  if (hasFloor(l)) s.push(`<span>${ICON.floor}${floorText(l, lang)}</span>`);
  return s.join("");
}
const priceHTML = (l, lang) => hasPrice(l) ? eur(l.price, lang) + (l.deal === "rent" ? ` <small>${t(lang, "perMonth")}</small>` : "") : `<span class="on-request">${t(lang, "price.onRequest")}</span>`;
const priceText = (l, lang) => hasPrice(l) ? eur(l.price, lang) + (l.deal === "rent" ? ` ${t(lang, "perMonth")}` : "") : t(lang, "price.onRequest");
const ppmHTML = (l, lang) => (ppm(l) ? `<small class="ppm">${eur(ppm(l), lang)}/m²</small>` : "");
const favBtn = (l, lang, cls = "fav") => `<button type="button" class="${cls}" data-fav="${l.id}" aria-pressed="false" aria-label="${esc(t(lang, "fav.add"))}: ${esc(title(l, lang))}">${ICON.heart}${cls === "fav" ? "" : `<span>${t(lang, "fav.add")}</span>`}</button>`;

function card(from, l, lang, { eager = false, big = false } = {}) {
  const im = l.images[0];
  if (im) usedImages.add(im);
  const st = l.status && l.status !== "available" ? l.status : "";
  const closed = isClosed(l);
  return `<div class="card-wrap" data-id="${l.id}" data-deal="${l.deal}" data-type="${l.type}" data-zone="${esc(l.zone)}" data-price="${hasPrice(l) ? l.price : ""}" data-ppm="${ppm(l) || ""}" data-added="${l.added}" data-beds="${Number(l.beds) || 0}" data-area="${l.area}" data-deed="${esc(l.deed || "")}" data-url="${esc(abs(R.prop(lang, l)))}" data-title="${esc(title(l, lang))}">
  <a class="card${closed ? " closed" : ""}" href="${rel(from, R.prop(lang, l))}">
    <div class="media">${im ? img(from, im, "", { eager, sizes: big ? "(max-width: 980px) calc(100vw - 40px), 560px" : CARD_SIZES }) : ""}
      <div class="badges">${st ? `<span class="badge status ${st}">${t(lang, "status." + st)}</span>` : `<span class="badge new" hidden>${t(lang, "badge.new")}</span>`}<span class="badge">${t(lang, "deal." + l.deal)}</span></div>
      <div class="veil" aria-hidden="true">${t(lang, "card.view")}</div>
    </div>
    <div class="body">
      <span class="zone">${esc(placeOf(l.zone, lang))} · ${t(lang, "type." + l.type)} · <span class="ref">${t(lang, "code")} ${l.id}</span></span>
      <h3>${esc(title(l, lang))}</h3>
      ${l.deed === "yes" ? `<span class="deed-pill">${ICON.check}${t(lang, "deed.yes")}</span>` : ""}
      <div class="price">${priceHTML(l, lang)}${ppmHTML(l, lang)}</div>
      <div class="specs">${specs(l, lang)}</div>
    </div>
  </a>
  ${closed ? "" : favBtn(l, lang)}
</div>`;
}

const zoneOptions = (lang, groups = ZONES) => `<option value="all">${t(lang, "f.allZones")}</option>` + groups.map((g) =>
  `<optgroup label="${esc(g[lang])}">${g.areas.map((a) => `<option value="${esc(a.id)}">${esc(a[lang])}</option>`).join("")}</optgroup>`).join("");
const sortOptions = (lang) => ["new", "low", "high", "ppm"].map((k) => `<option value="${k}">${t(lang, "sort." + k)}</option>`).join("");

function filterBar(lang, { zones = true, groups = ZONES, deal = true } = {}) {
  const chip = (g, v, label, on) => `<button type="button" class="chip" data-g="${g}" data-v="${v}" aria-pressed="${on}">${label}</button>`;
  return `<div class="filters" data-filters>
  ${deal ? `<div class="chip-group" role="group" aria-label="${t(lang, "a11y.chips.deal")}">${chip("deal", "all", t(lang, "f.any"), true)}${chip("deal", "sale", t(lang, "deal.sale"), false)}${chip("deal", "rent", t(lang, "deal.rent"), false)}</div>
  <span class="sep"></span>` : ""}
  <div class="chip-group" role="group" aria-label="${t(lang, "a11y.chips.type")}">${chip("type", "all", t(lang, "f.allTypes"), true)}${TYPES.map((k) => chip("type", k, t(lang, "type." + k), false)).join("")}</div>
  <span class="sep"></span>
  ${zones ? `<select data-f="zone" aria-label="${t(lang, "f.zone")}" autocomplete="off">${zoneOptions(lang, groups)}</select>` : ""}
  <select data-f="sort" aria-label="${t(lang, "f.sort")}" autocomplete="off">${sortOptions(lang)}</select>
  <span class="result-note" data-count aria-live="polite"></span>
  <div class="filters-more">
    <label class="mini"><span>${t(lang, "f.pmin")}</span><input type="number" min="0" step="any" inputmode="numeric" data-n="pmin" placeholder="0" autocomplete="off"></label>
    <label class="mini"><span>${t(lang, "f.pmax")}</span><input type="number" min="0" step="any" inputmode="numeric" data-n="pmax" placeholder="∞" autocomplete="off"></label>
    <label class="mini"><span>${t(lang, "f.beds")}</span><select data-f="beds" autocomplete="off"><option value="0">${t(lang, "f.bedsAny")}</option>${[1, 2, 3, 4].map((n) => `<option value="${n}">${n}+</option>`).join("")}</select></label>
    <label class="mini"><span>${t(lang, "f.amin")}</span><input type="number" min="0" step="any" inputmode="numeric" data-n="amin" placeholder="0" autocomplete="off"></label>
    <label class="mini"><span>${t(lang, "f.code")}</span><input type="text" inputmode="numeric" data-n="code" placeholder="${t(lang, "f.codePh")}" autocomplete="off"></label>
    <label class="check"><input type="checkbox" data-c="deed" autocomplete="off"> ${t(lang, "f.deed")}</label>
    <label class="check fav-check"><input type="checkbox" data-c="saved" autocomplete="off"> ${ICON.heart}${t(lang, "fav.filter")} <span data-fav-count></span></label>
    <button type="button" class="linkish reset" data-reset>${t(lang, "f.reset")}</button>
  </div>
  <a class="btn-gold small fav-send" data-fav-send data-track="whatsapp" target="_blank" rel="noopener" href="${waLink(t(lang, "wa.fav"))}" hidden>${ICON.wa}<span>${t(lang, "fav.send")}</span></a>
</div>`;
}
// A grid of cards with the client-side "show more" button.
const listGrid = (from, list, lang, { eagerFirst = false } = {}) => `<div class="grid" data-grid data-batch="24">${list.map((l, i) => card(from, l, lang, { eager: eagerFirst && i === 0 })).join("")}</div>
<div class="empty" data-empty hidden>${t(lang, "empty")}</div>
<p class="empty" data-fav-empty hidden>${t(lang, "fav.none")}</p>
<div class="more-wrap"><button type="button" class="btn-ghost" data-more hidden></button></div>`;

// Markdown for articles and the terms page (CommonMark via the vendored "marked"): links are made relative,
// raw HTML is escaped, headings start at h2 and only safe link schemes are kept.
function md(src, from) {
  const renderer = {
    link({ href, tokens }) {
      const text = this.parser.parseInline(tokens);
      if (!/^(\/|#|https?:\/\/|mailto:|tel:)/i.test(href || "")) return text;
      const ext = /^https?:/i.test(href);
      return `<a href="${esc(relUrl(from, href))}"${ext ? ' target="_blank" rel="noopener"' : ""}>${text}</a>`;
    },
    heading({ tokens, depth }) { const d = depth <= 2 ? 2 : 3; return `<h${d}>${this.parser.parseInline(tokens)}</h${d}>\n`; },
    html({ text }) { return esc(text); },
    image() { return ""; },
  };
  return new Marked({ gfm: true, breaks: false, renderer }).parse(String(src || ""));
}
const readMinutes = (txt) => Math.max(1, Math.round(String(txt || "").split(/\s+/).length / 200));
const artTitle = (a, lang) => a[`title_${lang}`] || a.title_sq;
function articleCard(from, a, lang, { eager = false } = {}) {
  return `<a class="art-card" href="${rel(from, R.article(lang, a))}">
  ${a.image ? `<div class="media">${img(from, a.image, "", { widths: [480, 800], eager })}</div>` : ""}
  <div class="body"><span class="meta"><time datetime="${esc(a.date)}">${fmtDate(a.date, lang)}</time> · ${t(lang, "art.min", { n: readMinutes(a[`body_${lang}`]) })}</span>
  <h3>${esc(artTitle(a, lang))}</h3><p>${esc(a[`excerpt_${lang}`] || "")}</p><span class="more" aria-hidden="true">${t(lang, "art.read")}</span></div>
</a>`;
}

function calculator(lang, price = 150000, { compact = false, id = 0, wa = SITE.whatsapp } = {}) {
  const tpl = t(lang, id ? "wa.calcProp" : "wa.calc", { id, price: "{price}" });
  return `<div class="calc${compact ? " compact" : ""}" data-calc data-wa-tpl="${esc(tpl)}" data-wa-num="${wa}">
  <form class="calc-form">
    <div class="field"><div class="field-top"><label for="cPrice">${t(lang, "calc.price")}</label></div>
      <input type="number" id="cPrice" name="price" min="10000" step="any" value="${price || 150000}" inputmode="numeric"></div>
    <div class="field"><div class="field-top"><label for="cDown">${t(lang, "calc.down")}</label><span class="out" data-o="down" aria-hidden="true"></span></div>
      <input type="range" id="cDown" name="down" min="15" max="80" step="5" value="30"></div>
    <div class="field"><div class="field-top"><label for="cRate">${t(lang, "calc.rate")}</label><span class="out" data-o="rate" aria-hidden="true"></span></div>
      <input type="range" id="cRate" name="rate" min="2" max="10" step="0.1" value="5"></div>
    <div class="field"><div class="field-top"><label for="cYears">${t(lang, "calc.years")}</label><span class="out" data-o="years" aria-hidden="true"></span></div>
      <input type="range" id="cYears" name="years" min="5" max="30" step="1" value="25"></div>
  </form>
  <div class="calc-out">
    <div><span class="eyebrow on-navy">${t(lang, "calc.monthly")}</span><div class="big" data-r="monthly">€0</div></div>
    <p class="sr-only" data-r="say" aria-live="polite" aria-atomic="true"></p>
    <dl>
      <dt>${t(lang, "calc.loan")}</dt><dd data-r="loan"></dd>
      <dt>${t(lang, "calc.downAmt")}</dt><dd data-r="downAmt"></dd>
      <dt>${t(lang, "calc.interest")}</dt><dd data-r="interest"></dd>
      <dt>${t(lang, "calc.total")}</dt><dd data-r="total"></dd>
    </dl>
    <div class="split"><i data-r="split"></i></div>
    <div class="split-legend"><span>${t(lang, "calc.principal")}</span><span>${t(lang, "calc.interestShort")}</span></div>
    <p class="disclaimer">${t(lang, "calc.note")}</p>
    <a class="btn-gold" data-calc-wa data-track="whatsapp" target="_blank" rel="noopener" href="${waLink(fill(tpl, { price: eur(price || 150000, lang) }), wa)}">${ICON.wa}<span>${t(lang, "calc.ask")}</span></a>
  </div>
</div>`;
}

// Agency identity required online by law 9/2022 art. 5.2 (legal name, NIPT, broker and certificate number).
// The agency's logo mark (globe and house), cut out of the logo the client sent: a 120 px file shown at 40 px.
const logoImg = (p) => `<img class="brand-mark" src="${rel(p, "images/brand/logo-mark.webp", false)}" alt="" width="40" height="40">`;

function legalLine(lang, { html = true } = {}) {
  const ph = (v, label) => v ? (html ? esc(v) : v) : PREVIEW ? `[${label}]` : "";
  const parts = [];
  const name = ph(SITE.legalName, lang === "sq" ? "Emri ligjor i shoqërisë" : "Legal company name");
  if (name) parts.push(name);
  const nipt = ph(SITE.nipt, "L00000000A");
  if (nipt) parts.push(`${t(lang, "footer.nipt")} ${nipt}`);
  const broker = ph(SITE.brokerName, lang === "sq" ? "Emri i ndërmjetësit" : "Broker name");
  const cert = ph(SITE.brokerCertificate, "000");
  if (broker || cert) parts.push(`${t(lang, "footer.broker")}${broker ? `: ${broker}` : ""}${cert ? `, ${t(lang, "footer.cert")} ${cert}` : ""}`);
  return parts.join(" · ");
}

function contactBlock(lang) {
  const legal = legalLine(lang);
  return `<section class="section contact" id="contact" aria-labelledby="contact-h">
  <div class="wrap">
    <div class="section-head">
      <div class="title-block"><span class="eyebrow on-navy">${t(lang, "contact.eyebrow")}</span><h2 id="contact-h">${t(lang, "contact.title")}</h2></div>
      <p class="lead">${t(lang, SITE.instagram || SITE.facebook ? "contact.lead" : "contact.leadNoSocial")}</p>
    </div>
    <div class="socials">
      <a class="social" href="${waLink(t(lang, "wa.general"))}" target="_blank" rel="noopener" data-track="whatsapp">${ICON.wa}<div><b>WhatsApp</b><span>${esc(waDisplay(SITE.whatsapp))}</span></div></a>
      ${SITE.instagram ? `<a class="social" href="${esc(SITE.instagram)}" target="_blank" rel="noopener me" data-track="instagram">${ICON.ig}<div><b>Instagram</b><span>${esc(handleOf(SITE.instagram))}</span></div></a>` : ""}
      ${SITE.facebook ? `<a class="social" href="${esc(SITE.facebook)}" target="_blank" rel="noopener me" data-track="facebook">${ICON.fb}<div><b>Facebook</b><span>${esc(SITE.facebook.replace(/^https?:\/\/(www\.)?/, ""))}</span></div></a>` : ""}
    </div>
    <address class="contact-meta">
      <div>${t(lang, "contact.phone")}: <a href="${telHref(SITE.phoneDisplay)}" data-track="call"><b>${esc(SITE.phoneDisplay)}</b></a><button type="button" class="copy" data-copy="${esc(SITE.phoneDisplay)}">${t(lang, "copy")}</button></div>
      <div>${t(lang, "contact.email")}: <a href="mailto:${esc(SITE.email)}" data-track="email"><b>${esc(SITE.email)}</b></a></div>
      <div>${t(lang, "contact.office")}: <a href="${esc(OFFICE_MAP)}" target="_blank" rel="noopener" data-track="directions"><b>${esc(SITE.address)}</b></a></div>
      <div>${t(lang, "contact.hours")}: <b>${esc(SITE["hoursText_" + lang] || t(lang, "contact.hoursText"))}</b></div>
      ${SITE.gbpUrl ? `<div><a href="${esc(SITE.gbpUrl)}" target="_blank" rel="noopener" data-track="reviews"><b>${t(lang, "contact.reviews")} →</b></a></div>` : ""}
    </address>
    ${legal ? `<p class="legal-line">${legal}</p>` : ""}
  </div>
</section>`;
}

/* ------------------------------ layout ------------------------------ */
const CSP = [
  "default-src 'self'",
  "script-src 'self' https://www.googletagmanager.com https://connect.facebook.net",
  "style-src 'self'",
  "font-src 'self'",
  "img-src 'self' data: https://tile.openstreetmap.org https://i.ytimg.com https://www.facebook.com https://*.google-analytics.com https://*.googletagmanager.com",
  "connect-src 'self' https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com https://www.facebook.com https://connect.facebook.net",
  "frame-src https://www.openstreetmap.org https://www.youtube-nocookie.com",
  "object-src 'none'", "base-uri 'self'", "form-action 'self'",
].join("; ");

function layout({ lang, p, alt, key, title: pageTitle, description, image, jsonld = [], body, noindex = false, active = "", extraHead = "", wa = "", waNumber = SITE.whatsapp }) {
  // Like propTitle: drop the " | brand" suffix when the title would be cut in search results.
  const suffix = ` | ${SITE.brand}`;
  if (pageTitle.length > 65 && pageTitle.endsWith(suffix)) pageTitle = pageTitle.slice(0, -suffix.length);
  const other = lang === "sq" ? "en" : "sq";
  const og = image ? ogImg(image) : { url: absImg("/images/og-default.jpg"), sized: true };
  const hreflang = alt != null ? `
<link rel="alternate" hreflang="${lang}" href="${abs(p)}">
<link rel="alternate" hreflang="${other}" href="${abs(alt)}">
<link rel="alternate" hreflang="x-default" href="${abs(lang === "sq" ? p : alt)}">` : "";
  const home = R.home(lang);
  const nav = [
    ["latest", R.latest(lang), t(lang, "nav.latest"), "latest-link"],
    ["listings", home + "#listings", t(lang, "nav.listings")],
    ["zones", home + "#zones", t(lang, "nav.zones")],
    ["map", R.map(lang), t(lang, "nav.map")],
    ["calc", home + "#calculator", t(lang, "nav.calc")],
    ["articles", R.articles(lang), t(lang, "nav.articles")],
    ["about", R.about(lang), t(lang, "nav.about")],
    ["sell", R.sell(lang), t(lang, "nav.sell")],
  ].map(([k, to, label, cls]) => {
    const [target, hash] = to.split("#");
    // Section links stay on the page only on the home page itself; everywhere else they go to the home page.
    const href = hash ? (p === home && key !== "404" ? "#" + hash : rel(p, target) + "#" + hash) : rel(p, to);
    const cur = active === k ? (hash ? ' aria-current="true"' : ' aria-current="page"') : "";
    return `<a href="${href}"${cls ? ` class="${cls}"` : ""}${cur}>${cls ? '<span class="dot" aria-hidden="true"></span>' : ""}${label}</a>`;
  }).join("");
  const ld = jsonld.filter(Boolean).map((o) => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, "\\u003c")}</script>`).join("\n");
  const clientText = {
    results: t(lang, "results"), resultsOne: t(lang, "results.one"), copied: t(lang, "copied"), copy: t(lang, "copy"),
    sending: t(lang, "form.sending"), ok: t(lang, "form.ok"), err: t(lang, "form.err"), waForm: t(lang, "wa.form"), waFav: t(lang, "wa.fav"),
    invalidNumber: t(lang, "form.invalidNumber"), invalidPhone: t(lang, "form.invalidPhone"),
    perMonth: t(lang, "perMonth"), yrs: t(lang, "yrs"), monthly: t(lang, "calc.monthly"), gallery: t(lang, "prop.gallery"),
    more: t(lang, "list.more"), close: t(lang, "prop.close"), prev: t(lang, "prop.prev"), next: t(lang, "prop.next"),
    statNew: t(lang, "stat.new"), statNewOne: t(lang, "stat.new.one"),
    code: t(lang, "code"), noCode: t(lang, "search.noCode"), formPreview: t(lang, "form.preview"), lightbox: t(lang, "prop.fullscreen"),
  };
  const year = new Date().getFullYear();
  const legal = legalLine(lang);

  const head = `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
${PREVIEW ? "" : `<meta http-equiv="Content-Security-Policy" content="${CSP}">\n`}<title>${esc(pageTitle)}</title>
<meta name="description" content="${esc(description)}">
${noindex ? '<meta name="robots" content="noindex, follow">' : `<link rel="canonical" href="${abs(p)}">`}${noindex ? "" : hreflang}
<meta name="theme-color" content="#0F1A3E">
<meta property="og:type" content="${key === "prop" || key === "article" ? "article" : "website"}">
<meta property="og:site_name" content="${esc(FULL_NAME)}">
<meta property="og:title" content="${esc(pageTitle)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${abs(p)}">
<meta property="og:image" content="${esc(og.url)}">
${og.sized ? `<meta property="og:image:width" content="1200">\n<meta property="og:image:height" content="630">\n<meta property="og:image:type" content="image/jpeg">\n` : ""}<meta property="og:image:alt" content="${esc(pageTitle)}">
<meta property="og:locale" content="${T[lang].ogLocale}">
<meta property="og:locale:alternate" content="${T[other].ogLocale}">
<meta name="twitter:card" content="summary_large_image">
${SITE.googleSiteVerification ? `<meta name="google-site-verification" content="${esc(SITE.googleSiteVerification)}">` : ""}
<link rel="icon" href="${rel(p, "favicon.png", false)}" type="image/png" sizes="64x64">
<link rel="apple-touch-icon" href="${rel(p, "images/apple-touch-icon.png", false)}">
<link rel="manifest" href="${rel(p, "site.webmanifest", false)}">
${FONTS.map((f) => `<link rel="preload" href="${rel(p, f, false)}" as="font" type="font/woff2" crossorigin>`).join("\n")}
<link rel="stylesheet" href="${rel(p, "assets/style.css", false)}?v=${V.css}">
${extraHead}
${ld}`;

  const bodyHTML = `<a class="skip" href="#main">${t(lang, "skip")}</a>
<header class="top">
  <div class="wrap bar">
    <a class="brand" href="${rel(p, R.home(lang))}">${logoImg(p)}<span class="brand-name">${esc(SITE.brand)}<small>${esc((SITE.tagline || "Real Estate").toUpperCase())}</small></span><span class="sr-only"> – ${t(lang, "nav.home")}</span></a>
    <button class="menu-btn" type="button" aria-expanded="false" aria-controls="mainNav" aria-label="${t(lang, "nav.menu")}"><span></span><span></span><span></span></button>
    <nav class="main" id="mainNav" aria-label="${t(lang, "nav.menu")}">${nav}</nav>
    <div class="lang" role="group" aria-label="Language / Gjuha">
      ${["sq", "en"].map((L) => L === lang ? `<span class="on" aria-current="true">${L.toUpperCase()}</span>`
        : `<a href="${rel(p, alt ?? R.home(L))}" hreflang="${L}" lang="${L}" title="${T[L].langName}">${L.toUpperCase()}</a>`).join("")}
    </div>
  </div>
</header>
<main id="main" tabindex="-1">
${body}
</main>
${contactBlock(lang)}
<footer class="foot">
  <div class="wrap foot-grid">
    <div class="foot-brand"><a class="brand" href="${rel(p, R.home(lang))}">${logoImg(p)}<span class="brand-name">${esc(SITE.brand)}<small>${esc((SITE.tagline || "Real Estate").toUpperCase())}</small></span></a>
      <p>${t(lang, "hero.eyebrow")}. ${esc(SITE.address)}.</p></div>
    <nav aria-label="${t(lang, "nav.zones")}"><h2>${t(lang, "nav.zones")}</h2>
      <ul>${ZONES.map((g) => `<li class="grp"><a href="${rel(p, R.group(lang, g))}">${esc(g[lang])}</a></li>${g.areas.map((a) => `<li><a href="${rel(p, R.zone(lang, a.id))}">${esc(a[lang])}</a></li>`).join("")}`).join("")}</ul></nav>
    <nav aria-label="${t(lang, "footer.explore")}"><h2>${t(lang, "footer.explore")}</h2>
      <ul>
        <li><a href="${rel(p, R.latest(lang))}">${t(lang, "nav.latest")}</a></li>
        <li><a href="${relHash(p, R.home(lang) + "#listings")}">${t(lang, "nav.listings")}</a></li>
        <li><a href="${rel(p, R.map(lang))}">${t(lang, "nav.map")}</a></li>
        <li><a href="${relHash(p, R.home(lang) + "#calculator")}">${t(lang, "nav.calc")}</a></li>
        <li><a href="${rel(p, R.articles(lang))}">${t(lang, "nav.articles")}</a></li>
        <li><a href="${rel(p, R.about(lang))}">${t(lang, "nav.about")}</a></li>
        <li><a href="${rel(p, R.sell(lang))}">${t(lang, "nav.sell")}</a></li>
        ${TERMS ? `<li><a href="${rel(p, R.terms(lang))}">${t(lang, "terms.h1")}</a></li>` : ""}
        <li><a href="${rel(p, R.privacy(lang))}">${t(lang, "privacy.h1")}</a></li>
        ${HAS_TRACKERS ? `<li><button type="button" class="linkish" data-cookie-settings>${t(lang, "cookie.settings")}</button></li>` : ""}
      </ul></nav>
  </div>
  <div class="wrap foot-bottom"><span>© <span data-year>${year}</span> ${esc(FULL_NAME)}. ${t(lang, "footer.rights")}${legal ? `<br>${legal}` : ""}</span>
    <a href="${rel(p, alt ?? R.home(other))}" hreflang="${other}" lang="${other}">${T[lang].otherLang}</a></div>
  <a class="fab" href="${waLink(wa || t(lang, "wa.general"), waNumber)}" target="_blank" rel="noopener" aria-label="${t(lang, "wa.fab")}" data-track="whatsapp">${ICON.wa}</a>
</footer>
${HAS_TRACKERS ? `<div class="cookie" id="cookieBar" role="region" aria-label="${t(lang, "a11y.cookies")}" hidden>
  <p>${t(lang, "cookie.text")} <a href="${rel(p, R.privacy(lang))}">${t(lang, "cookie.more")}</a></p>
  <div class="cookie-opts">${SITE.googleAnalyticsId ? `<label><input type="checkbox" name="stats"> ${t(lang, "cookie.stats")}</label>` : ""}${SITE.metaPixelId ? `<label><input type="checkbox" name="ads"> ${t(lang, "cookie.ads")}</label>` : ""}</div>
  <div class="cookie-actions"><button type="button" class="btn-ghost small" data-consent="none">${t(lang, "cookie.rejectAll")}</button><button type="button" class="btn-ghost small" data-consent="save">${t(lang, "cookie.save")}</button><button type="button" class="btn-gold small" data-consent="all">${t(lang, "cookie.acceptAll")}</button></div>
</div>` : ""}
<p class="sr-only" role="status" id="srAnnounce"></p>
<script type="application/json" id="i18n">${JSON.stringify(clientText).replace(/</g, "\\u003c")}</script>
<script src="${rel(p, "assets/app.js", false)}?v=${V.js}" defer></script>`;

  const bodyAttrs = `data-lang="${lang}" data-wa="${esc(SITE.whatsapp)}" data-ga="${esc(SITE.googleAnalyticsId)}" data-pixel="${esc(SITE.metaPixelId)}" data-newdays="${RAW.newDays === "" || isNaN(Number(RAW.newDays)) || RAW.newDays == null ? 14 : Number(RAW.newDays)}"${PREVIEW ? ' data-preview="1"' : ""}`;
  // The preview host wraps its entry page in its own document, so that one page is written without the outer tags.
  if (PREVIEW && p === "") return `${head}\n<div class="page-root" ${bodyAttrs} lang="${lang}">\n${bodyHTML}\n</div>`;
  return `<!doctype html>
<html lang="${lang}">
<head>
${head}
</head>
<body ${bodyAttrs}>
${bodyHTML}
</body>
</html>
`;
}

/* ---------------------------- JSON-LD ---------------------------- */
const AGENT = {
  "@context": "https://schema.org", "@type": "RealEstateAgent", "@id": `${DOMAIN}/#agency`,
  name: FULL_NAME, legalName: SITE.legalName || undefined, taxID: SITE.nipt || undefined,
  url: `${DOMAIN}/`, logo: abs("images/apple-touch-icon.png"), image: abs("images/og-default.jpg"),
  telephone: SITE.phoneDisplay, email: SITE.email, priceRange: "€€",
  address: { "@type": "PostalAddress", streetAddress: SITE.streetAddress || SITE.address, addressLocality: SITE.city || "Tiranë", postalCode: SITE.postalCode || undefined, addressCountry: "AL" },
  geo: SITE.geo ? { "@type": "GeoCoordinates", latitude: SITE.geo.lat, longitude: SITE.geo.lng } : undefined,
  hasMap: OFFICE_MAP,
  openingHours: SITE.openingHours || undefined,
  areaServed: ZONES.flatMap((g) => g.areas.map((a) => ({ "@type": "Place", name: a.sq }))),
  sameAs: [SITE.instagram, SITE.facebook, SITE.gbpUrl].filter(Boolean),
  contactPoint: { "@type": "ContactPoint", telephone: SITE.phoneDisplay, contactType: "sales", availableLanguage: ["sq", "en"] },
};
const SELLER = { "@type": "RealEstateAgent", "@id": `${DOMAIN}/#agency`, name: AGENT.name, telephone: AGENT.telephone, url: AGENT.url };
const crumbs = (items) => ({ "@context": "https://schema.org", "@type": "BreadcrumbList",
  itemListElement: items.map(([name, p], i) => ({ "@type": "ListItem", position: i + 1, name, item: abs(p) })) });
const itemList = (list, lang) => ({ "@context": "https://schema.org", "@type": "ItemList",
  itemListElement: list.map((l, i) => ({ "@type": "ListItem", position: i + 1, url: abs(R.prop(lang, l)), name: title(l, lang) })) });
const SCHEMA_TYPE = { apartment: "Apartment", villa: "SingleFamilyResidence", office: "Place", land: "Place" };
function listingLD(l, lang) {
  const residential = l.type !== "land" && l.type !== "office";
  const geo = pubGeo(l);
  const feats = (l.features || []).filter((f) => FEATURES.includes(f));
  const place = {
    "@type": SCHEMA_TYPE[l.type], name: title(l, lang),
    address: { "@type": "PostalAddress", addressLocality: cityOf(l.zone, lang), addressRegion: AREAS[l.zone]?.region || undefined, addressCountry: "AL" },
    geo: geo ? { "@type": "GeoCoordinates", latitude: geo.lat, longitude: geo.lng } : undefined,
    amenityFeature: feats.length ? feats.map((f) => ({ "@type": "LocationFeatureSpecification", name: t(lang, "feat." + f), value: true })) : undefined,
  };
  if (isCityGroup(AREAS[l.zone].group)) place.containedInPlace = { "@type": "Place", name: zoneName(l.zone, lang) };
  if (residential) {
    if (l.year_built) place.yearBuilt = l.year_built;
    if (l.area) place.floorSize = { "@type": "QuantitativeValue", value: l.area, unitCode: "MTK" };
    if (l.beds) place.numberOfBedrooms = l.beds;
    if (l.baths) place.numberOfBathroomsTotal = l.baths;
    if (hasFloor(l)) place.floorLevel = String(l.floor);
  } else if (l.area) {
    place.additionalProperty = [{ "@type": "PropertyValue", name: l.type === "land" ? "lotSize" : "floorSize", value: l.area, unitCode: "MTK" }];
  }
  const imgs = (isClosed(l) ? l.images.slice(0, 1) : l.images).map(absImg).filter(Boolean);
  return { "@context": "https://schema.org", "@type": "RealEstateListing", "@id": abs(R.prop(lang, l)) + "#listing",
    name: title(l, lang), description: desc(l, lang), url: abs(R.prop(lang, l)), datePosted: l.added, dateModified: mod(l), inLanguage: lang,
    image: imgs.length ? imgs : undefined,
    offers: { "@type": "Offer", ...(hasPrice(l) ? { price: l.price, priceCurrency: "EUR" } : {}),
      availability: isClosed(l) ? "https://schema.org/SoldOut" : l.status === "reserved" ? "https://schema.org/LimitedAvailability" : "https://schema.org/InStock",
      businessFunction: l.deal === "rent" ? "http://purl.org/goodrelations/v1#LeaseOut" : "http://purl.org/goodrelations/v1#Sell",
      ...(l.deal === "rent" && hasPrice(l) ? { priceSpecification: { "@type": "UnitPriceSpecification", price: l.price, priceCurrency: "EUR", unitCode: "MON" } } : {}),
      seller: SELLER },
    about: place };
}

function testimonials(lang) {
  const list = ABOUT.testimonials || [];
  if (!list.length) return "";
  return `<section class="section reviews" aria-labelledby="rev-h">
  <div class="wrap">
    <div class="section-head"><div class="title-block"><span class="eyebrow">${t(lang, "about.eyebrow")}</span><h2 id="rev-h">${t(lang, "about.reviews")}</h2></div></div>
    <div class="quotes">${list.map((q) => `<figure class="quote"><blockquote><p>${esc(q[`text_${lang}`] || q.text_sq)}</p></blockquote>
      <figcaption><b>${esc(q.name)}</b><span>${esc(q[`place_${lang}`] || "")}</span></figcaption></figure>`).join("")}</div>
    ${ABOUT.sample ? `<p class="sample-note">${t(lang, "about.sampleNote")}</p>` : ""}
  </div>
</section>`;
}

/* ------------------------------ pages ------------------------------ */
const pages = []; // for the sitemap: { sq, en, lastmod }
const generated = new Set();

function pageHero(lang, p, crumbItems, eyebrow, h1, lead) {
  const nav = crumbItems.length ? `<nav class="crumbs" aria-label="${t(lang, "a11y.crumbs")}"><ol>${crumbItems.map(([name, to], i) =>
    i === crumbItems.length - 1 ? `<li aria-current="page">${esc(name)}</li>` : `<li><a href="${relHash(p, to)}">${esc(name)}</a></li>`).join("")}</ol></nav>` : "";
  return `<section class="page-hero"><div class="wrap">${nav}${eyebrow ? `<span class="eyebrow on-navy">${eyebrow}</span>` : ""}<h1>${h1}</h1>${lead ? `<p class="sub">${lead}</p>` : ""}</div></section>`;
}

function emitBoth(key, build, lastmod) {
  const paths = {};
  for (const lang of LANGS) paths[lang] = build.path(lang);
  for (const lang of LANGS) {
    const other = lang === "sq" ? "en" : "sq";
    const pg = build.page(lang, paths[lang]);
    const html = layout({ lang, p: paths[lang], alt: paths[other], key, noindex: !!build.noindex, ...pg });
    write(paths[lang] + "index.html", html);
    generated.add(paths[lang]);
  }
  if (!build.noindex) pages.push({ ...paths, lastmod });
}
const newest = (...dates) => dates.flat().filter(Boolean).sort().pop();
const SITE_MOD = newest(LISTINGS.map(mod), ARTICLES.map((a) => a.updated || a.date));
const groupOf = (l) => AREAS[l.zone]?.group.id;
const DEAL_HUBS = new Set(); // "groupId:deal" pages that exist
for (const g of ZONES) for (const deal of ["sale", "rent"]) if (ACTIVE.some((l) => groupOf(l) === g.id && l.deal === deal)) DEAL_HUBS.add(`${g.id}:${deal}`);
const dealCount = (g, deal) => ACTIVE.filter((l) => groupOf(l) === g.id && l.deal === deal).length;
const dealLinks = (p, g, lang) => ["sale", "rent"].filter((d) => DEAL_HUBS.has(`${g.id}:${d}`))
  .map((d) => `<a class="deal-link" href="${rel(p, R.groupDeal(lang, g, d))}">${t(lang, "deal." + d)} <span>(${dealCount(g, d)})</span></a>`).join("");

// Home
emitBoth("home", {
  path: R.home,
  page: (lang, p) => {
    const latest = ACTIVE.slice(0, 3);
    const weekNew = ACTIVE.filter((l) => (Date.now() - new Date(l.added)) / 864e5 <= 7).length;
    return {
      title: t(lang, "home.title"), description: t(lang, "home.desc"),
      jsonld: [AGENT, { "@context": "https://schema.org", "@type": "WebSite", name: FULL_NAME, url: abs(R.home(lang)), inLanguage: lang, publisher: { "@id": `${DOMAIN}/#agency` } }, itemList(ACTIVE, lang)],
      body: `<section class="hero">
  <svg class="hero-lines" viewBox="0 0 520 320" aria-hidden="true" fill="none" stroke="#C9A55A" stroke-width="1.2"><path d="M20 320V140h70v180M90 320V80h90v240M180 320V180h60v140M240 320V40h110v280M350 320V120h80v200M430 320V200h70v120"/><path d="M260 60h70M260 90h70M260 120h70M260 150h70M260 180h70M260 210h70M260 240h70M260 270h70M110 110h50M110 140h50M110 170h50M110 200h50M110 230h50M110 260h50M370 150h40M370 180h40M370 210h40M370 240h40M370 270h40"/></svg>
  <div class="wrap">
    <span class="eyebrow on-navy">${t(lang, "hero.eyebrow")}</span>
    <h1>${t(lang, "hero.title")}</h1>
    <p class="sub">${t(lang, "hero.sub")}</p>
    <form class="search" data-search role="search" method="get" action="#listings">
      <label><span>${t(lang, "f.deal")}</span><select name="deal"><option value="all">${t(lang, "f.dealAny")}</option><option value="sale">${t(lang, "deal.sale")}</option><option value="rent">${t(lang, "deal.rent")}</option></select></label>
      <label><span>${t(lang, "f.zone")}</span><select name="zone">${zoneOptions(lang)}</select></label>
      <label><span>${t(lang, "f.type")}</span><select name="type"><option value="all">${t(lang, "f.allTypes")}</option>${TYPES.map((k) => `<option value="${k}">${t(lang, "type." + k)}</option>`).join("")}</select></label>
      <label class="code"><span>${t(lang, "f.code")}</span><input name="code" inputmode="numeric" autocomplete="off" placeholder="${t(lang, "f.codePh")}"></label>
      <button type="submit">${t(lang, "f.search")}</button>
    </form>
    <p class="search-msg" data-search-msg role="status"></p>
    <div class="hero-stats">
      <div><b>${ACTIVE.length}</b><span>${tn(lang, "stat.listings", ACTIVE.length)}</span></div>
      <div><b>${Object.keys(AREAS).length}</b><span>${tn(lang, "stat.zones", Object.keys(AREAS).length)}</span></div>
      <div data-newstat hidden><b data-newcount data-dates="${ACTIVE.map((l) => l.added).join(",")}">${weekNew}</b><span data-newlabel>${tn(lang, "stat.new", weekNew)}</span></div>
    </div>
  </div>
</section>
<section class="section latest" id="latest" aria-labelledby="latest-h">
  <div class="wrap">
    <div class="section-head">
      <div class="title-block"><span class="eyebrow">${t(lang, "latest.eyebrow")}</span><h2 id="latest-h">${t(lang, "latest.title")}</h2></div>
      <a class="more-link" href="${rel(p, R.latest(lang))}">${t(lang, "latest.all")}</a>
    </div>
    <div class="latest-row">${latest.map((l, i) => card(p, l, lang, { big: i === 0 })).join("")}</div>
  </div>
</section>
<section class="section" id="zones" aria-labelledby="zones-h">
  <div class="wrap">
    <div class="section-head">
      <div class="title-block"><span class="eyebrow">${t(lang, "zones.eyebrow")}</span><h2 id="zones-h">${t(lang, "zones.title")}</h2></div>
      <p class="lead">${t(lang, "zones.lead")}</p>
    </div>
    ${ZONES.map((g) => `<div class="zone-group"><div class="zone-group-head"><h3><a href="${rel(p, R.group(lang, g))}">${esc(g[lang])}</a><small>${g.areas.length} ${tn(lang, "stat.zones", g.areas.length)}</small></h3><div class="deal-links">${dealLinks(p, g, lang)}</div></div><div class="zones">${g.areas.map((a) => {
      const n = ACTIVE.filter((l) => l.zone === a.id).length;
      return `<a class="zone-tile" href="${rel(p, R.zone(lang, a.id))}"><b>${esc(a[lang])}</b><span>${tn(lang, "results", n)}</span><span class="arrow" aria-hidden="true">→</span></a>`;
    }).join("")}</div></div>`).join("")}
  </div>
</section>
<section class="section pt0" id="listings" aria-labelledby="list-h">
  <div class="wrap">
    <div class="section-head"><div class="title-block"><span class="eyebrow">${t(lang, "list.eyebrow")}</span><h2 id="list-h" tabindex="-1">${t(lang, "list.title")}</h2></div>
      <a class="more-link" href="${rel(p, R.map(lang))}">${t(lang, "map.see")}</a></div>
    ${filterBar(lang)}
    ${listGrid(p, ACTIVE, lang)}
  </div>
</section>
<section class="section pt0" id="calculator" aria-labelledby="calc-h">
  <div class="wrap">
    <div class="section-head">
      <div class="title-block"><span class="eyebrow">${t(lang, "calc.eyebrow")}</span><h2 id="calc-h">${t(lang, "calc.title")}</h2></div>
      <p class="lead">${t(lang, "calc.lead")}</p>
    </div>
    ${calculator(lang)}
  </div>
</section>
${CLOSED.length ? `<section class="section results" aria-labelledby="closed-h">
  <div class="wrap">
    <div class="section-head">
      <div class="title-block"><span class="eyebrow">${t(lang, "closed.eyebrow")}</span><h2 id="closed-h">${t(lang, "closed.title")}</h2></div>
      <p class="lead">${t(lang, "closed.lead")}</p>
    </div>
    <div class="grid">${CLOSED.slice(0, 4).map((l) => card(p, l, lang)).join("")}</div>
  </div>
</section>` : ""}
${testimonials(lang)}
${ARTICLES.length ? `<section class="section" aria-labelledby="guides-h">
  <div class="wrap">
    <div class="section-head">
      <div class="title-block"><span class="eyebrow">${t(lang, "art.eyebrow")}</span><h2 id="guides-h">${t(lang, "art.h1")}</h2></div>
      <a class="more-link" href="${rel(p, R.articles(lang))}">${t(lang, "art.all")}</a>
    </div>
    <div class="art-grid">${ARTICLES.slice(0, 3).map((a) => articleCard(p, a, lang)).join("")}</div>
  </div>
</section>` : ""}`,
    };
  },
}, SITE_MOD);

// Latest
function groupByMonth(list, lang) {
  const m = new Map();
  for (const l of list) { const d = new Date(l.added); const k = `${T[lang].months[d.getUTCMonth()]} ${d.getUTCFullYear()}`; if (!m.has(k)) m.set(k, []); m.get(k).push(l); }
  return [...m.entries()].map(([k, v]) => [k.charAt(0).toUpperCase() + k.slice(1), v]);
}
emitBoth("latest", {
  path: R.latest,
  page: (lang, p) => ({
    title: t(lang, "latest.pageTitle"), description: t(lang, "latest.pageDesc"), active: "latest",
    jsonld: [crumbs([[t(lang, "nav.home"), R.home(lang)], [t(lang, "latest.title"), p]]), itemList(ACTIVE, lang)],
    body: `${pageHero(lang, p, [[t(lang, "nav.home"), R.home(lang)], [t(lang, "latest.title"), p]], t(lang, "latest.eyebrow"), t(lang, "latest.h1"), t(lang, "latest.lead"))}
<section class="section"><div class="wrap">
  <ol class="timeline">${groupByMonth(ACTIVE, lang).map(([label, list], gi) => `<li><h2 class="month">${label}</h2><div class="grid">${list.map((l, i) => card(p, l, lang, { eager: gi === 0 && i === 0 })).join("")}</div></li>`).join("")}</ol>
</div></section>`,
  }),
}, SITE_MOD);

// Tirana / coast hub pages, and "for sale / for rent in Tirana" pages
for (const g of ZONES) {
  const list = ACTIVE.filter((l) => groupOf(l) === g.id);
  const closed = CLOSED.filter((l) => groupOf(l) === g.id);
  const lastmod = newest(list.map(mod), closed.map(mod)) || SITE_MOD;
  const trail = (lang, p) => [[t(lang, "nav.home"), R.home(lang)], [g[lang], p]];
  emitBoth("group", {
    path: (lang) => R.group(lang, g),
    noindex: !list.length,
    page: (lang, p) => {
      const inPl = inGroup(g, lang);
      return {
        title: t(lang, "hub.pageTitle", { inPlace: inPl }), active: "zones", image: list[0]?.images[0],
        description: list.length ? t(lang, "hub.pageDesc", { n: list.length, inPlace: inPl, types: typesText(list, lang) }) : t(lang, "zone.pageDescEmpty", { inPlace: inPl }),
        jsonld: [crumbs(trail(lang, p)), list.length ? itemList(list, lang) : null],
        body: `${pageHero(lang, p, trail(lang, p), t(lang, "nav.zones"), esc(t(lang, "hub.h1", { inPlace: inPl })), esc(g[`intro_${lang}`] || ""))}
<section class="section"><div class="wrap">
  <div class="deal-links big">${dealLinks(p, g, lang)}</div>
  <h2 class="sub-h">${t(lang, "hub.zones")}</h2>
  <div class="zones">${g.areas.map((a) => `<a class="zone-tile" href="${rel(p, R.zone(lang, a.id))}"><b>${esc(a[lang])}</b><span>${tn(lang, "results", ACTIVE.filter((l) => l.zone === a.id).length)}</span><span class="arrow" aria-hidden="true">→</span></a>`).join("")}</div>
  ${list.length ? `<h2 class="sub-h">${esc(t(lang, "hub.all", { inPlace: inPl }))}</h2>${filterBar(lang, { groups: [g] })}${listGrid(p, list, lang)}`
    : `<div class="empty"><p>${esc(t(lang, "zone.empty", { inPlace: inPl }))}</p><a class="btn-gold" target="_blank" rel="noopener" data-track="whatsapp" href="${waLink(t(lang, "wa.zone", { inPlace: inPl }))}">${ICON.wa}<span>${t(lang, "wa.cta")}</span></a></div>`}
  ${closed.length ? `<h2 class="sub-h">${t(lang, "closed.title")}</h2><div class="grid">${closed.slice(0, 4).map((l) => card(p, l, lang)).join("")}</div>` : ""}
</div></section>`,
      };
    },
  }, lastmod);
  for (const deal of ["sale", "rent"]) {
    if (!DEAL_HUBS.has(`${g.id}:${deal}`)) continue;
    const dl = list.filter((l) => l.deal === deal);
    emitBoth("groupDeal", {
      path: (lang) => R.groupDeal(lang, g, deal),
      noindex: dl.length < 2, // a page with one listing is too thin to be worth indexing
      page: (lang, p) => {
        const inPl = inGroup(g, lang);
        const h1 = t(lang, `hub.${deal}.h1`, { inPlace: inPl });
        const tr = [[t(lang, "nav.home"), R.home(lang)], [g[lang], R.group(lang, g)], [h1, p]];
        const otherDeal = deal === "sale" ? "rent" : "sale";
        return {
          title: t(lang, `hub.${deal}.pageTitle`, { inPlace: inPl }), active: "listings", image: dl[0]?.images[0],
          description: t(lang, `hub.${deal}.pageDesc`, { n: dl.length, inPlace: inPl, types: typesText(dl, lang) }),
          jsonld: [crumbs(tr), itemList(dl, lang)],
          body: `${pageHero(lang, p, tr, esc(g[lang]), esc(h1), esc(g[`intro_${lang}`] || ""))}
<section class="section"><div class="wrap">
  <h2 class="sub-h first">${tn(lang, "results", dl.length)}</h2>
  ${filterBar(lang, { groups: [g], deal: false })}${listGrid(p, dl, lang, { eagerFirst: true })}
  <div class="deal-links">${DEAL_HUBS.has(`${g.id}:${otherDeal}`) ? `<a class="deal-link" href="${rel(p, R.groupDeal(lang, g, otherDeal))}">${esc(t(lang, `hub.${otherDeal}.h1`, { inPlace: inPl }))} →</a>` : ""}<a class="deal-link" href="${rel(p, R.group(lang, g))}">${esc(t(lang, "hub.all", { inPlace: inPl }))} →</a></div>
</div></section>`,
        };
      },
    }, newest(dl.map(mod)));
  }
}

// Zones
for (const a of Object.values(AREAS)) {
  const list = ACTIVE.filter((l) => l.zone === a.id);
  const closed = CLOSED.filter((l) => l.zone === a.id);
  const empty = !list.length;
  emitBoth("zone", {
    path: (lang) => R.zone(lang, a.id),
    noindex: empty,
    page: (lang, p) => {
      const inPl = inPlaceOf(a.id, lang);
      const others = [...a.group.areas.filter((x) => x.id !== a.id), ...Object.values(AREAS).filter((x) => x.group.id !== a.group.id)];
      const byType = TYPES.filter((k) => list.some((l) => l.type === k));
      const trail = [[t(lang, "nav.home"), R.home(lang)], [a.group[lang], R.group(lang, a.group)], [a[lang], p]];
      return {
        title: a[`title_${lang}`] || t(lang, "zone.pageTitle", { inPlace: inPl }), active: "zones",
        description: a[`desc_${lang}`] || (empty ? t(lang, "zone.pageDescEmpty", { inPlace: inPl }) : tn(lang, "zone.pageDesc", list.length, { inPlace: inPl, types: typesText(list, lang) })),
        image: list[0]?.images[0],
        jsonld: [crumbs(trail), empty ? null : itemList(list, lang)],
        body: `${pageHero(lang, p, trail, esc(a.group[lang]), esc(t(lang, "zone.h1", { inPlace: inPl })), esc(a[`intro_${lang}`] || ""))}
<section class="section"><div class="wrap">
  ${empty ? `<div class="empty"><p>${esc(t(lang, "zone.empty", { inPlace: inPl }))}</p><p>${t(lang, "zone.emptyCta")}</p><a class="btn-gold" target="_blank" rel="noopener" data-track="whatsapp" href="${waLink(t(lang, "wa.zone", { inPlace: inPl }))}">${ICON.wa}<span>${t(lang, "wa.cta")}</span></a></div>`
    : `<h2 class="sub-h first">${esc(t(lang, "zone.available", { inPlace: inPl }))}</h2>
  <p class="zone-summary">${byType.map((k) => `${t(lang, "typePlural." + k)}: <b>${list.filter((l) => l.type === k).length}</b>`).join(" · ")}</p>
  ${filterBar(lang, { zones: false })}${listGrid(p, list, lang, { eagerFirst: true })}`}
  ${closed.length ? `<h2 class="sub-h">${t(lang, "closed.zone")}</h2><div class="grid">${closed.map((l) => card(p, l, lang)).join("")}</div>` : ""}
  <h2 class="sub-h">${t(lang, "zone.other")}</h2>
  <div class="zone-links"><a class="grp" href="${rel(p, R.group(lang, a.group))}">${esc(a.group[lang])}</a>${others.map((x) => `<a href="${rel(p, R.zone(lang, x.id))}">${esc(x[lang])}</a>`).join("")}</div>
</div></section>`,
      };
    },
  }, newest(list.map(mod), closed.map(mod)) || SITE_MOD);
}

// Properties
function propTitle(l, lang) {
  const name = title(l, lang), zn = zoneName(l.zone, lang), place = placeOf(l.zone, lang);
  const brand = ` | ${SITE.brand}`;
  if (isClosed(l)) {
    const head = `${t(lang, "status." + l.status)}: ${name}`;
    return [head + ` – ${place}` + brand, head + ` – ${zn}` + brand, head + brand, head].find((x) => x.length <= 65) || head;
  }
  const head = /shit|qira|for sale|for rent|to let/i.test(name) ? name : `${t(lang, "deal.titlePrefix." + l.deal)}: ${name}`;
  const hasZone = name.toLowerCase().includes(zn.toLowerCase());
  const price = ` | ${priceText(l, lang)}`;
  const opts = hasZone ? [head + price + brand, head + price] : [head + ` – ${place}` + price + brand, head + ` – ${place}` + price, head + ` – ${zn}` + price, head + price];
  return opts.find((x) => x.length <= 65) || opts[opts.length - 1];
}
const xRows = (l, lang) => {
  const rows = [];
  const row = (k, v) => rows.push(`<div><dt>${t(lang, k)}</dt><dd>${v}</dd></div>`);
  if (l.area_net) row("x.areaNet", `${fmtNum(l.area_net, lang)} m²`);
  if (l.plot_area) row("x.plot", `${fmtNum(l.plot_area, lang)} m²`);
  const or = (l.orientation || []).filter((o) => ORIENT.includes(o));
  if (or.length) row("x.orientation", or.map((o) => t(lang, "orient." + o)).join(", "));
  if (l.sea_m) row("x.sea", l.sea_m >= 1000 ? `${(l.sea_m / 1000).toLocaleString(lang === "sq" ? "de-DE" : "en-GB")} km` : `${fmtNum(l.sea_m, lang)} m`);
  if (l.deal === "rent" && l.deposit_months) row("x.deposit", t(lang, "x.depositVal", { n: l.deposit_months }));
  if (l.deal === "rent" && l.min_term_months) row("x.minTerm", t(lang, "x.minTermVal", { n: l.min_term_months }));
  if (l.available_from && /^\d{4}-\d{2}-\d{2}/.test(l.available_from)) row("x.available", `<time datetime="${l.available_from.slice(0, 10)}">${fmtDate(l.available_from.slice(0, 10), lang)}</time>`);
  return rows.join("");
};
const PHONE_PATTERN = "[\\+0-9 \\(\\)\\-]{6,20}";
function visitForm(p, l, lang) {
  const req = '<span class="req" aria-hidden="true"> *</span>';
  return `<form class="form compact visit" name="vizita" method="POST" action="${rel(p, p)}" data-netlify="true" netlify-honeypot="bot-field" data-lead-form aria-labelledby="visit-h">
    <h2 class="side-h" id="visit-h">${t(lang, "visit.title")}</h2>
    <p class="muted">${t(lang, "visit.lead")}</p>
    <input type="hidden" name="form-name" value="vizita">
    <input type="hidden" name="listing" value="${l.id} – ${esc(title(l, lang))}">
    <input type="hidden" name="url" value="${esc(abs(R.prop(lang, l)))}">
    <input type="hidden" name="language" value="${lang}">
    <p hidden><label>Bot <input name="bot-field" tabindex="-1" autocomplete="off"></label></p>
    <label class="fld"><span>${t(lang, "form.name")}${req}</span><input name="name" required autocomplete="name"></label>
    <label class="fld"><span>${t(lang, "form.phone")}${req}</span><input name="phone" type="tel" required autocomplete="tel" inputmode="tel" pattern="${PHONE_PATTERN}"></label>
    <label class="fld"><span>${t(lang, "form.email")}</span><input name="email" type="email" autocomplete="email"></label>
    <label class="fld"><span>${t(lang, "visit.time")}</span><select name="time">${["any", "morning", "afternoon", "weekend"].map((k) => `<option value="${t(lang, "visit.time." + k)}">${t(lang, "visit.time." + k)}</option>`).join("")}</select></label>
    <label class="fld"><span>${t(lang, "visit.message")}</span><textarea name="message" rows="3"></textarea></label>
    <label class="consent"><input type="checkbox" name="consent" value="yes" required> <span>${t(lang, "form.consent")} <a href="${rel(p, R.privacy(lang))}">${t(lang, "form.privacy")}</a>.${req}</span></label>
    <button class="btn-gold block" type="submit">${t(lang, "visit.submit")}</button>
    <p class="form-status" role="status" data-status></p>
  </form>`;
}
for (const l of LISTINGS) {
  emitBoth("prop", {
    path: (lang) => R.prop(lang, l),
    page: (lang, p) => {
      const closed = isClosed(l);
      const name = title(l, lang);
      const zn = zoneName(l.zone, lang), place = placeOf(l.zone, lang), inPl = inPlaceOf(l.zone, lang);
      const url = abs(p);
      const ag = l.agent ? AGENTS[l.agent] : null;
      const waNumber = (ag && ag.whatsapp) || SITE.whatsapp, phone = (ag && ag.phone) || SITE.phoneDisplay;
      const similar = ACTIVE.filter((x) => x.id !== l.id).map((x) => ({ x, s: (x.zone === l.zone ? 2 : 0) + (x.type === l.type ? 1 : 0) + (x.deal === l.deal ? 1 : 0) }))
        .sort((a, b) => b.s - a.s).slice(0, 3).map((o) => o.x);
      // Closed listings keep a single photo and no map: the full dossier stays private once the deal is done.
      const images = closed ? l.images.slice(0, 1) : l.images;
      const n = images.length;
      images.forEach((i) => usedImages.add(i));
      const altOf = (i) => l.alts[i] || `${name} – ${t(lang, "prop.gallery", { i: i + 1, n })}`;
      const bigOf = (im) => imgSrc(p, im, 1600);
      const gallery = n ? `<div class="gallery" data-gallery>
  <div class="g-main">${img(p, images[0], altOf(0), { eager: true, sizes: "(max-width: 980px) calc(100vw - 40px), (max-width: 1200px) calc(100vw - 420px), 780px", widths: [640, 1000, 1200, 1600],
    attrs: ` data-big="${esc(bigOf(images[0]))}"` })}
    <button type="button" class="g-zoom" data-zoom aria-label="${t(lang, "prop.fullscreen")}">${ICON.expand}</button>
    ${n > 1 ? `<button type="button" class="g-nav prev" data-g="-1" aria-label="${t(lang, "prop.prev")}"><span aria-hidden="true">‹</span></button><button type="button" class="g-nav next" data-g="1" aria-label="${t(lang, "prop.next")}"><span aria-hidden="true">›</span></button><span class="g-count" aria-live="polite">1 / ${n}</span>` : ""}
  </div>
  ${n > 1 ? `<div class="g-thumbs">${images.map((im, i) => `<button type="button" data-i="${i}" aria-label="${esc(t(lang, "prop.gallery", { i: i + 1, n }))}"${i === 0 ? ' aria-current="true"' : ""} data-full="${esc(imgSrc(p, im, 1000))}"${USE_IMAGE_CDN ? ` data-srcset="${esc(srcsetOf(p, im, [640, 1000, 1200, 1600]))}"` : ""} data-big="${esc(bigOf(im))}" data-alt="${esc(altOf(i))}">${img(p, im, "", { widths: [240], sizes: "120px" }).replace(/ srcset="[^"]*" sizes="[^"]*"/, "")}</button>`).join("")}</div>` : ""}
</div>` : "";
      const geo = closed ? null : pubGeo(l);
      const gmaps = geo ? `https://www.google.com/maps/search/?api=1&query=${geo.lat},${geo.lng}` : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(zn + ", Albania")}`;
      const bbox = geo ? [geo.lng - 0.01, geo.lat - 0.006, geo.lng + 0.01, geo.lat + 0.006].map((v) => v.toFixed(5)).join(",") : "";
      const map = !geo ? "" : PREVIEW
        ? `<a class="map-static" href="${gmaps}" target="_blank" rel="noopener">${ICON.pin}<span>${esc(place)}</span><b>${t(lang, "prop.openMap")} →</b></a>`
        : `<div class="map" data-map-src="https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&amp;layer=mapnik" data-map-title="${t(lang, "prop.location")}: ${esc(zn)}"><a class="map-static" href="${gmaps}" target="_blank" rel="noopener" data-map-open>${ICON.pin}<span>${esc(place)}</span><b>${t(lang, "prop.showMap")}</b></a></div>
<p class="map-foot"><span class="muted">${t(lang, "prop.mapNote")}</span> <a href="${gmaps}" target="_blank" rel="noopener">${t(lang, "prop.openMap")} →</a></p>`;
      const waMsg = closed ? t(lang, "wa.propClosed", { title: name, id: l.id, inPlace: inPl, url }) : t(lang, "wa.prop", { title: name, id: l.id, url });
      const st = l.status && l.status !== "available" ? l.status : "";
      const feats = (l.features || []).filter((f) => FEATURES.includes(f));
      const yt = youtubeId(l.video);
      const vurl = String(l.video || "").trim().replace(/^(www\.)/i, "https://$1");
      if (l.video && !yt && !/^https:\/\/[^\s"'<>]+$/i.test(vurl)) warn(`Prona ${l.id}: linku i videos "${l.video}" nuk është i plotë (duhet të fillojë me https://); nuk u shfaq.`);
      const video = closed ? "" : yt && !PREVIEW
        ? `<button type="button" class="video-facade" data-yt="${yt}" aria-label="${t(lang, "prop.watch")}"><img src="https://i.ytimg.com/vi/${yt}/hqdefault.jpg" alt="" loading="lazy" width="480" height="360"><span class="play">${ICON.play}</span></button>`
        : yt || /^https:\/\/[^\s"'<>]+$/i.test(vurl) ? `<a class="video-link" href="${esc(yt ? `https://www.youtube.com/watch?v=${yt}` : vurl)}" target="_blank" rel="noopener"><span class="play">${ICON.play}</span><b>${t(lang, "prop.openVideo")} →</b></a>` : "";
      const stLabel = closed ? t(lang, "status." + l.status) : "";
      const metaDesc = closed
        ? `${stLabel} – ${t(lang, "type." + l.type)}, ${place}.${l.area ? ` ${fmtNum(l.area, lang)} m².` : ""} ${t(lang, "status.banner" + st.charAt(0).toUpperCase() + st.slice(1))}`
        : `${t(lang, "type." + l.type)} ${t(lang, "deal." + l.deal).toLowerCase()} – ${place}.${l.area ? ` ${fmtNum(l.area, lang)} m²` : ""}${l.beds ? `, ${l.beds} ${tn(lang, "beds", l.beds)}` : ""}. ${priceText(l, lang)}. ${desc(l, lang)}`;
      const metaDescShort = metaDesc.length > 158 ? metaDesc.slice(0, 157).replace(/\s+\S*$/, "") + "…" : metaDesc;
      const note = SITE[`commissionNote_${lang}`];
      const call = `<a href="${telHref(phone)}" data-track="call"><b>${esc(phone)}</b></a><button type="button" class="copy dark" data-copy="${esc(phone)}">${t(lang, "copy")}</button>`;
      return {
        title: propTitle(l, lang), description: metaDescShort.replace(/\s+/g, " ").trim(), image: images[0], active: "listings", wa: waMsg, waNumber,
        jsonld: [listingLD(l, lang), crumbs([[t(lang, "nav.home"), R.home(lang)], [zn, R.zone(lang, l.zone)], [name, p]])],
        body: `<div class="wrap prop-top">
  <nav class="crumbs light" aria-label="${t(lang, "a11y.crumbs")}"><ol><li><a href="${rel(p, R.home(lang))}">${t(lang, "nav.home")}</a></li><li><a href="${rel(p, R.zone(lang, l.zone))}">${esc(zn)}</a></li><li aria-current="page">${esc(name)}</li></ol></nav>
</div>
<article class="wrap prop" data-added="${l.added}">
  <div class="prop-main">
    ${st ? `<p class="status-banner ${st}">${t(lang, "status.banner" + st.charAt(0).toUpperCase() + st.slice(1))}</p>` : ""}
    ${gallery}
    <header class="prop-head">
      <span class="eyebrow">${esc(place)} · ${t(lang, "type." + l.type)} · ${t(lang, "deal." + l.deal)} ${st ? `<span class="badge status inline ${st}">${t(lang, "status." + st)}</span>` : `<span class="badge new inline" hidden>${t(lang, "badge.new")}</span>`}</span>
      <h1>${esc(name)}</h1>
      <div class="price big">${priceHTML(l, lang)}${ppmHTML(l, lang)}</div>
      ${note && !closed ? `<p class="commission-note">${esc(note)}</p>` : ""}
    </header>
    <section aria-labelledby="det-h"><h2 id="det-h" class="sub-h">${t(lang, "prop.details")}</h2>
      <dl class="facts">
        ${l.area ? `<div><dt>${t(lang, "area")}</dt><dd>${fmtNum(l.area, lang)} m²</dd></div>` : ""}
        ${ppm(l) ? `<div><dt>${t(lang, "ppm")}</dt><dd>${eur(ppm(l), lang)}/m²</dd></div>` : ""}
        ${l.beds ? `<div><dt>${t(lang, "beds")}</dt><dd>${l.beds}</dd></div>` : ""}
        ${l.baths ? `<div><dt>${t(lang, "baths")}</dt><dd>${l.baths}</dd></div>` : ""}
        ${hasFloor(l) ? `<div><dt>${t(lang, "floor")}</dt><dd>${floorShort(l, lang)}</dd></div>` : ""}
        ${xRows(l, lang)}
        ${l.deed ? `<div class="deed-${esc(l.deed)}"><dt>${t(lang, "deed.label")}</dt><dd>${t(lang, "deed." + l.deed)}</dd></div>` : ""}
        ${l.condition ? `<div><dt>${t(lang, "cond.label")}</dt><dd>${t(lang, "cond." + l.condition)}</dd></div>` : ""}
        ${l.year_built ? `<div><dt>${t(lang, "year")}</dt><dd>${esc(l.year_built)}</dd></div>` : ""}
        <div><dt>${t(lang, "f.zone")}</dt><dd><a href="${rel(p, R.zone(lang, l.zone))}">${esc(zn)}</a></dd></div>
        <div><dt>${t(lang, "code")}</dt><dd>${l.id}</dd></div>
        <div><dt>${t(lang, "prop.added")}</dt><dd><time datetime="${l.added}">${fmtDate(l.added, lang)}</time></dd></div>
      </dl>
    </section>
    ${feats.length ? `<section aria-labelledby="feat-h"><h2 id="feat-h" class="sub-h">${t(lang, "prop.features")}</h2>
      <ul class="features">${feats.map((f) => `<li>${ICON.check}${t(lang, "feat." + f)}</li>`).join("")}</ul></section>` : ""}
    <section aria-labelledby="desc-h"><h2 id="desc-h" class="sub-h">${t(lang, "prop.desc")}</h2>
      <div class="prose">${desc(l, lang).replace(/\r/g, "").split(/\n{2,}/).map((x) => x.trim()).filter(Boolean).map((para) => `<p>${esc(para).replace(/\n/g, "<br>")}</p>`).join("")}</div>
    </section>
    ${video ? `<section aria-labelledby="vid-h"><h2 id="vid-h" class="sub-h">${t(lang, "prop.video")}</h2>${video}</section>` : ""}
    ${map ? `<section aria-labelledby="loc-h"><h2 id="loc-h" class="sub-h">${t(lang, "prop.location")}</h2>${map}</section>` : ""}
    ${l.deal === "sale" && !closed && hasPrice(l) ? `<section aria-labelledby="pc-h" class="no-print"><h2 id="pc-h" class="sub-h">${t(lang, "calc.title")}</h2>${calculator(lang, l.price, { compact: true, id: l.id, wa: waNumber })}</section>` : ""}
    <p class="print-only">${esc(FULL_NAME)} · ${esc(phone)} · ${esc(SITE.email)} · ${t(lang, "code")} ${l.id} · ${esc(url)}</p>
  </div>
  <aside class="prop-side">
    <div class="side-box">
      <div class="price big">${priceHTML(l, lang)}</div>
      <p>${t(lang, closed ? "prop.closedAsk" : "prop.interested")}</p>
      <a class="btn-gold block" href="${waLink(waMsg, waNumber)}" target="_blank" rel="noopener" data-track="whatsapp">${ICON.wa}<span>${t(lang, "wa.cta")}</span></a>
      <p class="side-call">${t(lang, "prop.call")}: ${call}</p>
      ${ag ? `<div class="side-agent"><div class="avatar small">${ag.photo ? img(p, ag.photo, "", { widths: [120, 240], sizes: "56px" }) : `<span>${esc(String(ag.name || "").split(/\s+/).map((w) => w[0]).join("").slice(0, 2))}</span>`}</div>
        <div><span class="muted">${t(lang, "prop.agent")}</span><b>${esc(ag.name)}</b>${ag[`role_${lang}`] ? `<span class="muted">${esc(ag[`role_${lang}`])}</span>` : ""}${ag.languages ? `<span class="muted">${t(lang, "about.languages")}: ${esc(ag.languages)}</span>` : ""}${ag.certificate ? `<span class="muted">${t(lang, "about.cert")} ${esc(ag.certificate)}</span>` : ""}</div></div>` : ""}
      ${closed ? `<a class="more-link" href="${rel(p, R.zone(lang, l.zone))}">${esc(t(lang, "prop.seeZone", { inPlace: inPl }))}</a>` : favBtn(l, lang, "btn-ghost block fav-big")}
      <div class="share"><span>${t(lang, "prop.share")}:</span>
        <a href="https://wa.me/?text=${encodeURIComponent(name + " " + url)}" target="_blank" rel="noopener" aria-label="${esc(t(lang, "prop.shareOn", { net: "WhatsApp" }))}">${ICON.wa}</a>
        <a href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}" target="_blank" rel="noopener" aria-label="${esc(t(lang, "prop.shareOn", { net: "Facebook" }))}">${ICON.fb}</a>
        <button type="button" class="copy dark" data-copy="${esc(url)}">${t(lang, "prop.copyLink")}</button>
        <button type="button" class="copy dark" data-print>${t(lang, "prop.print")}</button>
      </div>
    </div>
    ${closed ? "" : visitForm(p, l, lang)}
  </aside>
</article>
<div class="prop-bar"><div class="price">${priceHTML(l, lang)}</div><a class="btn-gold" href="${waLink(waMsg, waNumber)}" target="_blank" rel="noopener" data-track="whatsapp">${ICON.wa}<span>WhatsApp</span></a><a class="btn-ghost" href="${telHref(phone)}" data-track="call">${ICON.phone}<span>${t(lang, "about.call")}</span></a></div>
${similar.length ? `<section class="section" aria-labelledby="sim-h"><div class="wrap"><h2 id="sim-h" class="sub-h">${t(lang, "prop.similar")}</h2><div class="grid">${similar.map((x) => card(p, x, lang)).join("")}</div></div></section>` : ""}`,
      };
    },
  }, mod(l));
}

// Sell / list your property
emitBoth("sell", {
  path: R.sell,
  page: (lang, p) => {
    const req = '<span class="req" aria-hidden="true"> *</span>';
    return {
      title: t(lang, "sell.pageTitle"), description: t(lang, "sell.pageDesc"), active: "sell",
      jsonld: [crumbs([[t(lang, "nav.home"), R.home(lang)], [t(lang, "sell.h1"), p]])],
      body: `${pageHero(lang, p, [[t(lang, "nav.home"), R.home(lang)], [t(lang, "nav.sell"), p]], t(lang, "sell.eyebrow"), t(lang, "sell.h1"), t(lang, "sell.lead"))}
<section class="section"><div class="wrap sell">
  <div>
    <ul class="checks">${T[lang]["sell.points"].map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
    ${TERMS ? `<p class="terms-link"><a class="more-link" href="${rel(p, R.terms(lang))}">${t(lang, "terms.link")} →</a></p>` : ""}
  </div>
  <form class="form" name="pronaret" method="POST" action="${rel(p, p)}" data-netlify="true" netlify-honeypot="bot-field" data-lead-form>
    <input type="hidden" name="form-name" value="pronaret">
    <input type="hidden" name="language" value="${lang}">
    <p hidden><label>Bot <input name="bot-field" tabindex="-1" autocomplete="off"></label></p>
    <p class="muted small">${t(lang, "form.reqNote")}</p>
    <div class="row">
      <label class="fld"><span>${t(lang, "form.name")}${req}</span><input id="fName" name="name" required autocomplete="name"></label>
      <label class="fld"><span>${t(lang, "form.phone")}${req}</span><input id="fPhone" name="phone" type="tel" required autocomplete="tel" inputmode="tel" pattern="${PHONE_PATTERN}"></label>
    </div>
    <label class="fld"><span>${t(lang, "form.email")}</span><input id="fEmail" name="email" type="email" autocomplete="email"></label>
    <fieldset class="fld"><legend>${t(lang, "form.deal")}</legend><div class="radios">
      <label><input type="radio" name="deal" value="sale"> ${t(lang, "form.dealSale")}</label>
      <label><input type="radio" name="deal" value="rent"> ${t(lang, "form.dealRent")}</label></div></fieldset>
    <div class="row">
      <label class="fld"><span>${t(lang, "form.type")}</span><select id="fType" name="type"><option value="">${t(lang, "form.choose")}</option>${TYPES.map((k) => `<option value="${k}">${t(lang, "type." + k)}</option>`).join("")}</select></label>
      <label class="fld"><span>${t(lang, "form.zone")}</span><select id="fZone" name="zone"><option value="">${t(lang, "form.choose")}</option>${ZONES.map((g) => `<optgroup label="${esc(g[lang])}">${g.areas.map((a) => `<option value="${esc(a.id)}">${esc(a[lang])}</option>`).join("")}</optgroup>`).join("")}<option value="other">${t(lang, "form.zoneOther")}</option></select></label>
    </div>
    <div class="row">
      <label class="fld"><span>${t(lang, "form.area")}</span><input id="fArea" name="area" type="number" min="1" step="any" inputmode="decimal"></label>
      <label class="fld"><span>${t(lang, "form.price")}</span><input id="fPrice" name="price" type="number" min="0" step="any" inputmode="numeric"></label>
    </div>
    <label class="fld"><span>${t(lang, "form.message")}</span><textarea id="fMsg" name="message" rows="4"></textarea></label>
    <label class="consent"><input type="checkbox" name="consent" value="yes" required> <span>${t(lang, "form.consent")} <a href="${rel(p, R.privacy(lang))}">${t(lang, "form.privacy")}</a>.${req}</span></label>
    <div class="form-actions">
      <button class="btn-gold" type="submit">${t(lang, "form.submit")}</button>
      <a class="btn-ghost" data-form-wa data-track="whatsapp" target="_blank" rel="noopener" href="${waLink(t(lang, "wa.form"))}">${ICON.wa}<span>${t(lang, "form.or")}</span></a>
    </div>
    <p class="form-status" role="status" data-status></p>
  </form>
</div></section>`,
    };
  },
});

// Privacy
emitBoth("privacy", {
  path: R.privacy,
  page: (lang, p) => ({
    title: t(lang, "privacy.pageTitle"), description: t(lang, "privacy.pageDesc"),
    jsonld: [crumbs([[t(lang, "nav.home"), R.home(lang)], [t(lang, "privacy.h1"), p]])],
    body: `${pageHero(lang, p, [[t(lang, "nav.home"), R.home(lang)], [t(lang, "privacy.h1"), p]], "", t(lang, "privacy.h1"), "")}
<section class="section"><div class="wrap"><div class="prose legal">${privacyHTML(SITE, lang, { ga: !!SITE.googleAnalyticsId, pixel: !!SITE.metaPixelId })
  .replace("{date}", `<time datetime="${PRIVACY_DATE}">${fmtDate(PRIVACY_DATE, lang)}</time>`)}</div></div></section>`,
  }),
}, PRIVACY_DATE);

// Terms and fees (law 9/2022 art. 14: brokers publish their general conditions and fees)
if (TERMS) emitBoth("terms", {
  path: R.terms,
  page: (lang, p) => ({
    title: t(lang, "terms.pageTitle"), description: t(lang, "terms.pageDesc"),
    jsonld: [crumbs([[t(lang, "nav.home"), R.home(lang)], [t(lang, "terms.h1"), p]])],
    body: `${pageHero(lang, p, [[t(lang, "nav.home"), R.home(lang)], [t(lang, "terms.h1"), p]], "", t(lang, "terms.h1"), "")}
<section class="section"><div class="wrap"><div class="prose legal article">${md(TERMS[`body_${lang}`] || TERMS.body_sq, p)}
  ${TERMS.sample ? `<p class="sample-note">${t(lang, "terms.sampleNote")}</p>` : ""}
  ${TERMS.updated ? `<p class="muted">${t(lang, "art.updated", { date: `<time datetime="${esc(TERMS.updated)}">${fmtDate(okDate(TERMS.updated, "kushtet"), lang)}</time>` })}</p>` : ""}</div></div></section>`,
  }),
}, TERMS.updated ? okDate(TERMS.updated, "kushtet") : undefined);

// Map
function shortPrice(l, lang) {
  if (!hasPrice(l)) return "?";
  const n = l.price;
  if (l.deal === "rent") return "€" + fmtNum(n, lang) + t(lang, "map.perMonthShort");
  const k = Math.round(n / 1000);
  return k >= 1000 ? "€" + (n / 1e6).toFixed(1).replace(".", lang === "sq" ? "," : ".") + "M" : "€" + k + "k";
}
emitBoth("map", {
  path: R.map,
  page: (lang, p) => {
    const pts = ACTIVE.filter((l) => pubGeo(l)).map((l) => {
      const g = pubGeo(l);
      return { lat: g.lat, lng: g.lng, g: groupOf(l) || "", d: l.deal, t: title(l, lang), pr: priceText(l, lang), short: shortPrice(l, lang),
        u: rel(p, R.prop(lang, l)), i: l.images[0] ? imgSrc(p, l.images[0], 480) : "", z: placeOf(l.zone, lang) };
    });
    const chips = (attr, items) => items.map(([v, label], i) => `<button type="button" class="chip" ${attr}="${esc(v)}" aria-pressed="${i === 0}">${esc(label)}</button>`).join("");
    return {
      title: t(lang, "map.pageTitle"), description: t(lang, "map.pageDesc"), active: "map",
      extraHead: PREVIEW ? "" : `<link rel="stylesheet" href="${rel(p, LEAFLET + "leaflet.css", false)}">\n<link rel="stylesheet" href="${rel(p, CLUSTER + "MarkerCluster.css", false)}">`,
      jsonld: [crumbs([[t(lang, "nav.home"), R.home(lang)], [t(lang, "map.h1"), p]]), itemList(ACTIVE, lang)],
      body: `${pageHero(lang, p, [[t(lang, "nav.home"), R.home(lang)], [t(lang, "map.h1"), p]], t(lang, "nav.map"), t(lang, "map.h1"), PREVIEW ? t(lang, "map.preview") : t(lang, "map.lead"))}
<section class="section map-section"><div class="wrap">
  ${PREVIEW ? "" : `<div class="map-tools"><div class="chip-group" role="group" aria-label="${t(lang, "map.filterZone")}">${chips("data-mapgroup", [["all", t(lang, "map.all")], ...ZONES.map((g) => [g.id, g[lang]])])}</div>
    <span class="sep"></span><div class="chip-group" role="group" aria-label="${t(lang, "map.filterDeal")}">${chips("data-mapdeal", [["all", t(lang, "f.any")], ["sale", t(lang, "deal.sale")], ["rent", t(lang, "deal.rent")]])}</div></div>
  <div id="propMap" class="prop-map" role="region" aria-label="${t(lang, "map.region")}"></div>
  <script type="application/json" id="mapData">${JSON.stringify(pts).replace(/</g, "\\u003c")}</script>
  <script src="${rel(p, LEAFLET + "leaflet.js", false)}" defer></script>
  <script src="${rel(p, CLUSTER + "leaflet.markercluster.js", false)}" defer></script>`}
  <h2 class="sub-h">${t(lang, "map.list")}</h2>
  ${ZONES.map((g) => { const inG = ACTIVE.filter((l) => groupOf(l) === g.id); return inG.length ? `<h3 class="month">${esc(g[lang])}</h3><div class="grid">${inG.map((l) => card(p, l, lang)).join("")}</div>` : ""; }).join("")}
</div></section>`,
    };
  },
}, SITE_MOD);

// About
emitBoth("about", {
  path: R.about,
  page: (lang, p) => ({
    title: t(lang, "about.pageTitle"), description: t(lang, "about.pageDesc"), active: "about",
    jsonld: [AGENT, crumbs([[t(lang, "nav.home"), R.home(lang)], [t(lang, "nav.about"), p]])],
    body: `${pageHero(lang, p, [[t(lang, "nav.home"), R.home(lang)], [t(lang, "nav.about"), p]], t(lang, "about.eyebrow"), t(lang, "about.h1"), esc(ABOUT[`intro_${lang}`] || ""))}
<section class="section"><div class="wrap">
  <div class="about-stats">${(ABOUT.stats || []).map((s) => `<div><b>${esc(s.value)}</b><span>${esc(s[lang])}</span></div>`).join("")}</div>
  <h2 class="sub-h">${t(lang, "about.values")}</h2>
  <div class="values">${(ABOUT.values || []).map((v) => `<div class="value"><h3>${esc(v[`title_${lang}`])}</h3><p>${esc(v[`text_${lang}`])}</p></div>`).join("")}</div>
  <h2 class="sub-h">${t(lang, "about.team")}</h2>
  <div class="team">${ABOUT.team.map((m) => `<div class="agent">
    <div class="avatar">${m.photo ? img(p, m.photo, m.name, { widths: [240, 480], sizes: "160px" }) : `<span>${esc(String(m.name || "").split(/\s+/).map((w) => w[0]).join("").slice(0, 2))}</span>`}</div>
    <div class="agent-body"><h3>${esc(m.name)}</h3><p class="role">${esc(m[`role_${lang}`] || "")}</p>
    ${m.languages ? `<p class="langs">${t(lang, "about.languages")}: ${esc(m.languages)}</p>` : ""}
    ${m.certificate ? `<p class="langs">${t(lang, "about.cert")} ${esc(m.certificate)}</p>` : ""}
    <div class="agent-actions">${m.whatsapp ? `<a class="btn-gold small" href="${waLink(t(lang, "wa.general"), m.whatsapp)}" target="_blank" rel="noopener" data-track="whatsapp">${ICON.wa}<span>WhatsApp</span></a>` : ""}
    ${m.phone ? `<span class="agent-phone"><a href="${telHref(m.phone)}" data-track="call">${esc(m.phone)}</a><button type="button" class="copy dark" data-copy="${esc(m.phone)}">${t(lang, "copy")}</button></span>` : ""}</div></div>
  </div>`).join("")}</div>
  ${ABOUT.sample ? `<p class="sample-note">${t(lang, "about.sampleNote")}</p>` : ""}
</div></section>
${testimonials(lang)}`,
  }),
}, ABOUT.updated ? okDate(ABOUT.updated, "rreth nesh") : undefined);

// Articles index
emitBoth("articles", {
  path: R.articles,
  page: (lang, p) => ({
    title: t(lang, "art.pageTitle"), description: t(lang, "art.pageDesc"), active: "articles",
    jsonld: [crumbs([[t(lang, "nav.home"), R.home(lang)], [t(lang, "art.h1"), p]]), { "@context": "https://schema.org", "@type": "ItemList",
      itemListElement: ARTICLES.map((a, i) => ({ "@type": "ListItem", position: i + 1, url: abs(R.article(lang, a)), name: artTitle(a, lang) })) }],
    body: `${pageHero(lang, p, [[t(lang, "nav.home"), R.home(lang)], [t(lang, "art.h1"), p]], t(lang, "art.eyebrow"), t(lang, "art.h1"), t(lang, "art.lead"))}
<section class="section"><div class="wrap"><h2 class="sub-h first">${t(lang, "art.listH2")}</h2><div class="art-grid">${ARTICLES.map((a, i) => articleCard(p, a, lang, { eager: i === 0 })).join("")}</div></div></section>`,
  }),
}, newest(ARTICLES.map((a) => a.updated || a.date)));

// Article pages
for (const a of ARTICLES) {
  emitBoth("article", {
    path: (lang) => R.article(lang, a),
    page: (lang, p) => {
      const name = artTitle(a, lang), body = a[`body_${lang}`] || a.body_sq;
      const others = ARTICLES.filter((x) => x !== a).slice(0, 3);
      return {
        title: `${name} | ${SITE.brand}`.length <= 65 ? `${name} | ${SITE.brand}` : name, description: a[`excerpt_${lang}`] || "", image: a.image,
        extraHead: `<meta property="article:published_time" content="${esc(a.date)}">${a.updated ? `\n<meta property="article:modified_time" content="${esc(a.updated)}">` : ""}`,
        jsonld: [{ "@context": "https://schema.org", "@type": "BlogPosting", headline: name, description: a[`excerpt_${lang}`] || "", inLanguage: lang,
          datePublished: a.date, dateModified: a.updated || a.date, image: a.image && absImg(a.image) ? [absImg(a.image)] : undefined, mainEntityOfPage: abs(p),
          author: { "@id": `${DOMAIN}/#agency` }, publisher: { "@id": `${DOMAIN}/#agency` } },
          AGENT, crumbs([[t(lang, "nav.home"), R.home(lang)], [t(lang, "art.h1"), R.articles(lang)], [name, p]])],
        body: `${pageHero(lang, p, [[t(lang, "nav.home"), R.home(lang)], [t(lang, "art.h1"), R.articles(lang)], [name, p]], `<time datetime="${esc(a.date)}">${fmtDate(a.date, lang)}</time>${a.updated && a.updated !== a.date ? ` · ${t(lang, "art.updated", { date: `<time datetime="${esc(a.updated)}">${fmtDate(a.updated, lang)}</time>` })}` : ""} · ${t(lang, "art.min", { n: readMinutes(body) })}`, esc(name), esc(a[`excerpt_${lang}`] || ""))}
<section class="section"><div class="wrap article-wrap">
  <article class="prose article">${a.image ? `<div class="art-hero">${img(p, a.image, name, { eager: true, widths: [640, 1000, 1400], sizes: "(max-width: 760px) calc(100vw - 40px), 720px" })}</div>` : ""}
    ${md(body, p)}
    <p class="muted small-print">${t(lang, "art.disclaimer")}</p>
  </article>
  <aside class="art-side"><div class="side-box"><h2 class="side-h">${t(lang, "art.ctaTitle")}</h2><p>${t(lang, "art.ctaText")}</p>
    <a class="btn-gold block" href="${waLink(t(lang, "wa.general"))}" target="_blank" rel="noopener" data-track="whatsapp">${ICON.wa}<span>${t(lang, "wa.cta")}</span></a>
    <a class="more-link" href="${relHash(p, R.home(lang) + "#listings")}">${t(lang, "nav.listings")} →</a></div></aside>
</div></section>
${others.length ? `<section class="section pt0"><div class="wrap"><h2 class="sub-h">${t(lang, "art.related")}</h2><div class="art-grid">${others.map((x) => articleCard(p, x, lang)).join("")}</div></div></section>` : ""}`,
      };
    },
  }, a.updated || a.date);
}

// 404 (Albanian first, English below). Served at any missing URL, so every link is root-absolute.
// It also knows every property by its code, so an old link (title changed) is sent to the current page.
if (!PREVIEW) {
  const idMap = Object.fromEntries(LISTINGS.map((l) => [l.id, { sq: "/" + R.prop("sq", l), en: "/" + R.prop("en", l) }]));
  write("404.html", layout({ lang: "sq", p: "", alt: null, key: "404", noindex: true,
    title: `${t("sq", "nf.title")} | ${SITE.brand}`, description: t("sq", "nf.text"),
    body: `<section class="page-hero nf"><div class="wrap"><span class="eyebrow on-navy">404</span><h1>${t("sq", "nf.title")}</h1><p class="sub">${t("sq", "nf.text")}</p>
<p class="sub" lang="en">${t("en", "nf.title")}. ${t("en", "nf.text")}</p>
<p><a class="btn-gold" href="./">${t("sq", "nf.cta")}</a></p></div></section>
<script type="application/json" id="idMap">${JSON.stringify(idMap).replace(/</g, "\\u003c")}</script>` })
    .replace(/href="\.\/#/g, 'href="/#').replace(/(href|src)="\.\/"/g, '$1="/"').replace(/(href|src)="(?!https?:|\/|#|tel:|mailto:)([^"]*)"/g, '$1="/$2"'));
}

/* ---------------------- sitemap, robots, redirects ---------------------- */
write("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${pages.flatMap((pg) => LANGS.map((lang) => `  <url>
    <loc>${esc(abs(pg[lang]))}</loc>
${pg.lastmod ? `    <lastmod>${pg.lastmod}</lastmod>\n` : ""}${LANGS.map((L) => `    <xhtml:link rel="alternate" hreflang="${L}" href="${esc(abs(pg[L]))}"/>`).join("\n")}
    <xhtml:link rel="alternate" hreflang="x-default" href="${esc(abs(pg.sq))}"/>
  </url>`)).join("\n")}
</urlset>
`);
write("robots.txt", `User-agent: *\nAllow: /\nDisallow: /admin/\n\nSitemap: ${DOMAIN}/sitemap.xml\n`);
write("site.webmanifest", JSON.stringify({ name: FULL_NAME, short_name: SITE.brand, start_url: "/", display: "standalone",
  background_color: "#0F1A3E", theme_color: "#0F1A3E", icons: [{ src: "/images/apple-touch-icon.png", sizes: "180x180", type: "image/png" }, { src: "/images/icon-512.png", sizes: "512x512", type: "image/png" }] }, null, 2));
// Short links by property code (isaproperties.al/101, isaproperties.al/en/101) for Instagram bios, phone calls and print.
if (!PREVIEW) write("_redirects", LISTINGS.map((l) => `/${l.id} /${R.prop("sq", l)} 301\n/en/${l.id} /${R.prop("en", l)} 301`).join("\n") + "\n");

/* ------------------------- admin panel (CMS) ------------------------- */
if (!PREVIEW) {
  // JSON is valid YAML, so quotes or backslashes in zone names can't break the panel.
  const zoneOpts = JSON.stringify(Object.values(AREAS).map((a) => ({ label: `${a.sq} (${a.group.sq})`, value: String(a.id) })));
  const agentOpts = JSON.stringify(ABOUT.team.filter((m) => m.key).map((m) => ({ label: `${m.name}${m.role_sq ? ` (${m.role_sq})` : ""}`, value: String(m.key) })));
  write("admin/index.html", fs.readFileSync(path.join(ROOT, "admin/index.html")));
  write("admin/config.yml", fs.readFileSync(path.join(ROOT, "admin/config.yml"), "utf8")
    .replace(/__ZONE_OPTIONS__/g, () => zoneOpts).replace(/__AGENT_OPTIONS__/g, () => (agentOpts === "[]" ? '[{ "label": "—", "value": "" }]' : agentOpts)).replace(/__SITE_URL__/g, () => DOMAIN));
}

/* ------------------------------ report ------------------------------ */
for (const { from, to } of contentLinks) {
  const target = to === "" || to.endsWith("/") ? to : to + "/";
  if (!generated.has(target) && !fs.existsSync(path.join(OUT, to))) warn(`Linku "/${to}" te faqja /${from} nuk çon askund (faqja nuk ekziston).`);
}
for (const a of ARTICLES) if (a.image) usedImages.add(a.image);
for (const m of ABOUT.team) if (m.photo) usedImages.add(m.photo);
const missing = [...usedImages].filter((i) => !/^https?:/.test(i) && !fs.existsSync(path.join(OUT, imgPath(i))));
if (missing.length) warn("Mungojnë fotot: " + missing.join(", "));
// Placeholders that must not go live: sample listings, and "[X]%"-style blanks left in the terms.
const samples = LISTINGS.filter((l) => l.sample);
if (samples.length) warn(`PARA PUBLIKIMIT: ${samples.length} prona janë shembuj (kodet ${samples.map((l) => l.id).join(", ")}). Fshiji dhe vendos pronat reale.`);
if (TERMS && LANGS.some((lang) => /\[[^\]\n]{1,60}\](?!\()/.test(TERMS[`body_${lang}`] || "")))
  warn("PARA PUBLIKIMIT: te Kushtet dhe tarifat ka ende vende për t'u plotësuar, si [X]%. Vendos tarifat reale.");
console.log(`Built ${generated.size} pages${PREVIEW ? "" : " + 404"} into ${path.relative(ROOT, OUT)}/ (${PREVIEW ? "preview" : "production"})`);
if (warnings.length) { console.warn("\nKUJDES / WARNINGS:"); [...new Set(warnings)].forEach((w) => console.warn(" ! " + w)); }
