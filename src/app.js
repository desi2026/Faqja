/* Site behaviour. Content is rendered at build time; this only adds interaction. */
(function () {
  "use strict";
  var root = document.querySelector("[data-wa]") || document.body;
  var cfg = root.dataset;
  var lang = cfg.lang || "sq";
  var PREVIEW = cfg.preview === "1";
  var T = {};
  try { T = JSON.parse(document.getElementById("i18n").textContent); } catch (e) {}
  var $ = function (s, el) { return (el || document).querySelector(s); };
  var $$ = function (s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); };
  var fill = function (s, o) { return String(s || "").replace(/\{(\w+)\}/g, function (m, k) { return k in o ? o[k] : m; }); };
  var eur = function (n) { return "€" + Math.round(n).toLocaleString(lang === "sq" ? "de-DE" : "en-GB"); };
  var waHref = function (msg, num) { return "https://wa.me/" + (num || cfg.wa) + "?text=" + encodeURIComponent(msg); };
  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
  };
  var debounce = function (fn, ms) { var tm; return function () { clearTimeout(tm); tm = setTimeout(fn, ms); }; };
  var reduceMotion = !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
  var sr = $("#srAnnounce");
  function announce(msg) {
    if (!sr) return;
    sr.textContent = "";
    setTimeout(function () { sr.textContent = msg; }, 50);
  }

  // Netlify Identity invite / recovery links land on the home page: send them to the admin panel.
  if (!PREVIEW && /(invite|recovery|confirmation|email_change)_token=/.test(location.hash)) {
    location.replace("/admin/" + location.hash);
    return;
  }

  // 404: an old property link (title changed since) still ends in the property code, so send it to the current page.
  var idMapEl = $("#idMap");
  if (idMapEl) {
    var m404 = location.pathname.match(/^\/(en\/property|prona)\/(?:[^/]*-)?(\d+)\/?$/);
    if (m404) {
      try {
        var hit = JSON.parse(idMapEl.textContent)[m404[2]];
        var to = hit && hit[m404[1] === "prona" ? "sq" : "en"];
        if (to && to !== location.pathname) { location.replace(to); return; }
      } catch (e) {}
    }
  }

  $$("[data-year]").forEach(function (el) { el.textContent = new Date().getFullYear(); });

  /* ---------- Analytics (only after consent; see the cookie section below) ---------- */
  var consent = { v: 2, stats: false, ads: false }, loaded = { stats: false, ads: false };
  function track(name, params, pixelEvent) {
    if (window.gtag && consent.stats && loaded.stats) window.gtag("event", name, params || {});
    if (window.fbq && consent.ads && loaded.ads && pixelEvent) window.fbq("track", pixelEvent, params || {});
  }

  /* ---------- Menu ---------- */
  var menuBtn = $(".menu-btn"), nav = $("#mainNav");
  if (menuBtn && nav) {
    var head = menuBtn.closest("header") || document.body;
    var closeMenu = function (refocus) {
      if (!nav.classList.contains("open")) return;
      nav.classList.remove("open");
      menuBtn.setAttribute("aria-expanded", "false");
      if (refocus) menuBtn.focus();
    };
    menuBtn.addEventListener("click", function () {
      var open = nav.classList.toggle("open");
      menuBtn.setAttribute("aria-expanded", String(open));
    });
    nav.addEventListener("click", function (e) { if (e.target.closest("a")) closeMenu(false); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeMenu(nav.contains(document.activeElement) || document.activeElement === menuBtn);
    });
    head.addEventListener("focusout", function (e) { if (e.relatedTarget && !head.contains(e.relatedTarget)) closeMenu(false); });
    document.addEventListener("click", function (e) { if (!head.contains(e.target)) closeMenu(false); });
  }

  /* ---------- "New" badges and the weekly count, computed from today's date ---------- */
  var nd = cfg.newdays, newDays = nd === undefined || nd === "" || isNaN(+nd) ? 14 : +nd, now = Date.now();
  var ageDays = function (d) { return (now - new Date(d).getTime()) / 864e5; };
  $$("[data-added]").forEach(function (el) {
    var age = ageDays(el.dataset.added), badge = $(".badge.new", el);
    if (badge && newDays > 0 && age >= -1 && age <= newDays) badge.hidden = false;
  });
  var newCount = $("[data-newcount]");
  if (newCount) {
    var n = (newCount.dataset.dates || "").split(",").filter(function (d) { var a = ageDays(d); return d && a >= -1 && a <= 7; }).length;
    newCount.textContent = n;
    var lbl = $("[data-newlabel]");
    if (lbl) lbl.textContent = n === 1 ? T.statNewOne : T.statNew;
    var box = newCount.closest("[data-newstat]");
    if (box) box.hidden = n === 0;
  }

  /* ---------- Favourites (kept only in this browser) ---------- */
  var favs = [], favMeta = {};
  try { favs = JSON.parse(store.get("favs") || "[]").map(String).filter(function (x) { return /^\d+$/.test(x); }); } catch (e) { favs = []; }
  try { favMeta = JSON.parse(store.get("favMeta") || "{}") || {}; } catch (e) { favMeta = {}; }
  var isFav = function (id) { return favs.indexOf(String(id)) >= 0; };
  function metaFor(el) {
    var wrap = el && el.closest(".card-wrap");
    if (wrap) return { t: wrap.dataset.title, u: wrap.dataset.url };
    var h1 = $(".prop-head h1"), canon = $('link[rel="canonical"]');
    return { t: h1 ? h1.textContent.trim() : "", u: canon ? canon.href : location.href };
  }
  function favMessage() {
    return T.waFav + "\n" + favs.map(function (id) {
      var m = favMeta[id] || {};
      return "• " + (m.t ? m.t + " – " : "") + T.code + " " + id + (m.u ? " " + m.u : "");
    }).join("\n");
  }
  function syncFavs() {
    // Refresh stored titles/links from the cards on this page (keeps them in the current language).
    $$(".card-wrap").forEach(function (w) { if (isFav(w.dataset.id)) favMeta[w.dataset.id] = { t: w.dataset.title, u: w.dataset.url }; });
    $$("[data-fav]").forEach(function (b) { b.setAttribute("aria-pressed", String(isFav(b.dataset.fav))); });
    $$("[data-fav-count]").forEach(function (el) { el.textContent = favs.length ? "(" + favs.length + ")" : ""; });
    $$("[data-fav-send]").forEach(function (a) { a.hidden = !favs.length; if (favs.length) a.href = waHref(favMessage()); });
  }
  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-fav]");
    if (!b) return;
    e.preventDefault();
    var id = b.dataset.fav;
    if (isFav(id)) { favs = favs.filter(function (x) { return x !== id; }); delete favMeta[id]; }
    else { favs.push(id); favMeta[id] = metaFor(b); track("add_to_wishlist", { item_id: id }, "AddToWishlist"); }
    store.set("favs", JSON.stringify(favs));
    store.set("favMeta", JSON.stringify(favMeta));
    syncFavs();
    $$("[data-filters]").forEach(function (bar) { if (bar._refresh) bar._refresh(); });
  });

  /* ---------- Listing filters (the first list on a page keeps its filters in the URL, so results can be shared) ---------- */
  var firstBar = $("[data-filters]");
  $$("[data-filters]").forEach(function (bar) {
    var scope = bar.parentElement, grid = $("[data-grid]", scope);
    if (!grid) return;
    var empty = $("[data-empty]", scope), favEmpty = $("[data-fav-empty]", scope), count = $("[data-count]", bar), more = $("[data-more]", scope);
    var cards = $$(".card-wrap", grid), batch = +grid.dataset.batch || 24, limit = batch, lastSort = "new";
    var DEFAULTS = { deal: "all", type: "all", zone: "all", sort: "new", beds: "0", pmin: "", pmax: "", amin: "", code: "", deed: false, saved: false };
    var state = Object.assign({}, DEFAULTS);
    var syncUrl = bar === firstBar;
    var optionOk = function (f, v) { var s = $('select[data-f="' + f + '"]', bar); return !!s && $$("option", s).some(function (o) { return o.value === v; }); };

    if (syncUrl && location.search) {
      var q = new URLSearchParams(location.search);
      ["deal", "type"].forEach(function (k) { var v = q.get(k); if (v && $$('.chip[data-g="' + k + '"]', bar).some(function (c) { return c.dataset.v === v; })) state[k] = v; });
      ["zone", "sort", "beds"].forEach(function (k) { var v = q.get(k); if (v && optionOk(k, v)) state[k] = v; });
      ["pmin", "pmax", "amin"].forEach(function (k) { var v = q.get(k); if (v && isFinite(+v) && +v >= 0) state[k] = v; });
      var c = (q.get("code") || "").replace(/\D/g, ""); if (c) state.code = c;
      state.deed = q.get("deed") === "1";
      state.saved = q.get("saved") === "1";
    }

    var price = function (c) { return c.dataset.price === "" ? null : +c.dataset.price; };
    function compare(a, b) {
      var A = a.dataset, B = b.dataset;
      if (state.sort === "low" || state.sort === "high") {
        // Monthly rents and sale prices are not comparable: with no deal chosen, sales come first.
        if (state.deal === "all" && A.deal !== B.deal) return A.deal === "sale" ? -1 : 1;
        var pa = price(a), pb = price(b);
        if (pa === null || pb === null) return pa === pb ? 0 : pa === null ? 1 : -1;
        return state.sort === "low" ? pa - pb : pb - pa;
      }
      if (state.sort === "ppm") {
        var ma = +A.ppm || 0, mb = +B.ppm || 0;
        if (!ma || !mb) return ma === mb ? 0 : ma ? -1 : 1;
        return ma - mb;
      }
      return B.added.localeCompare(A.added) || B.id - A.id;
    }
    function apply(keepLimit) {
      if (!keepLimit) limit = batch;
      var pmin = +state.pmin || 0, pmax = +state.pmax || Infinity, amin = +state.amin || 0, beds = +state.beds || 0, code = String(state.code).replace(/\D/g, "");
      // The build writes cards newest first, so the DOM is only reordered when the sort changes.
      if (state.sort !== lastSort || (state.sort === "low" || state.sort === "high") && grid._deal !== state.deal) {
        cards.slice().sort(compare).forEach(function (c) { grid.appendChild(c); });
        lastSort = state.sort; grid._deal = state.deal;
      }
      var ordered = $$(".card-wrap", grid);
      var shown = ordered.filter(function (c) {
        var d = c.dataset, pr = price(c);
        return (state.deal === "all" || d.deal === state.deal) && (state.type === "all" || d.type === state.type) && (state.zone === "all" || d.zone === state.zone)
          && (pmin === 0 && pmax === Infinity || pr !== null && pr >= pmin && pr <= pmax)
          && (+d.area || 0) >= amin && (+d.beds || 0) >= beds && (!state.deed || d.deed === "yes")
          && (!state.saved || isFav(d.id)) && (!code || d.id.indexOf(code) === 0);
      });
      ordered.forEach(function (c) { c.hidden = true; });
      shown.forEach(function (c, i) { c.hidden = i >= limit; });
      if (more) {
        var rest = shown.length - limit;
        more.hidden = rest <= 0;
        if (rest > 0) more.textContent = fill(T.more, { n: rest });
      }
      if (count) count.textContent = fill(shown.length === 1 ? T.resultsOne : T.results, { n: shown.length });
      var noFavs = state.saved && !favs.length;
      if (favEmpty) favEmpty.hidden = !noFavs;
      if (empty) empty.hidden = shown.length > 0 || noFavs;
      $$(".chip", bar).forEach(function (ch) { ch.setAttribute("aria-pressed", String(state[ch.dataset.g] === ch.dataset.v)); });
      $$("select[data-f]", bar).forEach(function (el) { el.value = state[el.dataset.f]; });
      $$("input[data-n]", bar).forEach(function (el) { if (el.value !== String(state[el.dataset.n])) el.value = state[el.dataset.n]; });
      $$("input[data-c]", bar).forEach(function (el) { el.checked = !!state[el.dataset.c]; });
      if (syncUrl) writeUrl();
    }
    function writeUrl() {
      var q = new URLSearchParams(location.search);
      Object.keys(DEFAULTS).forEach(function (k) {
        var v = state[k];
        if (v === DEFAULTS[k] || v === "" || v === false) q.delete(k);
        else q.set(k, v === true ? "1" : v);
      });
      var qs = q.toString();
      try { history.replaceState(history.state, "", location.pathname + (qs ? "?" + qs : "") + location.hash); } catch (e) {}
    }
    var applyLater = debounce(apply, 250);
    bar.addEventListener("click", function (e) {
      var ch = e.target.closest(".chip");
      if (ch) { state[ch.dataset.g] = ch.dataset.v; apply(); }
      if (e.target.closest("[data-reset]")) { state = Object.assign({}, DEFAULTS); apply(); }
    });
    bar.addEventListener("change", function (e) {
      var el = e.target;
      if (el.dataset.f) state[el.dataset.f] = el.value;
      else if (el.dataset.c) state[el.dataset.c] = el.checked;
      else return;
      apply();
    });
    bar.addEventListener("input", function (e) {
      if (e.target.dataset.n) { state[e.target.dataset.n] = e.target.value; applyLater(); }
    });
    if (more) more.addEventListener("click", function () {
      var first = limit;
      limit += batch;
      apply(true);
      var next = $$(".card-wrap", grid).filter(function (c) { return !c.hidden; })[first];
      var link = next && $("a", next);
      if (link) link.focus({ preventScroll: true });
    });
    bar._set = function (o) { state = Object.assign({}, DEFAULTS, o); apply(); };
    bar._refresh = function () { if (state.saved) apply(true); };
    apply();
  });

  /* ---------- Hero search ---------- */
  var search = $("[data-search]");
  if (search) search.addEventListener("submit", function (e) {
    e.preventDefault();
    var msg = $("[data-search-msg]");
    if (msg) msg.textContent = "";
    var code = (search.code ? search.code.value : "").replace(/\D/g, "");
    if (code) {
      track("search_code", { code: code });
      var card = $('.card-wrap[data-id="' + code + '"] a.card');
      if (card) { location.href = card.href; return; }
      // Short links (/101, /en/101) redirect to every listing, including sold ones that are not on this page.
      if (!PREVIEW) { location.href = (lang === "en" ? "/en/" : "/") + code; return; }
      if (msg) msg.textContent = fill(T.noCode, { code: code });
      return;
    }
    var bar = $("#listings [data-filters]");
    if (bar && bar._set) bar._set({ deal: search.deal.value, zone: search.zone.value, type: search.type.value });
    var target = $("#listings");
    if (target) target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" });
    var h = $("#list-h");
    if (h) h.focus({ preventScroll: true });
    track("search", { zone: search.zone.value, type: search.type.value, deal: search.deal.value });
  });

  /* ---------- Mortgage calculator ---------- */
  $$("[data-calc]").forEach(function (box) {
    var f = $("form", box), out = function (k) { return $('[data-o="' + k + '"]', box); }, r = function (k) { return $('[data-r="' + k + '"]', box); };
    var wa = $("[data-calc-wa]", box), tpl = box.dataset.waTpl, num = box.dataset.waNum;
    var say = r("say"), sayLater = debounce(function () { if (say) say.textContent = T.monthly + " " + r("monthly").textContent; }, 600);
    function calc() {
      var price = Math.max(0, +f.price.value || 0), down = +f.down.value, rate = +f.rate.value, years = +f.years.value;
      var loan = price * (1 - down / 100), n = years * 12, mr = rate / 100 / 12;
      var m = mr ? loan * mr / (1 - Math.pow(1 + mr, -n)) : loan / n;
      var total = m * n, interest = total - loan;
      var downTxt = down + "% · " + eur(price * down / 100), rateTxt = rate.toFixed(1) + "%", yrsTxt = years + " " + (T.yrs || "");
      out("down").textContent = downTxt; f.down.setAttribute("aria-valuetext", downTxt);
      out("rate").textContent = rateTxt; f.rate.setAttribute("aria-valuetext", rateTxt);
      out("years").textContent = yrsTxt; f.years.setAttribute("aria-valuetext", yrsTxt);
      r("monthly").textContent = eur(m);
      r("loan").textContent = eur(loan);
      r("downAmt").textContent = eur(price * down / 100);
      r("interest").textContent = eur(interest);
      r("total").textContent = eur(total);
      r("split").style.width = (total ? loan / total * 100 : 0) + "%";
      if (wa && tpl) wa.href = waHref(fill(tpl, { price: eur(price) }), num);
    }
    f.addEventListener("input", function () { calc(); sayLater(); });
    f.addEventListener("submit", function (e) { e.preventDefault(); });
    calc();
  });

  /* ---------- Gallery + full-screen view ---------- */
  function swipe(el, cb) {
    if (!el) return;
    var x0 = null, y0 = 0;
    el.addEventListener("touchstart", function (e) { if (e.touches.length === 1) { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; } else x0 = null; }, { passive: true });
    el.addEventListener("touchend", function (e) {
      if (x0 === null) return;
      var dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0; x0 = null;
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) cb(dx < 0 ? 1 : -1);
    }, { passive: true });
  }
  $$("[data-gallery]").forEach(function (g) {
    var main = $(".g-main img", g), thumbs = $$(".g-thumbs button", g), counter = $(".g-count", g), zoom = $("[data-zoom]", g), i = 0;
    if (!main) return;
    var slides = thumbs.length ? thumbs.map(function (b) { return { big: b.dataset.big, alt: b.dataset.alt }; }) : [{ big: main.dataset.big || main.currentSrc || main.src, alt: main.alt }];
    var total = slides.length;
    function show(n) {
      if (!thumbs.length) return;
      i = (n + total) % total;
      var tb = thumbs[i];
      if (tb.dataset.srcset) main.srcset = tb.dataset.srcset; else main.removeAttribute("srcset");
      main.src = tb.dataset.full;
      main.alt = tb.dataset.alt || "";
      thumbs.forEach(function (b, k) { b.setAttribute("aria-current", String(k === i)); });
      if (counter) counter.textContent = (i + 1) + " / " + total;
    }
    thumbs.forEach(function (b, k) { b.addEventListener("click", function () { show(k); }); });
    $$(".g-nav", g).forEach(function (b) { b.addEventListener("click", function () { show(i + Number(b.dataset.g)); }); });
    g.addEventListener("keydown", function (e) {
      if (e.key === "ArrowLeft") { show(i - 1); e.preventDefault(); }
      if (e.key === "ArrowRight") { show(i + 1); e.preventDefault(); }
    });
    swipe($(".g-main", g), function (dir) { show(i + dir); });

    // Full-screen view: a native <dialog>, so focus trapping, Escape and the backdrop come from the browser.
    var dlg = null, li = 0;
    function build() {
      dlg = document.createElement("dialog");
      dlg.className = "lightbox";
      dlg.setAttribute("aria-label", T.lightbox || "");
      dlg.innerHTML = '<figure><img alt=""><figcaption class="lb-count" aria-live="polite"></figcaption></figure>'
        + '<button type="button" class="lb-close" data-lb="close"><span aria-hidden="true">×</span></button>'
        + (total > 1 ? '<button type="button" class="lb-nav prev" data-lb="-1"><span aria-hidden="true">‹</span></button><button type="button" class="lb-nav next" data-lb="1"><span aria-hidden="true">›</span></button>' : "");
      $(".lb-close", dlg).setAttribute("aria-label", T.close || "");
      if (total > 1) { $(".lb-nav.prev", dlg).setAttribute("aria-label", T.prev || ""); $(".lb-nav.next", dlg).setAttribute("aria-label", T.next || ""); }
      dlg.addEventListener("click", function (e) {
        var b = e.target.closest("[data-lb]");
        if (b) { if (b.dataset.lb === "close") dlg.close(); else lbShow(li + Number(b.dataset.lb)); }
        else if (e.target === dlg) dlg.close();
      });
      dlg.addEventListener("keydown", function (e) {
        if (e.key === "ArrowLeft") lbShow(li - 1);
        if (e.key === "ArrowRight") lbShow(li + 1);
      });
      dlg.addEventListener("close", function () { show(li); if (zoom) zoom.focus(); });
      swipe(dlg, function (dir) { lbShow(li + dir); });
      root.appendChild(dlg);
    }
    function lbShow(k) {
      li = (k + total) % total;
      var im = $("img", dlg);
      im.src = slides[li].big;
      im.alt = slides[li].alt || "";
      $(".lb-count", dlg).textContent = total > 1 ? (li + 1) + " / " + total : "";
    }
    function open() {
      if (!dlg) build();
      lbShow(i);
      if (dlg.showModal) dlg.showModal(); else window.open(slides[i].big, "_blank", "noopener");
    }
    if (zoom) zoom.addEventListener("click", open);
    main.addEventListener("click", open);
  });

  /* ---------- Video and location map: the third-party frame loads only when asked ---------- */
  function frame(src, title, cls) {
    var f = document.createElement("iframe");
    if (cls) f.className = cls;
    f.src = src;
    f.title = title || "";
    f.referrerPolicy = "strict-origin-when-cross-origin";
    return f;
  }
  $$("[data-yt]").forEach(function (b) {
    b.addEventListener("click", function () {
      var f = frame("https://www.youtube-nocookie.com/embed/" + encodeURIComponent(b.dataset.yt) + "?autoplay=1&rel=0", b.getAttribute("aria-label") || "Video", "video-frame");
      f.allow = "accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; fullscreen";
      f.allowFullscreen = true;
      b.replaceWith(f);
      f.focus();
    });
  });
  $$("[data-map-open]").forEach(function (a) {
    a.addEventListener("click", function (e) {
      var box = a.closest("[data-map-src]");
      if (!box) return;
      e.preventDefault();
      var f = frame(box.dataset.mapSrc, box.dataset.mapTitle, "");
      box.replaceChildren(f);
      f.focus();
    });
  });

  /* ---------- All-properties map (Leaflet + clusters, self-hosted) ---------- */
  var mapEl = $("#propMap");
  if (mapEl) {
    var startMap = function () {
      if (!window.L || mapEl._started) return;
      mapEl._started = true;
      var pts = [];
      try { pts = JSON.parse($("#mapData").textContent); } catch (e) {}
      var map = L.map(mapEl, { scrollWheelZoom: false });
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors' }).addTo(map);
      var layer = L.markerClusterGroup ? L.markerClusterGroup({ showCoverageOnHover: false, maxClusterRadius: 45, spiderfyOnMaxZoom: true,
        iconCreateFunction: function (c) { return L.divIcon({ className: "pin-price pin-cluster", html: "<span>" + c.getChildCount() + "</span>", iconSize: null }); } })
        : L.layerGroup();
      layer.addTo(map);
      var el = function (tag, cls, text) { var x = document.createElement(tag); if (cls) x.className = cls; if (text != null) x.textContent = text; return x; };
      var markers = pts.map(function (p) {
        var pin = el("div"), label = el("span", "", p.short);
        label.setAttribute("aria-hidden", "true");
        pin.appendChild(label); pin.appendChild(el("b", "sr-only", p.t + ", " + p.pr));
        var icon = L.divIcon({ className: "pin-price" + (p.d === "rent" ? " pin-rent" : ""), html: pin.innerHTML, iconSize: null });
        var pop = el("a", "map-pop");
        pop.href = p.u;
        if (p.i) { var im = el("img"); im.src = p.i; im.alt = ""; im.loading = "lazy"; pop.appendChild(im); }
        pop.appendChild(el("b", "", p.t)); pop.appendChild(el("span", "", p.pr)); pop.appendChild(el("small", "", p.z));
        var mk = L.marker([p.lat, p.lng], { icon: icon, title: p.t, riseOnHover: true }).bindPopup(pop);
        mk._g = p.g; mk._d = p.d;
        return mk;
      });
      map.on("popupopen", function (e) {
        var a = $(".map-pop", e.popup.getElement()), ae = document.activeElement;
        if (a && ae && ae.classList && ae.classList.contains("pin-price")) a.focus({ preventScroll: true });
      });
      var sel = { g: "all", d: "all" };
      function show() {
        var list = markers.filter(function (mk) { return (sel.g === "all" || mk._g === sel.g) && (sel.d === "all" || mk._d === sel.d); });
        layer.clearLayers();
        if (layer.addLayers) layer.addLayers(list); else list.forEach(function (mk) { layer.addLayer(mk); });
        if (list.length) map.fitBounds(L.latLngBounds(list.map(function (mk) { return mk.getLatLng(); })), { padding: [50, 50], maxZoom: 14 });
        else map.setView([41.3275, 19.8187], 12);
      }
      [["data-mapgroup", "g"], ["data-mapdeal", "d"]].forEach(function (pair) {
        var btns = $$("[" + pair[0] + "]");
        btns.forEach(function (b) {
          b.addEventListener("click", function () {
            btns.forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
            sel[pair[1]] = b.getAttribute(pair[0]);
            show();
          });
        });
      });
      show();
    };
    if (window.L) startMap(); else window.addEventListener("load", startMap);
  }

  /* ---------- Copy and print buttons ---------- */
  document.addEventListener("click", function (e) {
    if (e.target.closest("[data-print]")) { window.print(); return; }
    var b = e.target.closest("[data-copy]");
    if (!b) return;
    var text = b.dataset.copy;
    if (!b.dataset.label) b.dataset.label = b.textContent;
    var done = function () { b.textContent = T.copied; announce(T.copied); setTimeout(function () { b.textContent = b.dataset.label; }, 1600); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text); done(); });
    else { fallbackCopy(text); done(); }
  });
  function fallbackCopy(text) {
    var ta = document.createElement("textarea");
    ta.value = text; ta.setAttribute("readonly", ""); ta.className = "sr-only";
    document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); } catch (e) {}
    document.body.removeChild(ta);
  }

  /* ---------- Lead forms: owners and viewing requests (Netlify Forms) ---------- */
  $$("[data-lead-form]").forEach(function (form) {
    var status = $("[data-status]", form), waBtn = $("[data-form-wa]", form), btn = $('button[type="submit"]', form);
    // Plain-language messages instead of the browser's default ones.
    $$("input", form).forEach(function (el) {
      el.addEventListener("invalid", function () {
        if (el.type === "number" && !el.validity.valueMissing) el.setCustomValidity(T.invalidNumber);
        else if (el.type === "tel" && el.validity.patternMismatch) el.setCustomValidity(T.invalidPhone);
      });
      el.addEventListener("input", function () { el.setCustomValidity(""); });
    });
    // Owner form: the WhatsApp button sends what was already typed, under the visible labels.
    if (waBtn) waBtn.addEventListener("click", function () {
      var lines = [], seen = {};
      $$("input, select, textarea", form).forEach(function (el) {
        if (el.type === "hidden" || el.type === "checkbox" || el.name === "bot-field" || seen[el.name]) return;
        var label, value;
        if (el.type === "radio") {
          seen[el.name] = true;
          var on = $('input[name="' + el.name + '"]:checked', form);
          if (!on) return;
          var fs = el.closest("fieldset"), lg = fs && $("legend", fs);
          label = lg ? lg.textContent : el.name;
          value = on.parentElement.textContent;
        } else {
          if (!el.value.trim()) return;
          var fld = el.closest(".fld"), sp = fld && $("span", fld);
          label = sp ? sp.textContent : el.name;
          value = el.tagName === "SELECT" ? el.options[el.selectedIndex].text : el.value;
        }
        lines.push(label.replace(/\s*\*\s*$/, "").trim() + ": " + value.trim());
      });
      if (lines.length) waBtn.href = waHref(T.waForm + "\n" + lines.join("\n"));
    });
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!btn || btn.getAttribute("aria-disabled") === "true") return;
      if (PREVIEW) { status.className = "form-status"; status.textContent = T.formPreview; return; }
      var label = btn.textContent;
      btn.setAttribute("aria-disabled", "true"); btn.textContent = T.sending; status.className = "form-status"; status.textContent = "";
      var listing = form.elements.listing ? form.elements.listing.value : "";
      fetch("/", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(new FormData(form)).toString() })
        .then(function (res) {
          if (!res.ok) throw new Error(res.status);
          form.reset(); status.className = "form-status ok"; status.textContent = T.ok;
          track("generate_lead", { form: form.getAttribute("name"), listing: listing }, "Lead");
        })
        .catch(function () { status.className = "form-status err"; status.textContent = T.err; })
        .then(function () { btn.removeAttribute("aria-disabled"); btn.textContent = label; });
    });
  });

  /* ---------- Cookie consent: a separate choice for statistics and for marketing ---------- */
  var bar = $("#cookieBar"), hasTrackers = !!(cfg.ga || cfg.pixel), opener = null, KEY = "consent2";
  function readConsent() {
    try { var v = JSON.parse(store.get(KEY)); if (v && v.v === 2) return v; } catch (e) {}
    return null; // the old single yes/no choice is asked again
  }
  var saved = readConsent();
  if (saved) consent = saved;
  function setBar(show) {
    if (!bar) return;
    bar.hidden = !show;
    // Pad the page so the banner never covers whatever has focus.
    var h = show ? Math.ceil(window.innerHeight - bar.getBoundingClientRect().top + 16) + "px" : "";
    document.documentElement.style.scrollPaddingBottom = h;
    document.body.style.paddingBottom = h;
  }
  if (bar && hasTrackers) {
    var boxes = { stats: $('input[name="stats"]', bar), ads: $('input[name="ads"]', bar) };
    var syncBoxes = function () { Object.keys(boxes).forEach(function (k) { if (boxes[k]) boxes[k].checked = !!consent[k]; }); };
    if (!saved) { syncBoxes(); setBar(true); }
    window.addEventListener("resize", debounce(function () { if (!bar.hidden) setBar(true); }, 150));
    document.addEventListener("click", function (e) {
      var c = e.target.closest("[data-consent]");
      if (c) {
        var choice = c.dataset.consent, pick = function (k, id) { return choice === "all" ? !!id : choice === "save" ? !!(boxes[k] && boxes[k].checked) : false; };
        consent = { v: 2, stats: pick("stats", cfg.ga), ads: pick("ads", cfg.pixel), date: new Date().toISOString().slice(0, 10) };
        store.set(KEY, JSON.stringify(consent));
        setBar(false);
        clearCookies(!consent.stats, !consent.ads);
        if ((loaded.stats && !consent.stats) || (loaded.ads && !consent.ads)) { revoke(); location.reload(); return; }
        loadTrackers();
        var back = opener && document.contains(opener) ? opener : $("#main");
        if (back) back.focus({ preventScroll: true });
        opener = null;
      }
      var s = e.target.closest("[data-cookie-settings]");
      if (s) { opener = s; syncBoxes(); setBar(true); var first = $("input, button", bar); if (first) first.focus(); }
    });
  }
  function loadTrackers() {
    if (!hasTrackers) return;
    if (consent.stats && cfg.ga && !loaded.stats) {
      loaded.stats = true;
      var s = document.createElement("script");
      s.async = true; s.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(cfg.ga);
      document.head.appendChild(s);
      window.dataLayer = window.dataLayer || [];
      window.gtag = function () { window.dataLayer.push(arguments); };
      window.gtag("js", new Date());
      window.gtag("config", cfg.ga, { allow_google_signals: false, allow_ad_personalization_signals: false });
    }
    if (consent.ads && cfg.pixel && !loaded.ads) {
      loaded.ads = true;
      /* Meta Pixel base code */
      !function (f, b, e, v, n, t, s) { if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
        if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = "2.0"; n.queue = []; t = b.createElement(e); t.async = !0; t.src = v;
        s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s); }(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");
      window.fbq("init", cfg.pixel);
      window.fbq("track", "PageView");
    }
  }
  function revoke() {
    if (cfg.ga) window["ga-disable-" + cfg.ga] = true;
    if (window.gtag) window.gtag("consent", "update", { analytics_storage: "denied", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" });
    if (window.fbq) window.fbq("consent", "revoke");
  }
  // Withdrawn consent also removes the cookies set earlier, on this host and on its parent domains.
  function clearCookies(stats, ads) {
    var names = document.cookie.split(";").map(function (c) { return c.split("=")[0].trim(); }).filter(function (nm) {
      return (stats && /^(_ga|_ga_.*|_gid|_gat.*)$/.test(nm)) || (ads && /^(_fbp|_fbc)$/.test(nm));
    });
    if (!names.length) return;
    var parts = location.hostname.split("."), domains = [""];
    for (var k = 0; k < parts.length - 1; k++) domains.push("; domain=." + parts.slice(k).join("."));
    names.forEach(function (nm) { domains.forEach(function (d) { document.cookie = nm + "=; Max-Age=0; path=/" + d; }); });
  }
  loadTrackers();

  // WhatsApp, calls and social clicks are the site's main conversions.
  document.addEventListener("click", function (e) {
    var a = e.target.closest("[data-track]");
    if (!a) return;
    var kind = a.dataset.track, contact = kind === "whatsapp" || kind === "call" || kind === "email";
    track(contact ? "contact_" + kind : kind === "instagram" || kind === "facebook" ? "social_" + kind : "click_" + kind, { page: location.pathname }, contact ? "Contact" : null);
  });

  syncFavs();
})();
