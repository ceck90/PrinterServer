# PrinterServer — Panoramica del Progetto

> **Versione:** 1.2.1 — aggiornato al 07-05-2026  
> **Autore:** Roberto Ceccato — RC Projects  
> **Runtime:** Bun (non Node.js)

---

## 1. Scopo del progetto

PrinterServer è il backend che collega il sistema di gestione ordini della cucina (**KMS — Kitchen Management Server**) alle **stampanti termiche ESC/POS Ethernet** nei vari punti di produzione (PIADINE, PANINI, TOAST, PIATTI UNICI, COPERTI).

Riceve gli ordini in tempo reale via **WebSocket STOMP/SockJS** e in fase di sincronizzazione tramite **REST**, decide su quale stampante mandare il ticket, e lo stampa via **TCP sulla porta 9100**.

Espone anche un'interfaccia web (Angular SPA servita dalla cartella `www/`) per la gestione stampanti, la visualizzazione delle ricevute e le statistiche di cassa.

---

## 2. Architettura generale

```
                        ┌─────────────────────────────────────────────┐
                        │            PrinterServer (Bun)              │
                        │                                             │
  [KMS]────STOMP/WS────►│ WSClientController     ──► dispatcher.ts    │
  [KMS]────REST────────►│ KitchenMgmtController  ──► dispatcher.ts    │
                        │                         │                   │
  [GSG PostgreSQL]─────►│ GSGController           │                   │
    LISTEN new_order    │                         ▼                   │
                        │                   handleIncomingOrder()     │
                        │                         │                   │
                        │                ┌────────┴────────┐          │
                        │                ▼                 ▼          │
                        │        enqueuePrinterJob   saveReceipt      │
                        │                │                 │          │
                        │        sendToPrinter()      SQLite DB       │
                        │             TCP/9100                        │
                        └─────────────────────────────────────────────┘
                                         │
                          ┌──────────────┼──────────────┐
                          ▼              ▼              ▼
                     [PIADINE]       [PANINI]      [TOAST] ...
                    Stampante      Stampante      Stampante
                    ESC/POS        ESC/POS        ESC/POS
```

---

## 3. File sorgente — `src/`

### 3.1 Entry point

#### `main.ts`
Punto di ingresso dell'applicazione. Eseguito da Bun all'avvio.

Responsabilità:
- Legge e crea il file `.env` se assente (con valori di default)
- Inizializza nell'ordine:
  1. `DatabaseController` (SQLite)
  2. `HttpServerController` (server HTTP + WebSocket UI)
  3. `KitchenManagementController` (REST client verso KMS)
  4. `WSClientController` (STOMP/SockJS client verso KMS)
  5. `GSGController` (PostgreSQL LISTEN/NOTIFY)
  6. `seedPrintersIfDbEmpty()` + `loadPrintersFromDb()` (stampanti)
  7. `JobController` con 3 cron job attivi
- Gestisce `SIGINT`/`SIGTERM` per shutdown pulito

**Variabili d'ambiente lette:**

| Variabile | Default | Descrizione |
|---|---|---|
| `DB_PATH` | `./data/db.sqlite` | Percorso file SQLite |
| `KITCHEN_MGMT_SERVER_URL` | `http://127.0.0.1:8080` | URL del KMS |
| `WS_CLIENT_RECONNECT_ATTEMPTS` | `-1` (infinito) | Tentativi riconnessione STOMP |
| `WS_CLIENT_RECONNECT_DELAY_MS` | `2000` | Delay riconnessione STOMP |
| `TOKEN_KEY` | `""` | Secret per token auth |
| `HTTP_SERVER_PORT` | `4000` | Porta HTTP |
| `GSG_DB_HOST/PORT/USER/PASSWORD/DATABASE` | localhost/5432/postgres/postgres/sagra | PostgreSQL GSG |
| `NODE_ENV` | `development` | Ambiente |
| `BASE_PATH` | `""` | Prefisso path per reverse proxy |

---

### 3.2 Logica di business

#### `dispatcher.ts`
**Cuore dell'applicazione.** Riceve gli ordini normalizzati e li smista alle stampanti.

Funzioni esportate:

| Funzione | Descrizione |
|---|---|
| `setResyncCallback(fn)` | Registra la callback di resync (evita circular dep.) |
| `setFetchItemCallback(fn)` | Registra la callback per fetch singolo ordine per ID |
| `handleIncomingData(data)` | Processa un messaggio STOMP grezzo del topic `/topic/pkmi` |
| `handleSingleOrderData(items[])` | Processa un array di ordini (da sync/resync REST) |
| `handleIncomingOrder(order)` | Routing → idempotency → stampa su coda per-stampante |
| `reconcileMissedOrders(ids[])` | Recovery ordini TODO→DONE persi nel debounce del resync |
| `printSpecificOrder(id)` | Ristampa un ordine specifico per ID (da API REST) |
| `printTestTicket(printerKey)` | Stampa ticket di test su una stampante specifica |
| `regenerateSpecificReceipt(id)` | Rigenera il buffer di un receipt esistente |

Costanti rilevanti:
- `RESYNC_DEBOUNCE_MS = 3000` — finestra di debounce per il resync
- `INTER_PRINT_DELAY_MS = 100` — pausa tra stampe consecutive sulla stessa stampante
- `_printerQueues: Map<string, Promise<void>>` — coda per-stampante (serializzazione)

Per il flusso dettagliato vedere [async-message-flow.md](async-message-flow.md).

---

#### `print-routing.config.ts`
Gestione della configurazione delle stampanti.

- `PrinterConfig` — tipo che descrive una stampante (key, name, ip, port, destination, active, upsideDown, beepEnable)
- `printers: PrinterConfig[]` — array globale caricato dal DB e usato ovunque
- `seedPrintersIfDbEmpty()` — popola la tabella `printers` se vuota (prima installazione)
- `loadPrintersFromDb()` — ricarica l'array `printers` dal DB (da chiamare dopo ogni modifica)

Destinazioni di default nel seed:

| Chiave | Destinazione |
|---|---|
| `piadine` | PIADINE |
| `panini` | PANINI |
| `toast` | TOAST |
| `piattiunici` | PIATTI UNICI |
| `coperti` | COPERTI |

---

#### `tickets.ts`
Genera i buffer ESC/POS per la stampa.

| Funzione | Descrizione |
|---|---|
| `buildKitchenTicket(order, dest, items)` | Builder v1 — usa `escpos-buffer` + logo PNG |
| `buildKitchenTicket_v2(order, dest, items, upsideDown, beepEnable)` | Builder v2 — usa `node-thermal-printer`, supporta stampa capovolta e beep |
| `buildSittingPlaceTicket(order, dest, items)` | Ticket per posto a sedere (non usato in produzione) |
| `buildTestTicket(printerName)` | Ticket di test per verifica connessione |

Il builder v2 è quello attivamente usato. Stampa: logo MFO, destinazione, tipo piatto, flag asporto, numero ordine, tavolo, cliente, note piatto, note ordine.

---

#### `print.ts`
Invio fisico del buffer alla stampante via TCP.

- `sendToPrinter(name, ip, port, buffer)` — wrapper pubblico; imposta flag `printing=true` per 5s
- `sendToPrinterInternal(...)` — connessione TCP con `Bun.connect`, timeout 1s, write buffer + `sock.end()`

---

#### `printer-status.ts`
Polling dello stato hardware delle stampanti.

Usa comandi ESC/POS:
- `DLE EOT 1/2/3/4` — stato generale, offline, errori, carta
- `GS a 0` — comando alternativo per stampanti cinesi

Funzioni principali:
- `checkPrinterStatus(printer)` — interroga una stampante e aggiorna `printerStatusMap`
- `checkAllPrintersStatus(printers[])` — eseguito dal cron ogni 2 minuti
- `getPrinterStatus(name)` / `getAllPrinterStatuses()` — lettura stato corrente
- `setPrinterPrinting(name, value)` — flag in-stampa (settato da `print.ts`)

Invia `PrinterStatusChangeEvent` via WebSocket UI quando lo stato cambia.

---

### 3.3 Tipi e utilities

#### `types.ts`
Definizioni TypeScript centrali.

| Tipo | Descrizione |
|---|---|
| `OrderItem` | Singolo articolo (nome, tavolo, cliente, note, dest, qty, takeAway) |
| `OrderPayload` | Ordine completo (orderId, orderNumber, status, items[]) |
| `ReceiptLog` | Ricevuta di stampa salvata nel DB |
| `PrinterStatus` | Stato hardware stampante (online, paperEnd, coverOpen, ecc.) |
| `PrinterStatusChangeEvent` | Evento di cambio stato |
| `JobDefinition` / `JobInfo` / `UpdateJobInput` | Definizioni cron job |

---

#### `logger.ts`
Logger centralizzato con livelli:
- `debug(msg)` — solo se `DEBUG=true` o `NODE_ENV=development`
- `info(msg)` — sempre
- `warn(msg)` — sempre
- `error(msg)` — sempre

---

#### `utils.ts`
- `groupBy<T>(array, getKey)` — raggruppa un array per chiave stringa (usato per raggruppare items per destinazione)

---

#### `users.ts`
Gestione password con **Argon2id** (`@node-rs/argon2`):
- `hashPassword(plain)` — genera hash con salt (memoryCost 19MB, timeCost 2)
- `verifyPassword(plain, hashed)` — verifica

---

#### `gsg-helper.ts`
Raccolta di query SQL PostgreSQL per il database del sistema cassa GSG.

Query disponibili:
- `totali` — KPI generali (ordini, incasso, scontrino medio, coperto/asporto)
- `perArea` — breakdown per area
- `trendOrario` — trend orario
- `perPagamento` — per tipo pagamento
- `piazzaVsAsporto` — dine-in vs asporto
- `topArticoli` — top 50 articoli venduti
- `topAggregati` — top categorie
- `righePerOrdineConTipologia` / `righePerOrdineConTipologiaUnprocessed` — righe ordini GSG

---

### 3.4 Controllers — `src/controllers/`

#### `db.controller.ts` — `DatabaseController`
Singleton SQLite via `bun:sqlite` (API **sincrona** — nessun `await`).

Schema database:

| Tabella | Scopo |
|---|---|
| `receipts` | Storico stampe — fonte idempotency (`orderId UNIQUE`) |
| `printers` | Configurazione stampanti (ip, port, dest, active, ecc.) |
| `settings` | Impostazioni generiche (inutilizzata al momento) |
| `barcodes` | Scansioni barcode (code, timestamp, success) |
| `tokens` | Token auth (non usati attivamente) |
| `users` | Utenti login (username, password Argon2id) |
| `gsg_orders` | Ordini provenienti dal sistema GSG |
| `todo_plate_cache` | Cache persistente plate originale ordini TODO |

Metodi principali:

| Metodo | Descrizione |
|---|---|
| `getReceiptByIdAndStatus(id, status)` | Check idempotency pre-stampa |
| `saveReceipt(log)` | Salva ricevuta post-stampa |
| `getPrinterSettings()` | Lista stampanti |
| `savePrinterSettings(data)` | Inserisce/aggiorna stampante |
| `saveTodoPlate(orderId, plateName)` | INSERT OR IGNORE plate originale |
| `getTodoPlate(orderId)` | Legge plate originale |
| `deleteTodoPlate(orderId)` | Rimuove dopo stampa |
| `getAllTodoPlateCache()` | Lista completa per reconciliation |
| `backupDatabase(path)` | Backup file SQLite (mantiene ultimi 10) |
| `checkIntegrity()` | PRAGMA integrity_check |
| `getUserByUsername(username)` | Auth login |

---

#### `httpserver.controller.ts` — `HttpServerController`
Singleton Elysia (framework HTTP per Bun). Gestisce tutte le route REST e il WebSocket push verso la UI.

**Autenticazione:** token base64 con payload `{exp, key}` — scadenza 10 ore. Verificato via header `Authorization: Bearer <token>`.

**Route REST:**

| Metodo | Path | Descrizione |
|---|---|---|
| POST | `/api/login` | Autenticazione — restituisce token |
| POST | `/api/verify-token` | Verifica validità token |
| GET | `/assets/*` | File statici Angular (www/assets/) |
| GET | `/media/*` | File media (immagini ecc.) |
| WS | `/api/ws` | WebSocket push notifiche UI |
| GET | `/api/ws/status` | Lista client WS connessi |
| GET | `/api/receipts` | Lista ricevute (con filtri) |
| POST | `/api/receipts/:id/print` | Ristampa ricevuta per ID |
| POST | `/api/receipts/:id/printAt` | Ristampa su stampante specifica |
| GET | `/api/printers/getAll` | Lista stampanti configurate |
| POST | `/api/printers/add` | Aggiunge stampante |
| POST | `/api/printers/update` | Aggiorna stampante |
| POST | `/api/printers/delete/:key` | Elimina stampante |
| POST | `/api/printers/saveAll` | Salva batch di stampanti |
| POST | `/api/printers/test/:key` | Stampa ticket di test |
| GET | `/api/printers/status` | Stato hardware tutte le stampanti |
| GET | `/api/printers/status/:name` | Stato hardware stampante specifica |
| POST | `/api/printers/check-status` | Forza check stato immediato |
| GET | `/api/barcodes/getAll` | Lista scansioni barcode |
| POST | `/api/barcodes/add/:id` | Registra scansione barcode |
| GET | `/api/statistics/totals` | KPI generali GSG |
| GET | `/api/statistics/trend` | Trend orario GSG |
| GET | `/api/statistics/by-area` | Per area GSG |
| GET | `/api/statistics/by-payment` | Per tipo pagamento GSG |
| GET | `/api/statistics/channel` | Piazza vs asporto GSG |
| GET | `/api/statistics/top-products` | Top prodotti GSG |
| GET | `/api/statistics/top-categories` | Top categorie GSG |
| GET | `/api/statistics/by-cashier` | Per cassa GSG |
| GET | `/api/statistics/by-table` | Per tavolo GSG |
| GET | `/api/statistics/departments` | Per reparto GSG |
| GET | `/api/statistics/total-covers` | Totale coperti GSG |

**WebSocket (`/api/ws`) — tipi di notifica broadcast:**

| Tipo | Quando |
|---|---|
| `NEW_TICKETS` | Ogni ordine in ingresso (prima della stampa) |
| `RECEIPT_PRINTED` | Stampa completata con successo |
| `RECEIPT_PRINT_FAILED` | Stampa fallita |
| `PRINTER_STATUS_CHANGE` | Cambio stato hardware stampante |
| `ping` | Heartbeat periodico (cron PING — commentato) |

---

#### `kitchenmgmt.controller.ts` — `WSClientController` + `KitchenManagementController`

**`WSClientController`** — Client STOMP/SockJS verso il KMS.
- Singleton con riconnessione automatica (backoff su retry)
- `_pkmiQueue: Promise<void>` — coda seriale messaggi STOMP
- All'`onConnect`: esegue sync iniziale REST + registra callback resync e fetchItem + sottoscrive topic
- Topic: `/topic/greetings` (log) e `/topic/pkmi` (ordini)

**`KitchenManagementController`** — Client REST verso il KMS.
- `fetchItems(statuses[], pageSize?)` — GET `/plate-item?statuses=...` con auto-paginazione via `Promise.all`
- `fetchItemById(id)` — GET `/plate-item/{id}` — usato da `reconcileMissedOrders`

---

#### `gsg.controller.ts` — `GSGController`
Client PostgreSQL per il sistema cassa GSG. Usa `LISTEN/NOTIFY`.

- Si connette al DB e fa `LISTEN new_order`
- Heartbeat ogni N secondi per mantenere la connessione attiva
- Backoff esponenziale (1s → 15s) su errore/disconnect con riconnessione automatica
- Alla notifica `new_order` → `onNotification()` → `handleIncomingOrderFromGSG()` in dispatcher
- `queue[]` + `isProcessing` — coda interna per serializzare i notify in arrivo

---

#### `cron.controller.ts` — `JobController`
Scheduler cron basato su `node-cron`. Singleton con EventEmitter.

API: `create(def)`, `get(id)`, `pause(id)`, `resume(id)`, `runNow(id)`, `remove(id)`, `stopAll()`

**Job attivi:**

| ID | Cron | Descrizione |
|---|---|---|
| `GSG_QUEUE` | ogni 10 min | Processa coda ordini da GSG (predisposto, task vuota) |
| `DB_BACKUP` | ogni 30 min | Backup file SQLite (mantiene ultimi 10) |
| `PRINTER_STATUS_CHECK` | ogni 2 min | `checkAllPrintersStatus(printers)` |

---

#### `statistics.controller.ts` — `StatisticsController`
Wrapper che esegue le query da `gsg-helper.ts` sul client PostgreSQL GSG.

- `getTotals(startDate, endDate)` — KPI
- `getTrend(startDate, endDate)` — trend orario
- `getByArea(...)` — per area
- `getByPayment(...)` — per pagamento
- (e così via per tutte le query GSG)

---

## 4. Dipendenze esterne principali

| Libreria | Scopo |
|---|---|
| `elysia` | Framework HTTP per Bun |
| `stompjs` + `sockjs-client` | Client WebSocket STOMP |
| `node-thermal-printer` | Generazione buffer ESC/POS (builder v2) |
| `escpos-buffer` + `escpos-buffer-image` | Generazione buffer ESC/POS (builder v1, logo PNG) |
| `node-cron` | Scheduler cron job |
| `pg` | Client PostgreSQL per GSG |
| `bun:sqlite` | SQLite nativo Bun (sincrono) |
| `@node-rs/argon2` | Hashing password Argon2id |
| `dotenv` | Lettura file `.env` |

---

## 5. Dati persistenti — SQLite (`data/db.sqlite`)

```
data/
  db.sqlite                          ← database attivo
  db.sqlite.backup-<timestamp>.sqlite ← backup automatici (ultimi 10)
  gsg_db/
    new_order_function.sql           ← DDL funzione PostgreSQL GSG
```

---

## 6. Frontend — `src/www/`

Angular SPA pre-compilata (bundle di produzione). Servita direttamente da `HttpServerController` come file statici.

Funzionalità UI:
- Gestione stampanti (lista, aggiunta, modifica, test, stato hardware)
- Storico ricevute e ristampa
- Statistiche di cassa GSG
- Configurazione sistema

Localizzazione: `assets/i18n/en.json` e `it.json`.

---

## 7. Integrazione con sistemi esterni

### Kitchen Management Server (KMS)
- **STOMP WebSocket** (`/ws` con SockJS) → topic `/topic/pkmi` — ordini in tempo reale
- **REST** `GET /plate-item?statuses=TODO,PROGRESS` — sync iniziale e resync
- **REST** `GET /plate-item/{id}` — fetch singolo ordine per reconciliation

### GSG (sistema cassa)
- **PostgreSQL LISTEN** `new_order` — notify su nuovo ordine
- **REST queries** (via `StatisticsController`) — statistiche per la dashboard UI

### Stampanti termiche ESC/POS
- **TCP port 9100** — invio buffer via `Bun.connect`
- **DLE EOT / GS a** — polling stato hardware (online, carta, errori)

---

## 8. Flow globale — avvio sistema

```
1. main.ts
   ├─ DatabaseController.getInstance(dbPath)
   │     └─ initializeDatabase() → crea tutte le tabelle
   │
   ├─ HttpServerController.instance
   │     └─ Elysia listen(:4000)
   │
   ├─ KitchenManagementController.getInstance(url)
   │
   ├─ WSClientController.getInstance(options)
   │     └─ connect() → SockJS → STOMP
   │           onConnect:
   │             ├─ fetchItems(TODO,PROGRESS) → handleSingleOrderData → stampa PROGRESS
   │             ├─ setResyncCallback(...)
   │             ├─ setFetchItemCallback(...)
   │             └─ subscribe /topic/pkmi → _pkmiQueue → handleIncomingData
   │
   ├─ GSGController.getInstance(pgConfig)
   │     └─ start() → connectAndListen() → LISTEN new_order
   │
   ├─ seedPrintersIfDbEmpty() + loadPrintersFromDb()
   │
   └─ JobController.getInstance()
         ├─ GSG_QUEUE (ogni 10min)
         ├─ DB_BACKUP (ogni 30min)
         └─ PRINTER_STATUS_CHECK (ogni 2min)
```

Per il dettaglio del flusso degli eventi STOMP e della logica di stampa, vedere [async-message-flow.md](async-message-flow.md).
