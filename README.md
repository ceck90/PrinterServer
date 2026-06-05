# PrinterServer

Backend per la gestione ordini e la stampa di ticket piatto su stampanti termiche Ethernet.  
Progetto sviluppato da **Roberto Ceccato - RC Projects**  
Email: [ceccato.roberto@alice.it](mailto:ceccato.roberto@alice.it)

---

## Requisiti

- [Bun](https://bun.sh) v1.2.0 o superiore
- Stampanti termiche Ethernet compatibili (porta 9100)
- Node.js solo se vuoi usare strumenti di sviluppo aggiuntivi

---

## Configurazione

Tutte le variabili di ambiente sono definite nel file `.env`:

```
# Ambiente di esecuzione
NODE_ENV=development

# Configurazione Database SQLite
DB_PATH=./data/db.sqlite

# Configurazione WebSocket Client
KITCHEN_MGMT_SERVER_URL=http://127.0.0.1:8080
WS_CLIENT_RECONNECT_ATTEMPTS=-1
WS_CLIENT_RECONNECT_DELAY_MS=2000

# Chiave di autenticazione token
TOKEN_KEY="your-secret-token-key"

# Configurazione Database GSG (PostgreSQL)
GSG_DB_HOST=127.0.0.1
GSG_DB_PORT=5432
GSG_DB_USER=postgres
GSG_DB_PASSWORD=postgres
GSG_DB_DATABASE=dbname
```

- **NODE_ENV**: Specifica l'ambiente di esecuzione dell'applicazione (`development`, `production`, ecc.).
- **DB_PATH**: Percorso del file del database SQLite (verrà creato automaticamente se non esiste).
- **KITCHEN_MGMT_SERVER_URL**: URL del server WebSocket da cui ricevere gli ordini in tempo reale.
- **WS_CLIENT_RECONNECT_ATTEMPTS**: Numero massimo di tentativi di riconnessione al WebSocket (`-1` = tentativi infiniti).
- **WS_CLIENT_RECONNECT_DELAY_MS**: Intervallo in millisecondi tra i tentativi di riconnessione al WebSocket.
- **TOKEN_KEY**: Chiave segreta utilizzata per la generazione e la verifica dei token di autenticazione.
- **BASE_PATH**: Percorso base per supporto reverse proxy (es. `/printers` se servito su `dominio.com/printers/`). Lasciare vuoto per deployment su percorso root.
- **GSG_DB_HOST**: Indirizzo host del database PostgreSQL GSG.
- **GSG_DB_PORT**: Porta di connessione al database PostgreSQL GSG.
- **GSG_DB_USER**: Nome utente per l'accesso al database PostgreSQL GSG.
- **GSG_DB_PASSWORD**: Password per l'accesso al database PostgreSQL GSG.
- **GSG_DB_DATABASE**: Nome del database PostgreSQL GSG da utilizzare.

---

## Installazione

Installa le dipendenze con Bun:

```bash
bun install
```

---

## Avvio

Avvia il server con Bun:

```bash
bun run src/main.ts
```

Il server HTTP sarà disponibile su [http://localhost:4000](http://localhost:4000).

---

## Funzionalità principali

- **Gestione ordini** tramite WebSocket (ricezione in tempo reale)
- **Stampa automatica** su stampanti termiche Ethernet configurate
- **Gestione e visualizzazione ricevute** tramite API REST
- **Seed automatico** delle stampanti se il database è vuoto
- **Configurazione centralizzata** tramite file `.env`

---

## Supporto Reverse Proxy

Il server supporta deployment dietro un reverse proxy su un percorso personalizzato. Per configurare:

1. Imposta la variabile d'ambiente `BASE_PATH` nel file `.env`:
   ```bash
   BASE_PATH=/printers
   ```

2. Configura il tuo reverse proxy per inoltrare le richieste. Esempio con Nginx:
   ```nginx
   location /printers/ {
       proxy_pass http://localhost:4000/;
       proxy_http_version 1.1;
       proxy_set_header Upgrade $http_upgrade;
       proxy_set_header Connection "upgrade";
       proxy_set_header Host $host;
       proxy_set_header X-Real-IP $remote_addr;
   }
   ```

Il server adatterà automaticamente tutti i percorsi (API, WebSocket, assets) al prefisso configurato e inietterà il corretto `<base href>` nell'HTML per il routing del frontend Angular.

---

## Struttura del progetto

- `src/` — Codice sorgente principale
- `src/controllers/` — Controller per HTTP, WebSocket, Database
- `src/print-routing.config.ts` — Configurazione e caricamento stampanti
- `src/dispatcher.ts` — Logica di gestione ordini e stampa
- `src/print.ts` — Funzione di invio dati alle stampanti
- `.env` — Configurazione ambiente
- `.data/` — Database SQLite (creato al primo avvio)

---

## 2D Barcode Examples

Example settings are the default when not specified.

```js
printer.code128("Code128", {
    width: "LARGE",          // "SMALL", "MEDIUM", "LARGE",
    height: 80,              // 50 < x < 80
    text: 2                  // 1 - No text
                             // 2 - Text on bottom
                             // 3 - No text inline
                             // 4 - Text on bottom inline
});

printer.printQR("QR Code", {
    cellSize: 3,             // 1 - 8
    correction: 'M',         // L(7%), M(15%), Q(25%), H(30%)
    model: 2                 // 1 - Model 1
                             // 2 - Model 2 (standard)
                             // 3 - Micro QR
});

printer.pdf417("PDF417", {
    rowHeight: 3,            // 2 - 8
    width: 3,                // 2 - 8
    correction: 1,           // Ratio: 1 - 40
    truncated: false,        // boolean
    columns: 0               // 1 - 30, 0 auto
});

printer.maxiCode("MaxiCode", {
    mode: 4,                 // 2 - Formatted/structured Carrier Message (US)
                             // 3 - Formatted/structured Carrier Message (International)
                             // 4 - Unformatted data with Standard Error Correction.
                             // 5 - Unformatted data with Enhanced Error Correction.
                             // 6 - For programming hardware devices.
});
```

## 1D Barcode Example

```js
var data = "GS1-128"     // Barcode data (string or buffer)
var type = 74            // Barcode type (See Reference)
var settings = {         // Optional Settings
  hriPos: 0,             // Human readable character 0 - 3 (none, top, bottom, both)
  hriFont: 0,            // Human readable character font
  width: 3,              // Barcode width
  height: 168            // Barcode height
}

printer.printBarcode(data, type, settings);
```

---

### Epson Barcode Reference

|  # | Type                         | Possible Characters                                                                      | Length of Data         |
|:--:|------------------------------|------------------------------------------------------------------------------------------|------------------------|
| 65 | UPC-A                        | 0 - 9                                                                                    | 11, 12                 |
| 66 | UPC-E                        | 0 - 9                                                                                    | 6 – 8, 11, 12          |
| 67 | JAN13                        | 0 - 9                                                                                    | 12, 13                 |
| 68 | JAN8                         | 0 - 9                                                                                    | 7, 8                   |
| 69 | Code39                       | 0 – 9, A – Z, SP, $, %, *, +, -, ., /                                                    | 1 – 255                |
| 70 | ITF (Interleaved 2 of 5)     | 0 – 9                                                                                    | 2 – 254  (even number) |
| 71 | CODABAR  (NW-7)              | 0 – 9, A – D, a – d, $, +, −, ., /, :                                                    | 2 – 255                |
| 72 | CODE93                       | 00h – 7Fh                                                                                | 1 – 255                |
| 73 | CODE128                      | 00h – 7Fh                                                                                | 2 - 255                |
| 74 | GS1-128                      | NUL – SP(7Fh)                                                                            | 2 – 255                |
| 75 | GS1 DataBar  Omnidirectional | 0 – 9                                                                                    | 13                     |
| 76 | GS1 DataBar  Truncated       | 0 – 9                                                                                    | 13                     |
| 77 | GS1 DataBar  Limited         | 0 – 9                                                                                    | 13                     |
| 78 | GS1 DataBar  Expanded        | 0 – 9, A – D, a – d, SP, !,  ", %, $, ', (, ), *, +, ,, -, .,  /, :, ;, <, =, >, ?, _, { | 2 - 255                |


---

## Note

- Il database e la tabella delle stampanti vengono creati e popolati automaticamente al primo avvio.
- Puoi modificare la configurazione delle stampanti direttamente dal database o tramite API dedicate.

---

## Supporto

Per assistenza o segnalazioni di bug, contatta l'autore all'indirizzo email fornito sopra.
