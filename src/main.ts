import { HttpServerController } from './controllers/httpserver.controller.ts';
import { DatabaseController } from './controllers/db.controller.ts';
import { GSGController } from './controllers/gsg.controller.ts';
import { KitchenManagementController, WSClientController } from './controllers/kitchenmgmt.controller.ts';
import { loadPrintersFromDb, seedPrintersIfDbEmpty } from './print-routing.config.ts';
import { JobController } from "./controllers/cron.controller.ts";
import { printSpecificOrder } from './dispatcher.ts';
import * as fs from 'fs';
import * as path from 'path';
import { Client } from 'pg';
import { gsg_queries } from './gsg-helper.ts';
// import { printTest } from './receipt.ts';

/**
 * Banner informativo visualizzato all'avvio del server.
 */
const banner = `
==============================================
                Music FestOn
 Backend per gestione e stampa ticket piatto
 con stampanti termiche Ethernet

 Versione:  1.0.0
 Autore:    Roberto Ceccato - RC Projects
 Email:     ceccato.roberto@alice.it
==============================================
`;

console.log(banner);

console.log("Inizializzazione del server...");

// ==================
// Inizializzazione ambiente e variabili globali
// ==================

const envPath = path.resolve(process.cwd(), '.env');
if (!fs.existsSync(envPath)) {
    const defaultEnv = `# Default .env file
        DB_PATH=./data/db.sqlite
        KITCHEN_MGMT_SERVER_URL=http://127.0.0.1:8080
        WS_CLIENT_RECONNECT_ATTEMPTS=-1
        WS_CLIENT_RECONNECT_DELAY_MS=2000
        TOKEN_KEY="05q8GiW=atxs"
        NODE_ENV=development
    `;
    fs.writeFileSync(envPath, defaultEnv, { encoding: 'utf8' });
    console.log("[MAIN] ⚠️  File .env non trovato. Creato file .env di default.");
}

/**
 * Imposta la variabile d'ambiente NODE_ENV se non già presente.
 */
process.env.NODE_ENV = process.env.NODE_ENV || 'development';
console.log("[MAIN] ✅ Ambiente impostato su:", process.env.NODE_ENV);
console.log("[MAIN] ✅ Inizializzazione del server...");

/**
 * Percorso del database, configurabile tramite variabile d'ambiente.
 */
const dbPath: string = process.env.DB_PATH || './data/db.sqlite';
console.log("[MAIN] ✅ Percorso del database:", dbPath);

/**
 * Parametri di connessione WebSocket, configurabili tramite variabili d'ambiente.
 */

const kitchenMgmtServerUrl: string = process.env.KITCHEN_MGMT_SERVER_URL || 'http://127.0.0.1:8080';
const wsReconnectAttempts: number = parseInt(process.env.WS_CLIENT_RECONNECT_ATTEMPTS || '-1', 10);
const wsReconnectDelayMs: number = parseInt(process.env.WS_CLIENT_RECONNECT_DELAY_MS || '2000', 10);
console.log("[MAIN] ✅ URL del client WebSocket:", kitchenMgmtServerUrl);

// ==================
// Inizializzazione componenti principali
// ==================

/**
 * Inizializza il controller del database (singleton).
 * Questo crea le tabelle e prepara il DB.
 */
const dbController = DatabaseController.getInstance(dbPath);

/**
 * Inizializza il server HTTP (singleton).
 * Definisce tutte le route e avvia il listener.
 */
const httpServerController = HttpServerController.instance;

/**
 * Opzioni per il controller di gestione della cucina (singleton).
 * Configurazione dell'URL del server di gestione della cucina.
 */
const kitchenManagementOptions = {
    url: kitchenMgmtServerUrl
};

const kitchenManagementController = KitchenManagementController.getInstance(kitchenManagementOptions);

/**
 * Inizializza il client WebSocket STOMP (singleton) con le opzioni di riconnessione.
 * Si connette al server STOMP per ricevere ordini in tempo reale.
 */

const WSClientOptions = {
    reconnectAttempts: wsReconnectAttempts, // Numero massimo di tentativi di riconnessione
    reconnectDelayMs: wsReconnectDelayMs,   // Millisecondi tra i tentativi di riconnessione
    url: kitchenMgmtServerUrl                        // URL del server WebSocket
};
const wsClientController = WSClientController.getInstance(WSClientOptions);

const gsgController = GSGController.getInstance(new Client({
    host: '10.10.1.12',
    port: 5432,
    user: 'postgres',
    password: 'postgres',
    database: 'sagra'
}));

await gsgController.start().catch(err => {
    console.error("[GSG] errore durante l'avvio:", err);
});

// const gsgQueryResult = await gsgController.query(gsg_queries.elencoArticoli, ['2025-01-01', '2025-09-30']);
// const gsgQueryResult = await gsgController.query(gsg_queries.elencoArticoli);
// console.log("[GSG] Risultato query elencoArticoli:", gsgQueryResult.rows);


// ==================
// Inizializzazione e caricamento stampanti
// ==================

/**
 * Popola la tabella printers nel database se è vuota (seed iniziale).
 */
seedPrintersIfDbEmpty();

/**
 * Carica tutte le stampanti dal database e aggiorna l'array globale printers.
 */
loadPrintersFromDb();

// ==================
// Inizializzazione Job Controller
// ==================

/**
 * Inizializza il controller dei job (singleton).
 */
const jobController = JobController.getInstance();

// Log eventi
jobController
    .on("job:start",  id => console.log(`[${id}] start`))
    .on("job:success", (id, when) => console.log(`[${id}] Completed @ ${when.toISOString()}`))
    .on("job:error",  (id, err) => console.error(`[${id}] Error:`, err))
    .on("job:paused", id => console.log(`[${id}] Paused`))
    .on("job:resumed", id => console.log(`[${id}] Resumed`))
    .on("job:removed", id => console.log(`[${id}] Removed`))
    .on("shutdown", () => console.log(`Shutdown`));

    // const id = Bun.randomUUIDv7();
    // console.log(id);

  // Esempio: job ogni 5s
jobController.create({
    id: "PING",
    name: "Ping Logger",
    cron: "*/60 * * * * *", // ogni 60 secondi (syntax con seconds abilitata da node-cron)
    timezone: "Europe/Rome",
    task: () => {
        console.log(`[JOB - PING] Ping...`);
        httpServerController.broadcast({ type: 'ping', timestamp: new Date().toISOString() });
        // console.log(httpServerController.listClients());
    },
    startNow: true,
    meta: { env: process.env.NODE_ENV ?? "development" },
  });

console.log("[MAIN] ✅ Server avviato con successo!");

process.on("SIGINT", () => {
    console.log("[MAIN] 🚨 Interruzione del processo...");
    jobController.stopAll();
    gsgController.stop();
    process.exit(0);
});
process.on("SIGTERM", () => {
    console.log("[MAIN] 🚨 Interruzione del processo...");
    jobController.stopAll();
    gsgController.stop();
    process.exit(0);
});