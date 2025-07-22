import { HttpServerController } from './controllers/httpserver.controller.ts';
import { DatabaseController } from './controllers/db.controller.ts';
import { WSClientController } from './controllers/ws-client.controller.ts';

console.log("Music FestOn");
console.log("Backend per gestione ordini e stampa scontrini su stampanti termiche Ethernet");

// Inizializza il controller del database
const dbController = DatabaseController.instance;
// Inizializza il server HTTP
const httpServerController = HttpServerController.instance;
// Inizializza il client WebSocket
const wsClientController = WSClientController.getInstance();

console.log("✅ Server avviato con successo!");