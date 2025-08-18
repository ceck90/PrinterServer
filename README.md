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

```properties
# Ambiente di esecuzione
NODE_ENV=development

# Configurazione Database
DB_PATH=.data/db.sqlite

# Configurazione WebSocket Client
KITCHEN_MGMT_SERVER_URL=http://127.0.0.1:8080
WS_CLIENT_RECONNECT_ATTEMPTS=-1
WS_CLIENT_RECONNECT_DELAY_MS=2000
```

- **NODE_ENV**: Modalità ambiente (`development`, `production`, ecc.)
- **DB_PATH**: Percorso del file database SQLite (verrà creato se non esiste)
- **KITCHEN_MGMT_SERVER_URL**: Endpoint WebSocket per ricevere ordini in tempo reale
- **WS_CLIENT_RECONNECT_ATTEMPTS**: Numero massimo tentativi di riconnessione WebSocket (`-1` = infinito)
- **WS_CLIENT_RECONNECT_DELAY_MS**: Millisecondi tra i tentativi di riconnessione

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
