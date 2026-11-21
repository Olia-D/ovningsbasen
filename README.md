# Övningsbasen

Övningar på svenska för mellanstadiet: lär dig, testa dig, blandat test.

- `index.html`, `app.js`, `style.css`: appen (statisk, GitHub Pages)
- `content/manifest.json`: ämnen och uppdrag
- `content/*.json`: ett uppdrag per fil
- `tests/walkthrough.py`: automatisk genomgång (Playwright)

## Synk mellan enheter (valfritt)

Framsteg sparas i webbläsaren. För att synka mellan enheter används Firebase Firestore (gratis Spark-plan) via REST, utan SDK:

1. Skapa ett Firebase-projekt, lägg till en webbapp och skapa en Firestore-databas.
2. Klistra in `firestore.rules` under Firestore → Rules och publicera.
3. Fyll i `projectId` och `apiKey` i `sync-config.js`.
4. I appen: 🔄 Synk → Slå på synk → öppna länken på nästa enhet.

Inga namn eller personuppgifter sparas – bara framsteg under en slumpad kod.
