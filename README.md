# MeinKursHeft - Technisches Geruest (Proof of Concept)

Notenplattform fuer Lehrer (muendliche und schriftliche Noten). Dieses Geruest
zeigt nur das Zusammenspiel von Frontend, Backend und Datenbank inklusive
Live-Synchronisation - noch ohne fachliche Funktionalitaet oder Design.

## Techstack

- **Frontend**: React Native Web (Expo, SDK 57)
- **Backend**: Node.js, Express, Socket.IO
- **Datenbank**: SQLite (`sql.js`, dateibasiert unter `backend/data/meinkursheft.sqlite`)

## Architektur

1. Der Client (Web/RNW) verbindet sich per WebSocket (`socket.io-client`) mit
   dem Backend.
2. Beim Verbindungsaufbau sendet der Server den aktuellen DB-Stand
   (`grades:init`).
3. Eine Eingabe im Formular ruft `grade:create` auf; der Server validiert,
   schreibt synchron in SQLite und broadcastet das Ergebnis (`grade:created`)
   an alle verbundenen Clients - inklusive des Senders.
4. `GET /api/grades` liefert denselben Datenbestand als REST-Fallback.

## Backend starten

```bash
cd backend
npm install
npm start        # Server auf http://localhost:4000
npm test         # Jest: DB-Unit-Tests + Live-Sync-Integrationstests
```

## Frontend starten

```bash
cd frontend
npm install
npm run web       # Expo Web Dev-Server
npm test          # Jest: Unit-Tests fuer den Socket-Service
```

Backend-URL im Frontend per Env-Variable ueberschreibbar:
`EXPO_PUBLIC_API_URL=http://localhost:4000`

## Tests

- `backend/tests/db.test.js` - Unit-Tests fuer das SQLite-Datenzugriffsmodul.
- `backend/tests/sync.test.js` - Integrationstests: simuliert Client-Eingaben
  per WebSocket und prueft, dass sie synchron in der Datenbank landen und an
  andere Clients live gebroadcastet werden.
- `frontend/src/services/__tests__/socketService.test.js` - Unit-Tests fuer
  die Client-seitige Sync-Schicht (Eingabe -> Socket-Event -> Serverantwort).
