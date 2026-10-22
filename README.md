# ISA Consulting & Properties – faqja e internetit

Faqe statike dygjuhëshe (shqip / anglisht) me SEO të plotë. Nuk ka nevojë për server apo databazë:
`node build.js` krijon gjithë faqen në dosjen `dist/`. Nuk ka paketa npm për të instaluar.

## Ku ndryshohen të dhënat

| Çfarë | Skedari | Te paneli (/admin) |
|---|---|---|
| Emri, emri ligjor, NIPT, ndërmjetësi, telefoni, WhatsApp, email, adresa, orari, Instagram, Facebook, Google, domeni | `data/site.json` | Cilësimet → Agjencia dhe kontaktet |
| Pronat (një skedar për pronë: `data/listings/101.json` …); edhe automatikisht nga Instagram-i (shih **Instagram** më poshtë) | `data/listings/` | Pronat |
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

## Instagram → pronat (automatikisht)

Çdo orë GitHub lexon postimet e reja të llogarisë së Instagram-it dhe çdo postim prone e shton te faqja
(`scripts/instagram-import.js`, puna `.github/workflows/instagram.yml`). Është falas te GitHub (repository publike);
çdo pronë që del online është një publikim te Netlify (15 kredite), si te paneli. Pa sekretin `IG_ACCESS_TOKEN` nuk bën asgjë.

### Si shkruhet postimi

```
Apartament 2+1 me pamje nga Parku i Madh
Shitje
Zona: Blloku
Lloji: Apartament
Çmimi: 185.000 €
2+1 · 110 m² · kati 6/9
Banjo: 2
Karakteristika: ashensor, parkim, ballkon, ngrohje qendrore
Hipoteka: po

Përshkrimi i lirë, sa rreshta të duash.

#isaproperties #tirana
```

- **Rreshti i parë** është titulli. **"Shitje"** ose **"Qira"** shkruhet në rresht më vete (vlen edhe "Shitet …" / "Jepet me qira …" në fillim të titullit).
- **Zona** me emrin si te lista e zonave (Blloku, Komuna e Parisit, Liqeni i Thatë, Qendër, Kodra e Diellit, Astir, Durrës, Golem, Vlorë, Sarandë, Ksamil);
  vlen edhe rreshti `📍 Blloku, Tiranë`. **Lloji:** apartament / garsonierë, vilë / shtëpi, zyrë / dyqan / ambient, truall.
- **Çmimi** si `185.000 €`, `185k`, `1,2 mln` ose "me marrëveshje"; për qiranë çmimi për muaj.
- Opsionale: `Kodi: 120` (përndryshe merr kodin e radhës), `Neto:`, `Truall:`, `Gjendja:`, `Viti:`, `Deti: 300 m`, `Orientimi:`,
  `Depozita: 2 muaj`, `Afati: 1 vit`, `E lirë nga: 01.12.2026`, `Statusi: e rezervuar / e shitur`, `Agjenti:` (si te ekipi),
  `Video:` (link), `Përshkrimi:` (çdo gjë pas tij është përshkrim).
- Numrat e telefonit, `@emrat`, hashtag-et dhe emojit nuk kalojnë në faqe. Rreshtat me shkronja të mëdha kthehen në shkrim normal.
- Fotot e postimit (deri në 20) bëhen fotot e pronës, pa të dhënat e kamerës. Te një video merret kopertina, dhe videoja lidhet te prona.
- Titulli dhe përshkrimi në anglisht krijohen vetë nga të dhënat; mund të përmirësohen te paneli.

### Çfarë ndodh

- **Postim i plotë** (shitje/qira, lloji, zona, të paktën një foto): del online brenda orës.
- **Postim i paplotë:** ruhet **i fshehur**. Te paneli → Pronat → filtri *Të fshehura* → hape: te *Shënim i brendshëm* shkruhet çfarë mungon.
  Plotësoje, hiq *Fshih plotësisht nga faqja* dhe kliko *Publish*.
- **Postimet që nuk janë prona** (urime, ekipi) anashkalohen: postim prone është ai me rreshtin "Shitje"/"Qira", me `Kodi:`, ose me `Zona:` dhe `Çmimi:`.
- **Ndryshimi i përshkrimit** në Instagram përditëson pronën; **fshirja e postimit** e fsheh pronën. Por pasi prona ruhet një herë te paneli,
  **paneli fiton** dhe Instagram-i nuk e prek më.
- Kur prona shitet ose jepet me qira, ndrysho *Statusi* te paneli (ose shto `Statusi: e shitur` te përshkrimi i postimit).
- Merren vetëm postimet pas lidhjes. Për postimet e vjetra: GitHub → Actions → Instagram → Run workflow → `since` = data (VVVV-MM-DD).
  Postimet më të vjetra se 180 ditë nuk ndiqen më (ndryshimet e tyre bëhen te paneli).
- `data/instagram.json` mban mend cili postim u bë cila pronë. Mos e ndrysho me dorë.
- Nëse puna dështon (p.sh. çelësi skadoi), GitHub dërgon email dhe te Actions → Instagram shihet arsyeja në shqip.

### Lidhja (një herë)

1. **Instagram:** llogaria duhet të jetë *Professional* (Business ose Creator) dhe publike.
2. **Meta:** te developers.facebook.com krijo një app të tipit *Business* → shto produktin *Instagram* →
   *API setup with Instagram login* → shto llogarinë e Instagram-it → *Generate token*. Çelësi vlen 60 ditë.
   App-i mbetet në *Development mode*; nuk duhet App Review, sepse lexon vetëm llogarinë e vet.
3. **GitHub** → Settings → Secrets and variables → Actions → *New repository secret*: `IG_ACCESS_TOKEN` = çelësi.
4. **Rifreskimi automatik i çelësit** (çdo të hënë): krijo te GitHub (llogaria personale) → Settings → Developer settings →
   Fine-grained tokens një token vetëm për këtë repository me *Secrets: Read and write*, dhe ruaje si sekret `IG_SECRETS_PAT`.
   Pa të, çelësi i Instagram-it skadon pas 60 ditësh dhe duhet krijuar sërish me dorë.
5. **Prova:** Actions → Instagram → Run workflow → `preview`. Tregon si lexohen 5 postimet e fundit, pa ndryshuar asgjë.
6. **Nëse prova thotë që nuk vijnë përshkrimet**, përdoret lidhja përmes Facebook-ut: Instagram-i lidhet me një faqe Facebook,
   te app-i shtohet *Instagram API with Facebook login* (lejet `instagram_basic`, `pages_show_list`, `pages_read_engagement`),
   te Actions → Variables vendos `IG_GRAPH_HOST` = `graph.facebook.com` dhe `IG_USER_ID` = ID-ja e llogarisë së Instagram-it,
   dhe si `IG_ACCESS_TOKEN` vendos *Page access token*-in e faqes (i marrë nga një token afatgjatë, nuk skadon).

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
node scripts/instagram-import.js --check      # kontrollon që kodet e pronave të jenë unike
node scripts/instagram-import.js --preview 5  # si lexohen 5 postimet e fundit (me IG_ACCESS_TOKEN), pa ndryshuar asgjë
```
