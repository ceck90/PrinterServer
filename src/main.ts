import { HttpServerController } from './controllers/httpserver.controller.ts';
import { DatabaseController } from './controllers/db.controller.ts';
import { WSClientController } from './controllers/ws-client.controller.ts';
import { loadPrintersFromDb, printerMap, savePrintersToDb } from './print-routing.config.ts';
import { printSpecificOrder } from './dispatcher.ts';

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

// Inizializza il controller del database
const dbController = DatabaseController.instance;
// Inizializza il server HTTP
const httpServerController = HttpServerController.instance;
// Inizializza il client WebSocket
const wsClientController = WSClientController.getInstance();

// console.log(dbController.getAllReceipts(100, "PRINTED"));

// printerMap = loadPrintersFromDb().then((loadedMap) => {
//     console.log("[PRINT] Stampanti caricate dal database:", loadedMap);
//     return loadedMap;
// }).catch(err => {
//     console.error("[PRINT] Errore durante il caricamento delle stampantidal database:", err);
//     return printerMap; // Ritorna la mappa originale in caso di errore
// });

// printSpecificOrder(5);

// savePrintersToDb();

console.log("[MAIN] ✅ Server avviato con successo!");