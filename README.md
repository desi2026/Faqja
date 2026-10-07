# ISA Consulting & Properties – faqja e internetit

Faqe statike dygjuhëshe (shqip / anglisht) me SEO të plotë. Nuk ka nevojë për server apo databazë:
`node build.js` krijon gjithë faqen në dosjen `dist/`. Nuk ka paketa npm për të instaluar.

## Ku ndryshohen të dhënat

| Çfarë | Skedari | Te paneli (/admin) |
|---|---|---|
| Emri, emri ligjor, NIPT, ndërmjetësi, telefoni, WhatsApp, email, adresa, orari, Instagram, Facebook, Google, domeni | `data/site.json` | Cilësimet → Agjencia dhe kontaktet |
| Pronat (një skedar për pronë: `data/listings/101.json` …) | `data/listings/` | Pronat |
| Kushtet dhe tarifat (faqja `/kushtet-dhe-tarifat/`) | `data/terms.json` | Cilësimet → Kushtet dhe tarifat |
| Zonat, grupet (Tiranë, Bregdeti) dhe tekstet e tyre | `data/zones.json` | Cilësimet → Zonat |
| Rreth nesh, ekipi, shifrat, vlerësimet e klientëve | `data/about.json` | Cilësimet → Rreth nesh, ekipi dhe vlerësimet |
| Artikujt (udhëzuesit) | `content/articles/*.json` | Artikujt |
| Tekstet e faqes | `src/i18n.js` | – (zhvilluesi) |
| Politika e privatësisë | `src/privacy.js` | – (zhvilluesi) |
| Logoja, ikona e faqes, foto e ndarjes | `static/images/brand/logo-mark.webp`, `static/favicon.png`, `static/favicon.ico`, `static/images/apple-touch-icon.png`, `static/images/icon-192.png`, `static/images/icon-512.png` (edhe logoja për Google), `static/images/og-default.jpg` | – (zhvilluesi) |

**Të dhënat aktuale janë shembuj:** 15 pronat (101–115) me fotot e vizatuara, ekipi, shifrat, vlerësimet dhe tarifat.
Para publikimit fshi pronat shembull, vendos të dhënat reale dhe hiq shenjën "Shfaq shënimin 'shembull'"
te *Kushtet dhe tarifat* dhe te *Rreth nesh, ekipi dhe vlerësimet*. Vlerësime të shpikura nuk lejohen.
Fotot shembull (`static/images/samples/`) fshihen nga GitHub vetëm pasi edhe artikujt të kenë foto reale.

**Ndërtimi ndalon vetë** (dhe Netlify mban online versionin e fundit të mirë) kur të dhënat janë të prishura: dy prona me të njëjtin kod,
pronë me zonë që nuk ekziston, numër WhatsApp i pasaktë, domen i pasaktë. Ndërtimi i parë që dështon nuk lë asnjë faqe online.
Probleme më të vogla shfaqen si "KUJDES" dhe faqja publikohet: foto që mungon (te pronat, artikujt, ekipi), link i prishur në artikull,
koordinata të pasakta, si dhe kujtesat "PARA PUBLIKIMIT" (identiteti ligjor, pronat shembull, tarifat `[X]%`).
Këto shihen vetëm te Netlify → Deploys → deploy-i i fundit → log-u, ndaj kontrolloje pas ndryshimeve të mëdha.

### Rregulla për ata që mbushin panelin
- **Paneli është në anglisht.** Butonat: *New Pronë* (shto), *Publish → Publish now* (publiko), *Delete entry* (fshi).
- **Çdo ruajtje është një publikim më vete** (një deploy te Netlify, 15 kredite). Mbushe pronën plotësisht dhe kliko *Publish* një herë.
  Ndryshimet e shumta njëherësh (p.sh. fshirja e 15 pronave shembull) bëhen më lirë nga zhvilluesi, me një ndryshim të vetëm.
- **Kodi i pronës** (p.sh. 116) është unik dhe nuk ndryshohet më pas: me të klientët e gjejnë pronën te kërkimi dhe te linku i shkurtër `domeni/116`.
- **Mos ndrysho kodet e zonave** (p.sh. `blloku`) pasi faqja publikohet: janë pjesë e linqeve në Google.
- **Statusi:** kur një pronë shitet ose jepet me qira, ndrysho *Statusi* (mos e fshi). Faqja mbetet me "E shitur", vetëm me foton e parë dhe pa hartë.
- **Fotot:** jepi çdo fotoje emër të ri (p.sh. `116-1.jpg`); mos zëvendëso një foto ekzistuese me të njëjtin emër. Paneli i zvogëlon vetë në 1600 px dhe u heq të dhënat GPS.
  Fotot që shtohen jashtë panelit (direkt në GitHub) pastrohen më parë nga GPS-i, p.sh. `exiftool -gps:all= -overwrite_original foto.jpg`.
- **Vendndodhja:** në faqe shfaqet vetëm zona e përafërt (rreth 250 m), jo adresa e saktë.
- **Agjenti:** te çdo pronë mund të zgjidhet agjenti; butoni i WhatsApp-it dhe telefoni i pronës shkojnë te ai.
  Një agjent ose zonë e re del te lista e panelit vetëm pasi publikimi të ketë mbaruar dhe faqja e panelit të rifreskohet.
- **Video:** link i plotë YouTube (luhet në faqe) ose Instagram/Matterport (hapet në skedë të re).

## Para publikimit (detyrimet ligjore)

1. **Identiteti ligjor** (ligji 9/2022 për ndërmjetësimin, neni 5.2): te Cilësimet → Agjencia dhe kontaktet plotëso emrin ligjor (si në QKB),
   NIPT-in, emrin e ndërmjetësit të licencuar dhe numrin e certifikatës. Dalin në fund të çdo faqeje dhe në kontakte.
   Faqja publikohet edhe pa to (ndërtimi vetëm paralajmëron), ndaj plotësoji para se të lidhet domeni.
2. **Kushtet dhe tarifat** (neni 14): vendos komisionet reale te Cilësimet → Kushtet dhe tarifat (tani ka `[X]%` dhe zgjedhje në kllapa `[...]`),
   kontrollo që të mos ketë mbetur asnjë `[`, pastaj hiq "shembull".
3. **Juristi** duhet të shohë politikën e privatësisë dhe kushtet para publikimit, dhe sidomos para se të vendosen ID-të e Google Analytics / Meta Pixel.
   Nëse reklamat në Meta do të synojnë diasporën në BE (Itali, Gjermani), juristi vendos edhe për përfaqësuesin në BE (GDPR neni 27).
4. **Shifrat e kredisë:** shifrat te artikujt e kredisë dhe të blerjes dhe te kalkulatori (kursi, paradhënia, kufijtë e Bankës së Shqipërisë) konfirmohen me një bankë.

## Publikimi (një herë)

Llogaritë (domeni, GitHub, Netlify, Google) hapen me email-in dhe kartën e klientit, që klienti të jetë pronari.

1. **GitHub:** krijo një repository **publike** me degë `main`. Me planin Free ose Personal të Netlify, në një repository private
   ndryshimet nga paneli mund të mbeten "Pending approval". Kodi nuk ka fjalëkalime apo të dhëna sekrete.
   Ngarko **përmbajtjen** e dosjes (jo vetë dosjen), pa `dist/`, `dist-preview/` dhe `KONTROLLI.md`: `netlify.toml` duhet të dalë në rrënjë të repository-t.
2. **Netlify:** Add new project → Import an existing project → GitHub → zgjidh repository-n → Deploy.
   Build command `node build.js`, publish `dist` dhe Node 24 merren vetë nga `netlify.toml`.
   **Bëje publik:** që nga 28 korriku 2026 projektet e reja janë private (i sheh vetëm pronari i llogarisë).
   Project configuration → General → Visitor access → Project visibility → Make public. Provo faqen në një dritare incognito.
   **Plani:** çdo publikim = një deploy = 15 kredite; trafiku kushton 20 kredite/GB. Plani Free ka 300 kredite në muaj (rreth 15–20 publikime);
   kur mbarojnë, faqja dhe formularët ndalojnë deri në muajin tjetër. Zgjidh **Personal** (9 $/muaj, 1.000 kredite) ose **Pro**,
   dhe te Usage & billing → Credit balance aktivizo njoftimet dhe, nëse do, *auto recharge*.
3. **Formularët** (`pronaret` te "Shit pronën" dhe `vizita` te çdo pronë e lirë): Netlify **nuk** i gjen vetë.
   Forms → **Enable form detection**, pastaj Deploys → Trigger deploy (formularët regjistrohen vetëm në deploy-n pasardhës).
   Kontrollo që te Forms dalin të dy (`vizita` del vetëm kur ka të paktën një pronë të lirë), dërgo një kërkesë provë nga `/shit-pronen/`
   dhe nga një pronë, pastaj te Forms → Submission notifications → Add notification shto email-in ku duhet të vijnë kërkesat.
4. **Domeni:** Domain management → Add a domain → shto `www.domeni.al` dhe bëje *primary*. Te regjistruesi i domenit:
   fshi regjistrimet e vjetra A dhe AAAA te `@` dhe çdo regjistrim te `www`, shto `A @ 75.2.60.5` dhe `CNAME www <projekti>.netlify.app`
   (vlerat e sakta i tregon Netlify te "Pending DNS verification"). Mos prek regjistrimet e email-it (MX). HTTPS aktivizohet vetë brenda 24 orësh.
   Te Cilësimet → Agjencia dhe kontaktet → "Domeni (me https://)" vendos **të njëjtin** domen kryesor, p.sh. `https://www.isaproperties.al`.
   Nëse ndryshojnë, ndërtimi përdor atë të Netlify-t dhe shfaq paralajmërim. Mos e dërgo sitemap-in te Google para se të përputhen.
5. **Paneli (/admin)**, pasi HTTPS të punojë në domen:
   - Identity → **Enable Identity**, dhe menjëherë Identity → Registration → Registration preferences → Configure → **Invite only**
     (si parazgjedhje regjistrimi është i hapur për këdo).
   - Identity → Services → Git Gateway → **Enable Git Gateway**, i lidhur me llogarinë GitHub të klientit. Lëre bosh fushën *Roles*.
   - Identity → Users → **Invite users** → email-i i klientit. Email-i vjen në anglisht nga Netlify ("Accept the invite"; shiko edhe te spam).
     Linku hap faqen dhe të çon vetë te `/admin/`, ku klienti zgjedh fjalëkalimin. Më pas hyn te `https://domeni/admin/`.
     Para se të lidhet domeni, paneli është te `https://<projekti>.netlify.app/admin/`.
   - **Provë:** ndrysho një pronë, kliko *Publish*, kontrollo që te Deploys del një deploy i ri dhe që ndryshimi del në faqe.
     Bëje provën edhe nga interneti i zyrës së klientit.
   - *Shënim:* Netlify Identity mbështetet plotësisht (Netlify e anuloi heqjen e tij në shkurt 2026). Git Gateway është "deprecated":
     punon dhe merr rregullime sigurie, por Netlify nuk e rekomandon për konfigurime të reja dhe nuk rregullon më gabimet e tij.
   - **Nëse *Publish* nuk punon:** Identity → Services → Git Gateway → rigjenero token-in.
     **Plani B** pa ndryshuar panelin: DecapBridge (decapbridge.com, falas deri në 3 faqe dhe 10 redaktorë) flet të njëjtin protokoll;
     ndryshohet vetëm blloku `backend` te `admin/config.yml` dhe hiqet skripti i Identity nga `admin/index.html`.
     Plani C: `backend: { name: github, repo: PRONARI/REPO, branch: main }` me GitHub OAuth App (callback `https://api.netlify.com/auth/done`)
     te Netlify → Project configuration → Security → OAuth → Install provider; çdo redaktor ka nevojë për llogari GitHub me të drejtë shkrimi.
6. **Ruajtja e të dhënave:** Netlify i mban kërkesat (në SHBA) derisa t'i fshish. Çdo 3 muaj: Netlify → Forms → eksporto nëse duhet,
   fshi kërkesat më të vjetra se 24 muaj dhe spam-in, dhe fshi njëkohësisht kopjet në email/WhatsApp, siç thotë politika e privatësisë.

## SEO pas publikimit

1. **Google Search Console:** shto pronën si *URL prefix* me domenin e saktë (p.sh. `https://www.isaproperties.al/`), zgjidh metodën *HTML tag*
   dhe ngjite kodin te Cilësimet → Agjencia dhe kontaktet → "Kodi i verifikimit" (pranohet edhe i gjithë tagu). Mos e fshi më atë fushë.
   Pastaj te Sitemaps dërgo `https://domeni/sitemap.xml`. (Alternativë: pronë *Domain* e verifikuar me regjistrim TXT te DNS-i.)
2. **Google Business Profile:** krijo profilin me emrin si në tabelën e zyrës, kategorinë "Real estate agency", adresën, telefonin dhe linkun e faqes;
   Google kërkon zakonisht një video verifikimi me tabelën dhe zyrën. Pastaj vendos linkun e profilit te Cilësimet.
   Atëherë adresa në faqe çon te profili dhe del linku "Shiko vlerësimet në Google". Ky është faktori më i fortë për "agjenci imobiliare Tiranë".
3. **Google Analytics 4** dhe **Meta Pixel** (pas juristit): vendos ID-të te Cilësimet. Vizitori zgjedh veç statistikat dhe veç marketingun;
   asgjë nuk ngarkohet pa pëlqim, dhe kur e tërheq, cookies fshihen. Ngjarjet: `contact_whatsapp`/`contact_call` (Pixel `Contact`),
   `generate_lead` (Pixel `Lead`, për të dy formularët), `search`, `search_code`, `add_to_wishlist`.
4. **Linqet e shkurtra** `domeni/101` dhe `domeni/en/101` çojnë te prona me atë kod: përdori në Instagram, në telefon dhe në printime.

## Çfarë përfshin

- Faqe më vete për çdo pronë, zonë, grup zonash (Tiranë, Bregdeti), "në shitje / me qira" për çdo grup, artikull, hartën, "Rreth nesh",
  "Më të fundit", "Shit pronën", kushtet dhe privatësinë – në shqip dhe anglisht, me URL të pastra (`/prona/...`, `/en/property/...`).
- Titull i shkurtër (që të mos pritet në Google) dhe përshkrim unik për çdo faqe, `canonical`, `hreflang`; faqet bosh nuk indeksohen.
- Open Graph 1200×630: kur linku ndahet në WhatsApp / Facebook del foto, titulli dhe çmimi.
- Schema.org JSON-LD: `RealEstateAgent` (me emrin ligjor dhe NIPT), `RealEstateListing`, `BlogPosting`, `BreadcrumbList`, `ItemList`.
- `sitemap.xml` me datat reale të ndryshimit, `robots.txt`, faqe 404 që ridrejton linqet e vjetra të pronave sipas kodit.
- Për vizitorët: filtra që ruhen në link (mund të ndahen), kërkim me kod, "Të ruajturat" me dërgim të listës në WhatsApp,
  galeri në ekran të plotë, kalkulator kredie, formular vizite, shiritin e kontaktit në telefon, printim i pastër i pronës.
- Shpejtësi dhe privatësi: shkronjat, harta dhe skriptet ruhen në vetë faqen (asnjë kërkesë te Google pa pëlqim),
  harta e pronës dhe videoja ngarkohen vetëm kur klikohen, fotot me `srcset`, politikë sigurie (CSP).
- Aksesueshmëri: navigim me tastierë, fokus i dukshëm, emra për butonat, tekste për lexuesit e ekranit.

## Komanda

```
node build.js            # versioni për Netlify → dist/
node build.js --preview  # versioni për pamjen paraprake → dist-preview/
```
