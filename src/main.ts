import { HttpServerController } from './controllers/httpserver.controller.ts';
import { DatabaseController } from './controllers/db.controller.ts';
import { WSClientController } from './controllers/ws-client.controller.ts';
import { loadPrintersFromDb, printerMap, savePrintersToDb } from './print-routing.config.ts';
import { printSpecificOrder } from './dispatcher.ts';
// import { printTest } from './receipt.ts';

// console.log("Music FestOn");
// console.log("Backend per gestione ordini e stampa scontrini su stampanti termiche Ethernet");
// console.log("Versione: 1.0.0");

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

// Inizializza valori da file .env

process.env.NODE_ENV = process.env.NODE_ENV || 'development';
console.log("[MAIN] ✅ Ambiente impostato su:", process.env.NODE_ENV);
console.log("[MAIN] ✅ Inizializzazione del server...");

const dbPath: string = process.env.DB_PATH || './db.sqlite';
console.log("[MAIN] ✅ Percorso del database:", dbPath);
const wsClientUrl: string = process.env.WS_CLIENT_URL || 'ws://10.10.1.12:8080';
const wsReconnectAttempts: number = parseInt(process.env.WS_CLIENT_RECONNECT_ATTEMPTS || '-1', 10);
const wsReconnectDelayMs: number = parseInt(process.env.WS_CLIENT_RECONNECT_DELAY_MS || '2000', 10);
console.log("[MAIN] ✅ URL del client WebSocket:", wsClientUrl);

// Inizializza la mappa delle stampanti


// Inizializza il controller del database
const dbController = DatabaseController.instance;
// Inizializza il server HTTP
const httpServerController = HttpServerController.instance;
// Inizializza il client WebSocket
const WSClientOptions = {
    reconnectAttempts: wsReconnectAttempts, // Numero massimo di tentativi di riconnessione
    reconnectDelayMs: wsReconnectDelayMs, // Millisecondi tra i tentativi di riconnessione
    url: wsClientUrl // URL del server WebSocket
};
const wsClientController = WSClientController.getInstance(WSClientOptions);

// Inizializza la mappa delle stampanti
// savePrintersToDb();

loadPrintersFromDb();

console.log("[MAIN] ✅ Server avviato con successo!");