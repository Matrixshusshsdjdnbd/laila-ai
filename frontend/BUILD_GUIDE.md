# LAILA AI — Guida Build & Pubblicazione Google Play

## Prerequisiti

1. **Node.js** installato (v18+)
2. **Account Expo** gratuito → https://expo.dev/signup
3. **Account Google Play Developer** ($25 una tantum) → https://play.google.com/console

---

## STEP 1: Scarica il progetto

Scarica il codice dal pulsante **"Download Code"** su Emergent, oppure usa **"Save to GitHub"** e clona il repo.

---

## STEP 2: Installa le dipendenze

```bash
# Entra nella cartella frontend
cd frontend

# Installa le dipendenze
yarn install

# Installa EAS CLI globalmente
npm install -g eas-cli
```

---

## STEP 3: Login su Expo

```bash
eas login
```
Inserisci email e password del tuo account Expo.

---

## STEP 4: Configura il progetto EAS

```bash
eas build:configure
```

Questo collegherà il progetto al tuo account Expo e genererà un `projectId`.

**IMPORTANTE:** Dopo questo comando, aggiorna `app.json` con il `projectId` generato:
```json
"extra": {
  "eas": {
    "projectId": "IL_TUO_PROJECT_ID_QUI"
  }
}
```

---

## STEP 5: Configura il Backend URL

Prima del build, devi configurare l'URL del tuo backend di produzione.

Apri `frontend/.env` e cambia `EXPO_PUBLIC_BACKEND_URL` con l'URL del tuo server di produzione:

```
EXPO_PUBLIC_BACKEND_URL=https://il-tuo-server-produzione.com
```

**Opzioni per il backend:**
- **Railway** (consigliato, facile): https://railway.app
- **Render**: https://render.com
- **DigitalOcean**: https://digitalocean.com
- **VPS con Docker**

---

## STEP 6: Genera il file AAB

```bash
# Build produzione per Android (file .aab)
eas build --platform android --profile production
```

⏱️ Il build richiede circa **10-20 minuti** sui server Expo.

Al termine, riceverai un link per scaricare il file `.aab`.

---

## STEP 7: Pubblica su Google Play

### 7a. Crea l'app su Google Play Console
1. Vai su https://play.google.com/console
2. Clicca **"Crea app"**
3. Inserisci:
   - Nome: **LAILA AI - Africa Smart Assistant**
   - Lingua: Inglese (o la lingua principale)
   - Tipo: App
   - Gratuita o a pagamento

### 7b. Carica il file AAB
1. Vai a **Produzione → Crea nuova release**
2. Carica il file `.aab` scaricato
3. Aggiungi note di rilascio:
   ```
   LAILA AI v1.0.0 - Africa Smart Assistant
   - AI Chat in multiple languages (French, English, Italian, Wolof)
   - Language translation
   - CV Builder, Job Finder, Business Ideas
   - Student homework help
   - Voice-to-text input
   ```

### 7c. Compila la scheda dello Store
- **Titolo**: LAILA AI - Africa Smart Assistant
- **Descrizione breve**: Your AI assistant for work, study, and daily life in Africa
- **Descrizione completa**:
  ```
  LAILA AI is a powerful, free AI assistant designed for people in Africa.

  Features:
  🤖 Smart AI Chat - Ask anything, get clear answers
  🌍 Multi-language - French, English, Italian, Wolof
  💼 Career Help - Create CVs, find jobs, get business ideas
  📚 Study Assistant - Homework help with step-by-step explanations
  🎯 Content Creator - Social media posts, professional messages
  🎤 Voice Input - Speak instead of typing

  Simple. Fast. Powerful. Made for Africa.
  ```
- **Screenshot**: Cattura 4-5 screenshot dell'app dal telefono
- **Icona**: Usa l'icona generata (1024x1024)
- **Categoria**: Produttività o Strumenti

### 7d. Pubblica
1. Completa il questionario sulla privacy
2. Seleziona i paesi target (Africa, Europa, Mondo)
3. Clicca **"Invia per revisione"**

La revisione Google richiede 1-7 giorni.

---

## Comandi utili

```bash
# Build APK per test (installabile direttamente)
eas build --platform android --profile preview

# Build iOS (richiede account Apple Developer $99/anno)
eas build --platform ios --profile production

# Aggiorna l'app senza nuovo build (solo JS changes)
eas update --branch production

# Controlla stato build
eas build:list
```

---

## Struttura file per il build

```
frontend/
├── app.json          ← Configurazione app (nome, icone, permessi)
├── eas.json          ← Profili di build (dev, preview, production)
├── .env              ← URL backend (CAMBIARE per produzione!)
├── assets/
│   └── images/
│       ├── icon.png           ← Icona app (1024x1024)
│       ├── adaptive-icon.png  ← Icona Android adattiva
│       ├── splash-icon.png    ← Splash screen
│       └── favicon.png        ← Favicon web
├── app/
│   ├── _layout.tsx    ← Layout con tab navigation
│   ├── index.tsx      ← Chat screen principale
│   ├── translate.tsx  ← Traduzione
│   ├── assistants.tsx ← Assistenti AI
│   └── history.tsx    ← Cronologia
└── package.json
```

---

## FAQ

**Q: Quanto costa pubblicare su Google Play?**
R: $25 una tantum per l'account developer. Il build con EAS è gratuito (1 build/giorno gratis).

**Q: Posso testare prima di pubblicare?**
R: Sì! Usa `eas build --platform android --profile preview` per generare un APK installabile direttamente.

**Q: Come aggiorno l'app dopo la pubblicazione?**
R: Per aggiornamenti JavaScript, usa `eas update`. Per aggiornamenti nativi (permessi, librerie), fai un nuovo build.

**Q: Devo avere un Mac per iOS?**
R: No, EAS Build funziona nel cloud. Ma serve un account Apple Developer ($99/anno).

---

**Buona fortuna con LAILA AI! 🚀🌍**
