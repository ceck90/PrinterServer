import { HttpServerController } from './controllers/httpserver.controller.ts';
import { DatabaseController } from './controllers/db.controller.ts';
import { KitchenManagementController, WSClientController } from './controllers/kitchenmgmt.controller.ts';
import { loadPrintersFromDb, seedPrintersIfDbEmpty } from './print-routing.config.ts';
import { printSpecificOrder } from './dispatcher.ts';
import * as fs from 'fs';
import * as path from 'path';
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
        DB_PATH=./db.sqlite
        KITCHEN_MGMT_SERVER_URL=http://127.0.0.1:8080
        WS_CLIENT_RECONNECT_ATTEMPTS=-1
        WS_CLIENT_RECONNECT_DELAY_MS=2000
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
const dbPath: string = process.env.DB_PATH || './db.sqlite';
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
const dbController = DatabaseController.instance;

/**
 * Inizializza il server HTTP (singleton).
 * Definisce tutte le route e avvia il listener.
 */
const httpServerController = HttpServerController.instance;

/**
 * Inizializza il client WebSocket (singleton) con le opzioni di riconnessione.
 * Si connette al server WebSocket per ricevere ordini in tempo reale.
 */

const kitchenManagementOptions = {
    url: kitchenMgmtServerUrl
};

const kitchenManagementController = KitchenManagementController.getInstance(kitchenManagementOptions);

const WSClientOptions = {
    reconnectAttempts: wsReconnectAttempts, // Numero massimo di tentativi di riconnessione
    reconnectDelayMs: wsReconnectDelayMs,   // Millisecondi tra i tentativi di riconnessione
    url: kitchenMgmtServerUrl                        // URL del server WebSocket
};
const wsClientController = WSClientController.getInstance(WSClientOptions);


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

console.log("[MAIN] ✅ Server avviato con successo!");