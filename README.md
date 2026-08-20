# Stryktipset Expertkonsensus

En mobile-first webbapp som hämtar publicerade experttips server-side, validerar och normaliserar dem, räknar konsensus och publicerar en färdig kupong i Firestore. Frontend scrapar aldrig externa webbplatser.

## Arkitektur

```text
Rekatochklart ─┐
Bettingstugan ─┼─ GitHub Actions → validering → normalisering → konsensus
Understreckat ─┘                                      │
Svenska Spel ───── officiell kupong + streck + odds ─┤
                                                     ▼
                                   Firestore current + rounds + scrapeRuns
                                                     │
                                                     ▼
                                           React → GitHub Pages
```

Varje expert/skribent blir en egen röst. `stryktipset/current` driver startsidan, medan `rounds/{YYYY-MM-DD}` bevarar historiken och varje matchs `publicDistribution` lagrar Svenska Spels aktuella streck.

Svenska Spel behandlas inte som expert. Adaptern läser den publikt inbäddade `preloadedState`-datan på den officiella sidan och använder den som matchreferens samt för streck och eventuella odds. Understreckats publicerade systemförslag blir en separat redaktionsröst. Om deras senaste artikel avser en äldre kupong markeras källan som felaktig och övriga källor fortsätter fungera.

## Lokal start

Krav: Node.js 20+. Firebase CLI behövs bara för lokal emulator eller manuell deployment av regler.

```bash
npm install
npm install --prefix functions
cp .env.example .env.local
npm run dev
```

Utan Firebase-inställningar visar frontend en tydligt märkt demokupong. Fyll i `.env.local` för Firestore. För emulatorer, lägg dessutom till `VITE_USE_FIRESTORE_EMULATOR=true` och kör i två terminaler:

```bash
npm run emulators
npm run dev
```

## Test och bygge

```bash
npm test --prefix functions
npm run build --prefix functions
npm run build
```

Parser-fixtures finns i `functions/src/__tests__/fixtures`. De testar 13 unika matcher, lag, nummer, giltiga tecken och expert. När en källas HTML ändras ska en ny anonymiserad fixture sparas och parsern justeras innan deployment.

## Firebase-konfiguration

1. Skapa ett Firebase-projekt på Spark-planen och aktivera Firestore.
2. Ersätt `YOUR_FIREBASE_PROJECT_ID` i `.firebaserc` eller kör `firebase use --add`.
3. Ange webappens publika Firebase-konfiguration som `VITE_FIREBASE_*` i `.env.local` och motsvarande GitHub Secrets.
4. Kontrollera kontaktuppgiften i scraper-funktionens User-Agent.
5. Firestore-regler och datauppdatering körs av GitHub Actions. Frontend deployas automatiskt till GitHub Pages från `main`.

Produktionsuppdateringen körs via `.github/workflows/update-data.yml`, inte Cloud Functions. Schemat kör varje fredag klockan 04:00 svensk tid och skapar grundraden från Rekatochklart och Bettingstugan. En andra automatisk körning görs lördag klockan 12:00 svensk tid för att ta med Understreckat, vars tips normalt publiceras under lördagen. Konsensus räknas då om och ersätter fredagsraden endast om hela den nya datan valideras. Workflowet kan fortfarande startas manuellt från GitHub Actions som reserv. Därmed räcker Firebase Spark-planen.

Ett Firebase service account används endast av GitHub Actions och lagras som repository-secret `FIREBASE_SERVICE_ACCOUNT`. Firestore-reglerna ger webbläsare publik läsrätt men ingen skrivrätt; endast workflowets service account skriver data.

### Godkänna lagnamnsalias

Om en körning hittar högst tre matchavvikelser för en källa sparas de som en manuell namnkontroll. Större avvikelser behandlas som en gammal eller felaktig kupong och kan inte godkännas från frontend. Aktivera Email/Password i Firebase Authentication och skapa det gemensamma kontot `tstipset@gmail.com`. Endast det kontot får godkänna föreslagna alias enligt `firestore.rules`. Efter ett godkännande startas `Update Stryktipset data` manuellt från GitHub Actions; ingen GitHub-token exponeras i webbläsaren.

## Säker publicering och drift

Varje källa måste ge exakt 13 validerade matcher per expert. Matchnummer och normaliserade lag jämförs mellan källorna. Om någon källa fallerar loggas körningen i `scrapeRuns`, men `stryktipset/current` och historiken lämnas helt orörda. Därmed kan trasig eller halv data inte ersätta den senast fungerande kupongen.

Scrapers använder vanlig HTTP, 15 sekunders timeout, tydlig User-Agent och Cheerio. Kontrollera alltid källornas användarvillkor och robots-policy innan produktion. Käll-URL:er hittas från respektive Stryktips-index i stället för att hårdkoda en vecka.

## GitHub Actions

`ci.yml` testar och bygger frontend/functions. `pages.yml` publicerar frontend på GitHub Pages från `main`. `update-data.yml` sköter scraping, Firestore-skrivning och deployment av Firestore-regler utan Cloud Functions. Lägg in `FIREBASE_SERVICE_ACCOUNT` och alla `VITE_FIREBASE_*` från `.env.example` som GitHub Secrets.

Skapa service account-nyckeln via Firebase Console → Project settings → Service accounts → Generate new private key. Lägg hela JSON-innehållet i GitHub → Settings → Secrets and variables → Actions som `FIREBASE_SERVICE_ACCOUNT`. Nyckelfilen får aldrig checkas in.

## Systemregler

- Alla singeltecken identiska → spik.
- Minst 67 % stöd eller ett gemensamt tecken i alla tips → konsensus och dubbeltecken.
- Motstridiga röster → helgardering.
- Övrigt utspritt stöd → gardering.

Reglerna finns i `functions/src/consensus/engine.ts` och är deterministiska. Antalet rader är produkten av antalet tecken i de 13 systemtipsen.
