# TygoAI — Setup handleiding (100% gratis versie)

Deze versie van TygoAI heeft **geen creditcard, geen betaald Firebase-plan en
geen server** nodig. Alles draait op:

* **Firebase Spark-plan** (gratis): Auth (login) + Firestore (chatgeschiedenis + instellingen)
* **GitHub Pages** (gratis): hosting van de website
* **NVIDIA API** (gratis voor dit model, zie onderaan): de AI zelf

De browser praat rechtstreeks met NVIDIA, zonder tussenliggende server. Dat
kan in dit geval veilig genoeg, omdat de app sowieso is afgesloten tot precies
1 account (van jou) — niemand anders kan ooit inloggen en dus ook nooit bij
de API-key komen.

\---

## 0\. Wat heb je nodig?

* Een Google-account (voor Firebase)
* Een GitHub-account (voor hosting)
* Node.js op je computer ([nodejs.org](https://nodejs.org), neem de LTS-versie)
* Een terminal (Terminal.app op Mac, of PowerShell/cmd op Windows)
* Je NVIDIA API key (begint met `nvapi-...`)

**Belangrijk:** je had je API key eerder per ongeluk in platte tekst gedeeld.
Ga naar [https://build.nvidia.com](https://build.nvidia.com) → API keys, en **maak een nieuwe key aan**
(en verwijder de oude). Dezelfde aanbeveling geldt voor je Gmail-wachtwoord —
verander dat ergens deze week, los van dit project.

\---

## 1\. Firebase-project aanmaken (gratis Spark-plan, geen creditcard)

1. Ga naar [https://console.firebase.google.com](https://console.firebase.google.com)
2. Klik **"Project toevoegen"**
3. Naam: bijvoorbeeld `tygoai`
4. Google Analytics: mag je uitzetten
5. Klik **Project aanmaken** en wacht tot het klaar is

Je hoeft hier **niet** te upgraden naar Blaze — Auth en Firestore werken
volledig op het gratis Spark-plan.

### 1a. Authentication inschakelen

1. Linkermenu: **Build → Authentication** → **Get started**
2. Schakel **Google** in als provider (kies een support-email, Save)
3. Schakel **E-mail/wachtwoord** in als provider (Save)

### 1b. Jouw enige account aanmaken

1. Tabblad **Users** binnen Authentication → **Add user**
2. E-mail: `tygomassalt@gmail.com`
3. Wachtwoord: **kies een nieuw wachtwoord** (niet het oude dat je eerder deelde)
4. Klik **Add user**
5. Je ziet nu een **User UID**, zoiets als `aBcD1234EfGh...`. **Kopieer dit.**

> Liever met Google inloggen? Log dan één keer in de app in met je
> Google-account zodra de site draait — Firebase maakt dan automatisch een
> gebruiker aan met een eigen UID. Gebruik dat UID dan in stap 3 in plaats
> van het e-mail/wachtwoord-account.

### 1c. Firestore database aanmaken

1. Linkermenu: **Build → Firestore Database** → **Create database**
2. Kies een locatie dichtbij jou (bijv. `eur3 (europe-west)`)
3. Kies **Start in production mode**
4. Klik **Create**

Dat is alles voor Firebase — geen Functions, geen Blaze, geen creditcard.

\---

## 2\. Firestore-rules en jouw UID instellen

1. Open het bestand `firestore.rules` in de hoofdmap van het project.
2. Zoek de regel:

```
   return request.auth != null \&\& request.auth.uid == "m5e91Bn2BXaPOaSNTIlakFehuVz1";
   ```

   Vervang `VUL\_HIER\_JOUW\_FIREBASE\_UID\_IN` door het UID uit stap 1b.

3. Installeer eenmalig de Firebase CLI:

   ```bash
   npm install -g firebase-tools
   ```

4. Log in:

   ```bash
   firebase login
   ```

5. Open `.firebaserc` en vervang `VUL\_HIER\_JE\_FIREBASE\_PROJECT\_ID\_IN` door je
echte project-ID (Firebase Console → ⚙️ Project settings → "Project ID").
6. Deploy de regels:

   ```bash
   firebase deploy --only firestore:rules
   ```

   \---

   ## 3\. Frontend configureren

1. Open `web/src/lib/firebase.js`.
2. Ga in Firebase Console naar ⚙️ **Project settings** → **"Your apps"** →
klik **</>** om een webapp te registreren (naam mag bijv. `tygoai-web`
zijn; Hosting hoef je niet aan te vinken).
3. Kopieer de `firebaseConfig`-waarden die je krijgt naar dit bestand.

   \---

   ## 4\. NVIDIA API key instellen

   Dit doe je straks gewoon **in de app zelf**, via het tandwiel-icoon
(Instellingen) nadat je bent ingelogd. Vul daar je nieuwe `nvapi-...` key in.
Hij wordt opgeslagen in Firestore, en alleen jouw account kan hem ooit lezen.

   \---

   ## 5\. Lokaal testen

   ```bash
cd web
npm install
npm run dev
```

   Open de URL die verschijnt (meestal `http://localhost:5173`). Log in met
`tygomassalt@gmail.com` en je nieuwe wachtwoord (of via Google). Ga naar
Instellingen en vul je NVIDIA key in. Stuur daarna een testbericht.

   **Werkt het niet?** Open de browser devtools (F12) → tabblad Console:

* "permission-denied" van Firestore → check of het UID in `firestore.rules`
klopt én of je de rules hebt gedeployed (stap 2.6)
* "Er is nog geen NVIDIA API key ingesteld" → ga naar Instellingen in de app
* NVIDIA 401/403-fout → key is ongeldig of verlopen, maak een nieuwe op
build.nvidia.com

  \---

  ## 6\. Live zetten via GitHub Pages (gratis, geen creditcard)

  ### 6a. Repository aanmaken

1. Ga naar [https://github.com/new](https://github.com/new)
2. Repository-naam: `tygoai` (of een andere naam — onthoud 'm)
3. Maak 'm **Public** (GitHub Pages gratis-tier vereist een publieke repo,
tenzij je een GitHub Pro-account hebt)
4. Klik **Create repository**

   ### 6b. Base-path instellen

   Open `web/vite.config.js` en check deze regel bovenin:

   ```js
const BASE\_PATH = "/tygoai/";
```

   Als je repository een andere naam dan `tygoai` heeft gekregen, verander dit
in `/jouw-repo-naam/` (met slashes ervoor en erna).

   ### 6c. Code naar GitHub pushen

   Vanuit de hoofdmap van het project:

   ```bash
git init
git add .
git commit -m "Eerste versie van TygoAI"
git branch -M main
git remote add origin https://github.com/JOUW\_GEBRUIKERSNAAM/tygoai.git
git push -u origin main
```

   ### 6d. GitHub Pages activeren

1. Ga naar je repository op GitHub → **Settings** → **Pages**
2. Bij **Source**, kies **GitHub Actions**
3. Dat is alles — de meegeleverde workflow (`.github/workflows/deploy.yml`)
bouwt en publiceert de site automatisch bij elke push naar `main`.
4. Na een paar minuten (check het tabblad **Actions** voor de voortgang)
is je site live op:

   ```
   https://JOUW\_GEBRUIKERSNAAM.github.io/tygoai/
   ```

   Vanaf nu: elke keer dat je `git push` doet, wordt de site automatisch
opnieuw gebouwd en gepubliceerd.

   \---

   ## 7\. Installeren als app op je telefoon/computer (PWA)

   **Op Android (Chrome):** open de URL → menu (⋮) → "App installeren" / "Toevoegen aan startscherm"

   **Op iPhone (Safari):** open de URL → deel-icoon → "Voeg toe aan beginscherm"

   **Op desktop (Chrome/Edge):** open de URL → installeer-icoontje in de adresbalk

   \---

   ## 8\. Hoe werkt het "Artifact"-paneel?

   Wanneer het model in zijn antwoord een codeblok teruggeeft (bijvoorbeeld
````html ... ````), verschijnt dat als een los **bestand-kaartje** in de
chat in plaats van als ruwe tekst. Klik erop om het paneel te openen:

* Bij **HTML**: standaard een **live preview**, met een knop om naar de
ruwe **Code** te schakelen.
* Bij andere talen: direct de code, met **kopiëren**/**downloaden**.

  \---

  ## 9\. Instellingen aanpassen

  Via het tandwiel-icoon in de zijbalk kun je altijd aanpassen:

* NVIDIA API key
* Model
* Temperature / Top-p
* Max tokens / Reasoning budget
* Denkproces aan/uit

  Wijzigingen gelden direct, zonder opnieuw te deployen.

  \---

  ## Waarom is dit nu 100% gratis?

* **Firebase Spark-plan**: gratis, geen creditcard. Voor 1 gebruiker komt
het Firestore-gebruik nergens in de buurt van de gratis limieten
(50.000 reads / 20.000 writes per dag).
* **GitHub Pages**: gratis voor publieke repositories.
* **NVIDIA Nemotron 3 Nano Omni**: dit specifieke model wordt door NVIDIA
gratis aangeboden via `build.nvidia.com` (let op: dit kan in de toekomst
veranderen als NVIDIA hun gratis modelaanbod aanpast — check zo nu en dan
build.nvidia.com voor de actuele status).

  **De eerdere versie van dit project gebruikte Firebase Cloud Functions** om
de API-key te verbergen, maar dat vereist het betaalde Blaze-plan (met
creditcard, ook al blijf je binnen het gratis quotum daarvan). Deze versie
slaat die stap over: de browser praat rechtstreeks met NVIDIA. De
NVIDIA-key staat daardoor zichtbaar in je eigen browser (devtools) wanneer
jij bent ingelogd — maar omdat niemand anders ooit kan inloggen, kan ook
niemand anders ooit bij die key komen.

  ## Vragen of problemen?

  Kijk eerst in de browser console (F12 → Console) voor de exacte
foutmelding. De meeste problemen zijn een verkeerd UID in `firestore.rules`,
een verkeerde `BASE\_PATH` in `vite.config.js`, of een verlopen NVIDIA key.

