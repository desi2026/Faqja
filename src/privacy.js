// Privacy and cookie policy text. TEMPLATE: have it reviewed by the agency's lawyer before going live.
// (s, lang, o) -> HTML. s = site settings; o.ga / o.pixel = Google Analytics 4 / Meta Pixel are configured.
// The build replaces {date} in the last line.
const e = (x) => String(x == null ? "" : x)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

module.exports = (s, lang, o = {}) => {
  const ga = !!o.ga, px = !!o.pixel, any = ga || px;
  const brand = e(s.brand);
  const who = e(s.legalName || s.brand);
  const nipt = s.nipt ? `, NIPT ${e(s.nipt)}` : "";
  const email = e(s.email);
  const mail = `<a href="mailto:${email}">${email}</a>`;
  const phone = e(s.phoneDisplay);
  const address = e(s.address);
  const idp = `<a href="https://www.idp.al" target="_blank" rel="noopener">www.idp.al</a>`;

  if (lang === "sq") {
    const name = s.legalName ? `${who}, që vepron me emrin ${brand} ("ne"),` : `${brand} ("ne")`;
    const cookieChoices = ga && px ? `veçmas "Statistika" dhe "Marketing"` : `kategorinë "${ga ? "Statistika" : "Marketing"}"`;
    return `
<p>Kjo politikë shpjegon si ${name} mbledh dhe përdor të dhënat tuaja personale kur vizitoni faqen tonë ose na kontaktoni. Ne jemi kontrolluesi i këtyre të dhënave dhe i përpunojmë ato në përputhje me Ligjin nr. 124/2024 "Për mbrojtjen e të dhënave personale".</p>
<h2>Kush jemi</h2>
<p>Kontrolluesi i të dhënave është ${who}${nipt}, ${address}. Email: ${mail}, telefon: ${phone}.</p>
<h2>Çfarë të dhënash mbledhim</h2>
<ul>
<li><strong>Formulari për pronarët (Shitni ose jepni me qira pronën tuaj):</strong> emri, numri i telefonit, email-i (opsional) dhe të dhënat e pronës që na dërgoni.</li>
<li><strong>Formulari për vizita në faqet e pronave (Kërkoni një vizitë):</strong> emri, numri i telefonit, email-i (opsional), koha që ju përshtatet për vizitën, mesazhi juaj dhe kodi i pronës për të cilën pyesni.</li>
<li><strong>WhatsApp, telefon dhe email:</strong> numri ose adresa juaj dhe mesazhet që na dërgoni kur na kontaktoni direkt. WhatsApp është shërbim i Meta dhe ka politikën e vet të privatësisë.</li>${ga ? `
<li><strong>Statistika (vetëm me pëlqim):</strong> me Google Analytics 4 (Google) mbledhim të dhëna të pseudonimizuara për mënyrën si përdoret faqja, si faqet që vizitoni, pajisjen dhe shfletuesin, së bashku me një identifikues të ruajtur në cookie. Google përpunon edhe adresën tuaj IP për të nxjerrë vendndodhjen e përafërt.</li>` : ""}${px ? `
<li><strong>Reklama (vetëm me pëlqim):</strong> me Meta Pixel (Meta Platforms) regjistrojmë shikimet e faqeve, dërgimin e formularëve dhe klikimet në WhatsApp ose në telefon, së bashku me identifikues të ruajtur në cookies. Meta mund t'i lidhë këto të dhëna me llogarinë tuaj në Facebook ose Instagram.</li>` : ""}
<li><strong>Regjistrat teknikë:</strong> ofruesi i hostimit regjistron automatikisht të dhëna teknike, si adresën IP dhe llojin e shfletuesit, për sigurinë e faqes.</li>
</ul>${any ? "" : `
<p>Faqja nuk përdor cookies për statistika apo reklama.</p>`}
<h2>Pse i përdorim dhe baza ligjore</h2>
<ul>
<li><strong>Për t'ju përgjigjur</strong> kur na kontaktoni, kur na dërgoni formularin për pronarët ose kur kërkoni një vizitë. Baza ligjore: marrja e masave me kërkesën tuaj para lidhjes së një kontrate.</li>${any ? `
<li><strong>${ga && px ? "Statistika dhe reklama" : ga ? "Statistika" : "Reklama"}:</strong> ${ga ? "për të kuptuar si përdoret faqja dhe për ta përmirësuar" : ""}${ga && px ? ", si dhe " : ""}${px ? "për të matur dhe për të përmirësuar reklamat tona" : ""}. Baza ligjore: pëlqimi juaj, të cilin mund ta tërhiqni në çdo kohë.</li>` : ""}
<li><strong>Dokumentet pas një marrëveshjeje:</strong> kur lidhet një kontratë, ruajmë të dhënat që ligji na detyron t'i mbajmë. Baza ligjore: detyrimi ligjor.</li>
<li><strong>Regjistrat e sigurisë:</strong> për ta mbrojtur faqen nga keqpërdorimi dhe sulmet. Baza ligjore: interesi ynë i ligjshëm.</li>
</ul>
<p>Emri dhe numri i telefonit nevojiten që t'ju përgjigjemi; email-i është opsional. Nëse nuk i jepni, nuk mund t'i përgjigjemi kërkesës që dërgoni nga formulari.</p>
<h2>Kujt ia japim</h2>
<p>Nuk i shesim të dhënat tuaja. Ua japim vetëm ofruesve të mëposhtëm, për aq sa nevojitet që faqja të funksionojë dhe që t'ju përgjigjemi:</p>
<ul>
<li><strong>Netlify, Inc.:</strong> hostimi i faqes dhe marrja e formularëve. Serverët ndodhen në SHBA.</li>
<li><strong>Google:</strong> ${ga ? "Google Analytics, vetëm me pëlqimin tuaj; " : ""}YouTube, vetëm kur klikoni për të luajtur videon e një prone. Videoja ngarkohet nga youtube-nocookie.com.</li>
<li><strong>Meta Platforms:</strong> ${px ? "Meta Pixel, vetëm me pëlqimin tuaj; " : ""}WhatsApp, kur na shkruani atje.</li>
<li><strong>OpenStreetMap Foundation:</strong> pllakat e hartës në faqen e hartës, si dhe në faqen e pronës vetëm pasi klikoni "Shfaq hartën". Kur ngarkohet harta, kjo palë merr adresën tuaj IP.</li>
<li><strong>Autoritetet publike</strong>, kur ligji e kërkon.</li>
</ul>
<p>Shkronjat (fontet) dhe biblioteka e hartës ngarkohen nga faqja jonë, jo nga palë të treta.</p>
<h2>Transferimi jashtë Shqipërisë</h2>
<p>Netlify, Google dhe Meta i përpunojnë të dhënat në SHBA dhe në vende të tjera. Këto transferime mbështeten në certifikimin e tyre sipas Kuadrit të Privatësisë së të Dhënave BE-SHBA (EU-US Data Privacy Framework) ose në klauzola kontraktuale standarde.</p>
<h2>Sa kohë i ruajmë</h2>
<ul>
<li>Kërkesat nga formularët dhe njoftimet përkatëse me email i ruajmë deri në 24 muaj nga kontakti i fundit. Pas kësaj i fshijmë nga paneli i formularëve dhe nga kutitë postare.</li>
<li>Nëse lidhet një kontratë, zbatohen afatet e ruajtjes që përcakton ligji.</li>${ga ? `
<li>Cookies e Google Analytics ruhen deri në 14 muaj.</li>` : ""}${px ? `
<li>Cookie _fbp e Meta ruhet deri në 90 ditë.</li>` : ""}
</ul>
<h2>Cookies</h2>${any ? `
<p>Faqja funksionon pa cookies. Cookies për ${ga && px ? "statistika dhe reklama" : ga ? "statistika" : "reklama"} vendosen vetëm pasi i zgjidhni në njoftimin për cookies. Aty mund të zgjidhni ${cookieChoices} dhe të përdorni butonat "Refuzoj të gjitha", "Ruaj zgjedhjen" ose "Pranoj të gjitha".</p>
<ul>${ga ? `
<li><strong>_ga, _ga_*</strong> (Google Analytics, statistika): dallojnë vizitorët dhe vizitat. Ruhen deri në 14 muaj.</li>` : ""}${px ? `
<li><strong>_fbp</strong> (Meta Pixel, marketing): identifikon shfletuesin për matjen e reklamave. Ruhet deri në 90 ditë.</li>` : ""}
</ul>
<p>Zgjedhjen mund ta ndryshoni ose ta tërhiqni në çdo kohë me "Cilësimet e cookies" në fund të çdo faqeje. Tërheqja e pëlqimit është po aq e lehtë sa dhënia e tij dhe i fshin këto cookies.</p>` : `
<p>Faqja nuk vendos cookies. Shfletuesi juaj mund të ruajë vetëm ndonjë cilësim lokal të faqes, që mbetet në pajisjen tuaj.</p>`}
<h2>Të drejtat tuaja</h2>
<p>Keni të drejtë:</p>
<ul>
<li>të kërkoni qasje në të dhënat që kemi për ju;</li>
<li>të kërkoni korrigjimin e të dhënave të pasakta;</li>
<li>të kërkoni fshirjen e të dhënave;</li>
<li>të kërkoni kufizimin e përpunimit;</li>
<li>të kundërshtoni përpunimin;</li>
<li>të kërkoni transferueshmërinë e të dhënave, pra t'i merrni në një format të zakonshëm elektronik;</li>
<li>të tërhiqni pëlqimin në çdo kohë, ${any ? `me "Cilësimet e cookies" ose me email` : "me email"}. Tërheqja nuk ndikon në përpunimin e bërë para saj.</li>
</ul>
<p>Për t'i ushtruar këto të drejta, na shkruani në ${mail}. Keni gjithashtu të drejtë të ankoheni te Komisioneri për të Drejtën e Informimit dhe Mbrojtjen e të Dhënave Personale (${idp}). Vizitorët nga BE-ja dhe Zona Ekonomike Evropiane kanë edhe të drejtat sipas Rregullores së Përgjithshme për Mbrojtjen e të Dhënave (GDPR) dhe mund të ankohen te autoriteti i mbrojtjes së të dhënave në shtetin e tyre anëtar.</p>
<p class="muted">Përditësuar së fundmi: {date}</p>`;
  }

  const name = s.legalName ? `${who}, trading as ${brand} ("we"),` : `${brand} ("we")`;
  const cookieChoices = ga && px ? `"Statistics" and "Marketing" separately` : `the "${ga ? "Statistics" : "Marketing"}" category`;
  return `
<p>This policy explains how ${name} collects and uses your personal data when you visit our website or contact us. We are the controller of this data and process it in line with Law No. 124/2024 "On Personal Data Protection".</p>
<h2>Who we are</h2>
<p>The data controller is ${who}${nipt}, ${address}. Email: ${mail}, phone: ${phone}.</p>
<h2>What data we collect</h2>
<ul>
<li><strong>Owner form (Sell or rent out your property):</strong> your name, phone number, email (optional) and the property details you send us.</li>
<li><strong>Viewing form on property pages (Request a viewing):</strong> your name, phone number, email (optional), the time that suits you for the viewing, your message and the code of the property you are asking about.</li>
<li><strong>WhatsApp, phone and email:</strong> your number or address and the messages you send when you contact us directly. WhatsApp is a Meta service with its own privacy policy.</li>${ga ? `
<li><strong>Statistics (only with consent):</strong> with Google Analytics 4 (Google) we collect pseudonymous data about how the site is used, such as the pages you visit, your device and browser, together with an identifier stored in a cookie. Google also processes your IP address to work out your approximate location.</li>` : ""}${px ? `
<li><strong>Advertising (only with consent):</strong> with Meta Pixel (Meta Platforms) we record page views, form submissions and clicks on WhatsApp or phone links, together with identifiers stored in cookies. Meta may link this data to your Facebook or Instagram account.</li>` : ""}
<li><strong>Technical logs:</strong> our hosting provider automatically logs technical data, such as your IP address and browser type, to keep the site secure.</li>
</ul>${any ? "" : `
<p>This site does not use statistics or advertising cookies.</p>`}
<h2>Why we use it and on what legal basis</h2>
<ul>
<li><strong>To reply to you</strong> when you contact us, send us the owner form or request a viewing. Legal basis: steps taken at your request before entering into a contract.</li>${any ? `
<li><strong>${ga && px ? "Statistics and advertising" : ga ? "Statistics" : "Advertising"}:</strong> ${ga ? "to understand how the site is used and improve it" : ""}${ga && px ? ", and " : ""}${px ? "to measure and improve our advertising" : ""}. Legal basis: your consent, which you can withdraw at any time.</li>` : ""}
<li><strong>Records after a deal:</strong> when a contract is signed, we keep the data the law requires us to keep. Legal basis: legal obligation.</li>
<li><strong>Security logs:</strong> to protect the site from misuse and attacks. Legal basis: our legitimate interest.</li>
</ul>
<p>We need your name and phone number to reply to you; email is optional. If you do not provide them, we cannot reply to the request you send through the form.</p>
<h2>Who receives it</h2>
<p>We do not sell your data. We share it only with the providers below, and only as far as needed to run the site and reply to you:</p>
<ul>
<li><strong>Netlify, Inc.:</strong> website hosting and form submissions. Its servers are in the USA.</li>
<li><strong>Google:</strong> ${ga ? "Google Analytics, only with your consent; " : ""}YouTube, only when you click play on a property video. The video is loaded from youtube-nocookie.com.</li>
<li><strong>Meta Platforms:</strong> ${px ? "Meta Pixel, only with your consent; " : ""}WhatsApp, when you write to us there.</li>
<li><strong>OpenStreetMap Foundation:</strong> map tiles on the map page, and on property pages only after you click "Show map". When the map loads, it receives your IP address.</li>
<li><strong>Public authorities</strong>, where the law requires it.</li>
</ul>
<p>Fonts and the map library are loaded from our own site, not from third parties.</p>
<h2>Transfers outside Albania</h2>
<p>Netlify, Google and Meta process data in the USA and other countries. These transfers rely on the companies' certification under the EU-US Data Privacy Framework or on standard contractual clauses.</p>
<h2>How long we keep it</h2>
<ul>
<li>We keep form enquiries and the matching email notifications for up to 24 months after our last contact. After that we delete them from the forms dashboard and from our mailboxes.</li>
<li>If a contract is signed, the retention periods set by law apply.</li>${ga ? `
<li>Google Analytics cookies are kept for up to 14 months.</li>` : ""}${px ? `
<li>The Meta _fbp cookie is kept for up to 90 days.</li>` : ""}
</ul>
<h2>Cookies</h2>${any ? `
<p>The site works without cookies. ${ga && px ? "Statistics and advertising cookies are" : ga ? "Statistics cookies are" : "Advertising cookies are"} set only after you choose them in the cookie notice. There you can choose ${cookieChoices} and use the buttons "Reject all", "Save choices" or "Accept all".</p>
<ul>${ga ? `
<li><strong>_ga, _ga_*</strong> (Google Analytics, statistics): tell visitors and visits apart. Kept for up to 14 months.</li>` : ""}${px ? `
<li><strong>_fbp</strong> (Meta Pixel, marketing): identifies your browser to measure advertising. Kept for up to 90 days.</li>` : ""}
</ul>
<p>You can change or withdraw your choice at any time with "Cookie settings" at the bottom of every page. Withdrawing consent is as easy as giving it, and it removes these cookies.</p>` : `
<p>This site sets no cookies. Your browser may only store a local site setting, which stays on your device.</p>`}
<h2>Your rights</h2>
<p>You have the right to:</p>
<ul>
<li>access the data we hold about you;</li>
<li>have inaccurate data corrected;</li>
<li>have your data erased;</li>
<li>restrict processing;</li>
<li>object to processing;</li>
<li>data portability, meaning you receive your data in a common electronic format;</li>
<li>withdraw your consent at any time, ${any ? `with "Cookie settings" or by email` : "by email"}. Withdrawal does not affect processing carried out before it.</li>
</ul>
<p>To use these rights, write to us at ${mail}. You also have the right to complain to the Information and Data Protection Commissioner (Komisioneri për të Drejtën e Informimit dhe Mbrojtjen e të Dhënave Personale, ${idp}). Visitors in the EU and the European Economic Area also have rights under the General Data Protection Regulation (GDPR) and may complain to the data protection authority of their member state.</p>
<p class="muted">Last updated: {date}</p>`;
};
