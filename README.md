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

## Note

- Il database e la tabella delle stampanti vengono creati e popolati automaticamente al primo avvio.
- Puoi modificare la configurazione delle stampanti direttamente dal database o tramite API dedicate.

---

## Supporto

Per assistenza o segnalazioni di bug, contatta l'autore all'indirizzo email fornito sopra.
