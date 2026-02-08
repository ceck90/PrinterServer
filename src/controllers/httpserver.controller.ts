import Elysia from "elysia";
import { readFileSync } from "fs";
import { join } from "path";
import { DatabaseController } from "./db.controller";
import { printSpecificOrder, printTestTicket, regenerateSpecificReceipt } from "../dispatcher";
import { loadPrintersFromDb, printers } from "../print-routing.config";
import { KitchenManagementController } from "./kitchenmgmt.controller";
import { GSGController } from "./gsg.controller";
import { StatisticsController } from "./statistics.controller";
import { ServerWebSocket } from "bun";
import { config } from "dotenv";
import { verify } from "crypto";
import { verifyPassword } from "../users";
import { getAllPrinterStatuses, getPrinterStatus, checkAllPrintersStatus } from "../printer-status";
import * as logger from "../logger.ts";


/**
 * Controller singleton per la gestione del server HTTP tramite Elysia.
 * Definisce le route per pagine statiche, asset e API.
 */
export class HttpServerController {
    private readonly app = new Elysia();

    static #instance: HttpServerController;

    private wsClients = new Map<string, ServerWebSocket<any>>();
    private wsClientIds = new WeakMap<ServerWebSocket<any>, string>();
    private readonly instanceId = crypto.randomUUID();

    /**
     * Costruttore privato: definisce tutte le route HTTP.
     */
    private constructor() {
        logger.debug(`[HttpServerController] Constructor called - creating new instance with ID: ${this.instanceId}`);
        logger.debug("[HttpServerController] wsClients map initialized:", this.wsClients instanceof Map);

        //#region TOKEN
        // Simple authentication middleware
        // Carica TOKEN_SECRET da file .env
        config();
        const TOKEN_SECRET = process.env.TOKEN_KEY ?? "";
        const TOKEN_EXPIRY_MS = 600 * 60 * 1000; // 10 ore
        
        // Base path per supporto proxy reverse (es. "/printers" se servito su dominio.com/printers/)
        const BASE_PATH = process.env.BASE_PATH?.replace(/\/$/, '') ?? ""; // rimuove trailing slash
        console.log(`[SERVER] Base path configured: '${BASE_PATH || '/'}'`);

        function generateToken(): string {
            const payload = {
            exp: Date.now() + TOKEN_EXPIRY_MS,
            key: TOKEN_SECRET
            };
            // console.log("Generated token payload:", payload);
            return Buffer.from(JSON.stringify(payload)).toString("base64");
        }

        function verifyToken(token?: string): boolean {
            if (!token) return false;
            try {
                const payload = JSON.parse(Buffer.from(token, "base64").toString("utf8"));
                return typeof payload.exp === "number" && payload.exp > Date.now() && payload.key === TOKEN_SECRET;
            } catch {
                return false;
            }
        }
        //#endregion TOKEN

        //#region LOGIN API

        this.app.post(`${BASE_PATH}/api/login`, async ({ request }) => {
            // console.log("[LOGIN] Login attempt");
            const { username, password } = await request.json();
            if (!username || !password) {
                return new Response("Missing username or password", { status: 400 });
            }
            console.log(`[LOGIN] Attempting login for user: ${username}`);
            // Verifica le credenziali
            const user = await DatabaseController.getInstance().getUserByUsername(username) as { id:number, password: string } | null;
            // console.log("[LOGIN] User fetched from DB:", user ? "found" : "not found", user);
            if (!user || !user.password || !await verifyPassword(password, user.password)) {
                console.log("[LOGIN] Invalid credentials");
                return new Response("Invalid credentials", { status: 401 });
            }
            
            const token = generateToken();
            // Login avvenuto con successo
            // console.log(`[LOGIN] Successful login for user: ${username} with token: ${token}`);
            return new Response(JSON.stringify({ token }), {
                headers: { "Content-Type": "application/json" }
            });
        });

        this.app.post(`${BASE_PATH}/api/verify-token`, ({ request, body }) => {
            const token = request.headers.get("authorization")?.replace("Bearer ", "") ?? "";
            if (!verifyToken(token)) {
                return new Response("Unauthorized", { status: 401 });
            }
            return new Response(JSON.stringify({ valid: true }), {
                headers: { "Content-Type": "application/json" }
            });
        });

        // Auth middleware for protected pages
        const requireAuth = (handler: (ctx: any) => Response) => {
            return (ctx: any) => {
                // console.log(`[AUTH] Request:`, ctx.request);
                const token = ctx.request.headers.get("authorization")?.replace("Bearer ", "") ||
                new URL(ctx.request.url).searchParams.get("token");
                if (!verifyToken(token)) {
                return new Response(null, {
                    status: 302,
                    headers: { "Location": `${BASE_PATH}/login` }
                });
            }
            return handler(ctx);
            };
        };

        const requireApiAuth = (handler: (ctx: any) => Response) => {
            return (ctx: any) => {
                const token = ctx.request.headers.get("authorization")?.replace("Bearer ", "") ||
                new URL(ctx.request.url).searchParams.get("token");
                if (!verifyToken(token)) {
                    return new Response(null, {
                        status: 401
                    });
                }
                return handler(ctx);
            };
        };

        //#endregion LOGIN API

        //#region ROUTES
        // Route per servire asset statici (immagini, font, etc. nella cartella assets/)
        this.app.get(`${BASE_PATH}/assets/*`, ({ request }) => {
            const url = new URL(request.url);
            let pathname = url.pathname;
            // Rimuove BASE_PATH se presente
            if (BASE_PATH && pathname.startsWith(BASE_PATH)) {
                pathname = pathname.substring(BASE_PATH.length);
            }
            // Rimuove /assets/ dal path
            const assetPath = pathname.replace(/^\/assets\//, "");
            const filePath = join(import.meta.dir, "../www/assets", assetPath);

            try {
                const file = readFileSync(filePath);
                const ext = filePath.split('.').pop()?.toLowerCase();
                const contentTypes: Record<string, string> = {
                    "js": "application/javascript",
                    "css": "text/css",
                    "png": "image/png",
                    "jpg": "image/jpeg",
                    "jpeg": "image/jpeg",
                    "svg": "image/svg+xml",
                    "ico": "image/x-icon",
                    "html": "text/html",
                    "json": "application/json",
                    "woff": "font/woff",
                    "woff2": "font/woff2",
                    "ttf": "font/ttf",
                    "eot": "application/vnd.ms-fontobject"
                };
                const contentType = contentTypes[ext || ""] || "application/octet-stream";
                return new Response(file, { 
                    headers: { 
                        "Content-Type": contentType,
                        "Cache-Control": "public, max-age=31536000, immutable"
                    } 
                });
            } catch {
                return new Response("Not found", { status: 404 });
            }
        });

        // Route per servire media (immagini, video, etc. nella cartella media/)
        this.app.get(`${BASE_PATH}/media/*`, ({ request }) => {
            const url = new URL(request.url);
            let pathname = url.pathname;
            // Rimuove BASE_PATH se presente
            if (BASE_PATH && pathname.startsWith(BASE_PATH)) {
                pathname = pathname.substring(BASE_PATH.length);
            }
            // Rimuove /media/ dal path
            const mediaPath = pathname.replace(/^\/media\//, "");
            const filePath = join(import.meta.dir, "../www/media", mediaPath);

            try {
                const file = readFileSync(filePath);
                const ext = filePath.split('.').pop()?.toLowerCase();
                const contentTypes: Record<string, string> = {
                    "png": "image/png",
                    "jpg": "image/jpeg",
                    "jpeg": "image/jpeg",
                    "gif": "image/gif",
                    "svg": "image/svg+xml",
                    "webp": "image/webp",
                    "mp4": "video/mp4",
                    "webm": "video/webm"
                };
                const contentType = contentTypes[ext || ""] || "application/octet-stream";
                return new Response(file, { 
                    headers: { 
                        "Content-Type": contentType,
                        "Cache-Control": "public, max-age=31536000, immutable"
                    } 
                });
            } catch {
                return new Response("Not found", { status: 404 });
            }
        });

        // Catch-all: serve static files o index.html
        this.app.all("*", ({ request }) => {
            const url = new URL(request.url);
            let pathname = url.pathname;
            
            // Rimuove il BASE_PATH dal pathname per il matching interno
            if (BASE_PATH && pathname.startsWith(BASE_PATH)) {
                pathname = pathname.substring(BASE_PATH.length);
            }
            
            // Se è una chiamata API, non serve file statici
            if (pathname.startsWith("/api/")) {
                return new Response("API endpoint not found", { status: 404 });
            }
            
            // Prova a servire il file statico dalla root di www
            const fileName = pathname.substring(1); // rimuove il leading "/"
            const filePath = join(import.meta.dir, "../www", fileName);
            
            try {
                const file = readFileSync(filePath);
                const ext = filePath.split('.').pop()?.toLowerCase();
                
                // Mappa estensioni a MIME types
                const contentTypes: Record<string, string> = {
                    "js": "application/javascript",
                    "css": "text/css",
                    "json": "application/json",
                    "ico": "image/x-icon",
                    "png": "image/png",
                    "jpg": "image/jpeg",
                    "jpeg": "image/jpeg",
                    "svg": "image/svg+xml",
                    "html": "text/html"
                };
                
                const contentType = contentTypes[ext || ""] || "application/octet-stream";
                
                // Cache headers in base al tipo di file
                let cacheControl = "no-cache";
                if (ext === "js" || ext === "css") {
                    // File con hash hanno cache immutabile
                    if (fileName.match(/-([\w]{8,})\.(?:js|css)$/)) {
                        cacheControl = "public, max-age=31536000, immutable";
                    }
                } else if (ext === "ico") {
                    cacheControl = "public, max-age=86400";
                }
                
                return new Response(file, { 
                    headers: { 
                        "Content-Type": contentType,
                        "Cache-Control": cacheControl
                    } 
                });
            } catch {
                // File non trovato, serve index.html per Angular router
                try {
                    let html = readFileSync(join(import.meta.dir, "../www/index.html"), "utf8");
                    
                    // Inietta il base href dinamicamente se BASE_PATH è configurato
                    if (BASE_PATH) {
                        const baseHref = `${BASE_PATH}/`;
                        // Se esiste già un tag <base>, lo sostituisce, altrimenti lo aggiunge nell'head
                        if (html.includes('<base')) {
                            html = html.replace(/<base[^>]*>/i, `<base href="${baseHref}">`);
                        } else {
                            html = html.replace('</head>', `  <base href="${baseHref}">\n</head>`);
                        }
                    }
                    
                    return new Response(html, { 
                        headers: { 
                            "Content-Type": "text/html",
                            "Cache-Control": "no-cache"
                        } 
                    });
                } catch (err) {
                    return new Response("Application not found", { status: 404 });
                }
            }
        });
        //#endregion ROUTES

        //#region WEBSOCKET
        // Usa arrow function per mantenere il contesto `this`
        const wsClientsMap = this.wsClients;
        const wsClientIdsMap = this.wsClientIds;
        const self = this;
        
        this.app.ws(`${BASE_PATH}/api/ws`, {
            open(ws) {
                try {
                    logger.debug("[WS] New connection request");
                    const url = new URL(ws.data.request.url);
                    
                    // Verifica autenticazione tramite token (query param o header)
                    const tokenFromQuery = url.searchParams.get('token');
                    const authHeader = ws.data.request.headers.get('authorization');
                    const tokenFromHeader = authHeader?.replace('Bearer ', '');
                    const token = tokenFromQuery || tokenFromHeader;

                    if (!verifyToken(token)) {
                        console.warn("[WS] Unauthorized connection attempt - invalid or missing token");
                        ws.send(JSON.stringify({ 
                            type: 'error', 
                            message: 'Unauthorized - Invalid or missing token' 
                        }));
                        ws.close(1008, "Unauthorized");
                        return;
                    }

                    // Permetti passaggio opzionale di ?id=xxx dal client
                    let id = url.searchParams.get('id') ?? crypto.randomUUID();
                    while (wsClientsMap.has(id)) id = crypto.randomUUID(); // garantisci unicità

                    logger.debug(`[WS] Assigned client ID: ${id}`);

                    // Memorizza l'id associato al WebSocket usando WeakMap
                    wsClientIdsMap.set(ws, id);
                    wsClientsMap.set(id, ws as any);
                    logger.debug(`[WS] Client added to wsClients map. Total clients: ${wsClientsMap.size}`);
                    
                    // Facoltativo: keep-alive a livello di singola connessione
                    const keepAlive = setInterval(() => {
                        try { ws.ping(); } catch { /* ignore */ }
                    }, 30_000);
                    
                    // Memorizza il timer nella WeakMap per poterlo cancellare dopo
                    (wsClientIdsMap as any).keepAliveTimers = (wsClientIdsMap as any).keepAliveTimers || new WeakMap();
                    (wsClientIdsMap as any).keepAliveTimers.set(ws, keepAlive);
                    
                    // Notifica l'id assegnato e autenticazione riuscita
                    ws.send(JSON.stringify({ type: 'hello', id, authenticated: true }));
                    console.log(`[WS] Client connected and authenticated: ${id}`);
                } catch (err) {
                    console.error("[WS] ERROR in open handler:", err);
                }
            },
            message(ws, message) {
                try {
                    const payload = typeof message === 'string' ? JSON.parse(message) : message;
                    // Ping/Pong semplice
                    if (payload?.type === 'ping') {
                        ws.send(JSON.stringify({ type: 'pong', ts: Date.now() }));
                        return;
                    }
                    // Echo di default (utile in dev)
                    ws.send(JSON.stringify({ type: 'echo', data: payload }));
                } catch {
                    // Se non è JSON, fallo rimbalzare come testo
                    ws.send(String(message));
                }
                logger.debug("[WS] Message from client:", message);
            },
            close(ws) {
                const id = wsClientIdsMap.get(ws);
                if (id) wsClientsMap.delete(id);
                
                // Cancella il keep-alive timer
                const keepAliveTimers = (wsClientIdsMap as any).keepAliveTimers;
                if (keepAliveTimers) {
                    const ka = keepAliveTimers.get(ws);
                    if (ka) clearInterval(ka);
                }
                
                logger.info(`[WS] Client disconnected: ${id}. Total clients: ${wsClientsMap.size}`);
            },
            drain(ws) {
                console.log("[WS] Client drain");
            }
        });
        
        //#endregion WEBSOCKET
        
        //#region API
        // API DEBUG: verifica stato client WebSocket connessi
        this.app.get(`${BASE_PATH}/api/ws/status`, ({ request }) => {
            const clients = this.listClients();
            return new Response(JSON.stringify({
                connectedClients: clients.length,
                clientIds: clients,
                wsClientsMapSize: this.wsClients.size
            }), {
                headers: { "Content-Type": "application/json" }
            });
        });

        // API: restituisce le ricevute con filtri e paginazione
        this.app.get(`${BASE_PATH}/api/receipts`, async ({ request }) => {
            try {
                const url = new URL(request.url);
                const limitParam = url.searchParams.get("limit");
                const typeParam = url.searchParams.get("type");
                const offsetParam = url.searchParams.get("offset");
                const startDateParam = url.searchParams.get("startDate");
                const endDateParam = url.searchParams.get("endDate");

                const startDate = startDateParam ? new Date(startDateParam) : undefined;
                const endDate = endDateParam ? new Date(endDateParam) : undefined;

                // Validazione parametri query
                if (startDate && isNaN(startDate.getDate())) {
                    return new Response("Invalid startDate", { status: 400 });
                }
                if (endDate && isNaN(endDate.getDate())) {
                    return new Response("Invalid endDate", { status: 400 });
                }
                if (startDate && endDate && startDate > endDate) {
                    return new Response("startDate cannot be after endDate", { status: 400 });
                }
                if (limitParam && isNaN(parseInt(limitParam, 10))) {
                    return new Response("Invalid limit", { status: 400 });
                }
                if (offsetParam && isNaN(parseInt(offsetParam, 10))) {
                    return new Response("Invalid offset", { status: 400 });
                }

                // Parsing parametri
                const limit = limitParam ? parseInt(limitParam, 10) : 10;
                const offset = offsetParam ? parseInt(offsetParam, 10) : 0;
                const allowedTypes = ["PRINTED", "FAILED"] as const;
                const type: "PRINTED" | "FAILED" | undefined = allowedTypes.includes(typeParam as any) ? (typeParam as "PRINTED" | "FAILED") : undefined;

                // Query al database
                const receipts = await DatabaseController.getInstance().getAllReceipts(limit, offset, type, startDate, endDate);
                return new Response(JSON.stringify(receipts), { headers: { "Content-Type": "application/json" } });
            } catch (err) {
                console.error("[API] Error fetching receipts:", err);
                return new Response("Internal Server Error", { status: 500 });
            }
        });

        // API: ristampa una ricevuta tramite ID
        this.app.post(`${BASE_PATH}/api/receipts/:id/print`, ({ params }) => {
            console.log("[API] Ristampa ticket @ ID:", params.id);
            // printSpecificOrder(parseInt(params.id));
            regenerateSpecificReceipt(parseInt(params.id));
        });
        

        // API: ristampa una ricevuta tramite ID
        this.app.post(`${BASE_PATH}/api/receipts/:id/printAt`, ({ params, request }) => {
            const url = new URL(request.url);
            const dest = url.searchParams.get("dest");
            console.log("[API] Ristampa ticket @ ID:", params.id, "dest:", dest);
            // printSpecificOrder(parseInt(params.id), dest);
            regenerateSpecificReceipt(parseInt(params.id), dest ? dest : undefined);
        });

        this.app.get(`${BASE_PATH}/api/printers/getAll`, async () => {
            try {
                const printers = await DatabaseController.getInstance().getPrinterSettings();
                return new Response(JSON.stringify(printers), { headers: { "Content-Type": "application/json" } });
            } catch (err) {
                console.error("[API] Error fetching printers:", err);
                return new Response("Internal Server Error", { status: 500 });
            }
        });

        this.app.post(`${BASE_PATH}/api/printers/delete/:key`, async ({ params }) => {
            try {
                const key = params.key;
                if (!key) {
                    return new Response("Printer key is required", { status: 400 });
                }
                await DatabaseController.getInstance().deletePrinter(key);
                loadPrintersFromDb(); // Ricarica le stampanti dopo la cancellazione
                return new Response("Printer deleted successfully", { status: 200 });
            } catch (err) {
                console.error("[API] Error deleting printer:", err);
                return new Response("Internal Server Error", { status: 500 });
            }
        });

        this.app.post(`${BASE_PATH}/api/printers/update`, async ({ request }) => {
            try {
                const data = await request.json();
                if (!data || !data.key || !data.printerName || !data.printerIp || !data.printerPort) {
                    return new Response("Invalid printer data", { status: 400 });
                }
                await DatabaseController.getInstance().savePrinterSettings({
                    key: data.key,
                    printerName: data.printerName,
                    printerIp: data.printerIp,
                    printerPort: data.printerPort,
                    printerDestinations: data.printerDestinations || "",
                    active: data.active || false,
                    upsideDown: data.upsideDown || false,
                    beepEnable: data.beepEnable || false,
                    description: data.description || ""
                });
                loadPrintersFromDb(); // Ricarica stampanti dopo l'update
                return new Response("Printer saved successfully", { status: 200 });
            } catch (err) {
                console.error("[API] Error saving printer:", err);
                return new Response("Internal Server Error", { status: 500 });
            }
        });

        this.app.post(`${BASE_PATH}/api/printers/add`, async ({ request }) => {
            try {
                const data = await request.json();
                if (!data || !data.printerName || !data.printerIp || !data.printerPort) {
                    return new Response("Invalid printer data", { status: 400 });
                }
                await DatabaseController.getInstance().savePrinterSettings({
                    key: data.key,
                    printerName: data.printerName,
                    printerIp: data.printerIp,
                    printerPort: data.printerPort,
                    printerDestinations: data.printerDestinations || "",
                    active: data.active || false,
                    upsideDown: data.upsideDown || false,
                    beepEnable: data.beepEnable || false,
                    description: data.description || ""
                });

                loadPrintersFromDb(); // Ricarica le stampanti dopo l'aggiunta
                return new Response("Printer added successfully", { status: 200 });
            } catch (err) {
                console.error("[API] Error adding printer:", err);
                return new Response("Internal Server Error", { status: 500 });
            }
        }); 

        this.app.post(`${BASE_PATH}/api/printers/test/:key`, async ({ params }) => {
            try {
                const key = params.key;
                if (!key) {
                    return new Response("Printer key is required", { status: 400 });
                }
                const printer = await DatabaseController.getInstance().getPrinterSettingsByKey(key) as {
                    printerName: string;
                    printerIp: string;
                    printerPort: number;
                } | null;
                if (!printer) {
                    return new Response("Printer not found", { status: 404 });
                }
                // Simula la stampa di un test
                console.log(`[API] Testing printer: ${printer.printerName} (${printer.printerIp}:${printer.printerPort})`);
                // In un'applicazione reale, qui si invierebbe un comando di stampa al printer
                printTestTicket(printer.printerName);
                return new Response(`Test print sent to ${printer.printerName}`, { status: 200 });
            } catch (err) {
                console.error("[API] Error testing printer:", err);
                return new Response("Internal Server Error", { status: 500 });
            }
        });

        this.app.post(`${BASE_PATH}/api/printers/saveAll`, async ({ request }) => {
            try {   
                const data = await request.json();
                if (!Array.isArray(data) || data.length === 0) {
                    return new Response("Invalid printer data", { status: 400 });
                }
                // console.log("[API] Saving all printers", data);
                for (const printer of data) {
                    if (!printer.key || !printer.name || !printer.ip || !printer.port) {
                        console.error("[API] Invalid printer data:", printer);
                        return new Response("Invalid printer data", { status: 400 });
                    }
                    try {
                        await DatabaseController.getInstance().savePrinterSettings({
                            key: printer.key,
                            printerName: printer.name,
                            printerIp: printer.ip,
                            printerPort: printer.port,
                            printerDestinations: printer.destination || "",
                            active: printer.active || false,
                            upsideDown: printer.upsideDown || false,
                            beepEnable: printer.beepEnable || false,
                            description: printer.description || ""
                        });
                        // console.log("[API] Printer saved:", printer.name);
                    } catch (error) {
                        console.error("[API] Error saving printer:", error);
                        return new Response("Internal Server Error", { status: 500 });
                    }
                }
                loadPrintersFromDb(); // Ricarica le stampanti dopo il salvataggio
                return new Response("All printers saved successfully", { status: 200 });
            } catch (err) {
                console.error("[API] Error saving all printers:", err);
                return new Response("Internal Server Error", { status: 500 });
            }
        });

        // API: ottiene lo stato di tutte le stampanti
        this.app.get(`${BASE_PATH}/api/printers/status`, async () => {
            try {
                const statusMap = getAllPrinterStatuses();
                const statusArray = Array.from(statusMap.entries()).map(([name, status]) => ({
                    printerName: name,
                    ...status,
                    lastCheck: status.lastCheck.toISOString()
                }));
                return new Response(JSON.stringify(statusArray), {
                    status: 200,
                    headers: { "Content-Type": "application/json" }
                });
            } catch (err) {
                console.error("[API] Error getting printer statuses:", err);
                return new Response("Internal Server Error", { status: 500 });
            }
        });

        // API: ottiene lo stato di una stampante specifica
        this.app.get(`${BASE_PATH}/api/printers/status/:name`, async ({ params }) => {
            try {
                const name = params.name;
                if (!name) {
                    return new Response("Printer name is required", { status: 400 });
                }
                const status = getPrinterStatus(name);
                if (!status) {
                    return new Response("Printer status not found", { status: 404 });
                }
                return new Response(JSON.stringify({
                    printerName: name,
                    ...status,
                    lastCheck: status.lastCheck.toISOString()
                }), {
                    status: 200,
                    headers: { "Content-Type": "application/json" }
                });
            } catch (err) {
                console.error("[API] Error getting printer status:", err);
                return new Response("Internal Server Error", { status: 500 });
            }
        });

        // API: avvia manualmente il controllo dello stato di tutte le stampanti
        this.app.post(`${BASE_PATH}/api/printers/check-status`, async () => {
            try {
                logger.info("[API] Controllo manuale stato stampanti richiesto");
                // Esegui il controllo in modo asincrono
                checkAllPrintersStatus(printers).catch(err => {
                    logger.error("[API] Errore durante controllo stampanti:", err);
                });
                
                return new Response(JSON.stringify({ 
                    message: "Printer status check initiated",
                    timestamp: new Date().toISOString()
                }), {
                    status: 202, // Accepted
                    headers: { "Content-Type": "application/json" }
                });
            } catch (err) {
                console.error("[API] Error initiating printer status check:", err);
                return new Response("Internal Server Error", { status: 500 });
            }
        });

        this.app.get(`${BASE_PATH}/api/barcodes/getAll`, async () => {
            try {
                const barcodes = await DatabaseController.getInstance().getAllBarcodes();
                return new Response(JSON.stringify(barcodes), { status: 200, headers: { "Content-Type": "application/json" } });
            } catch (err) {
                console.error("[API] Error getting all barcodes:", err);
                return new Response("Internal Server Error", { status: 500 });
            }
        });

        this.app.post(`${BASE_PATH}/api/barcodes/add/:id`, async ({ request, params }) => {
            try {
            const url = new URL(request.url);
            const role = url.searchParams.get("role");
            console.log("[API] Adding barcode for ID:", params.id, "Role:", role);
            if (params.id) {
                const id = params.id;
                console.log(id);
                try {
                    await DatabaseController.getInstance().addOrUpdateBarcode(id, true);
                    // se plate == PANINI cambia plate in FORNO, altrimenti completa con l'ordine in DONE
                }
                catch (error) {
                    console.error("[API] Error adding barcode:", error);
                }

                try {
                    // Fetch the item by ID from KitchenManagementController
                    const item = await KitchenManagementController.getInstance().fetchItemById(id);
                    console.log("[API] Item fetched:", item.plate.name);
                    switch(role) {
                        case "pass":
                            await KitchenManagementController.getInstance().updateOrderStatus(id, "DONE");
                            break;
                        case "kitchen":
                            if (item && item.plate.name === "PANINI") {
                                await KitchenManagementController.getInstance().changeOrderPlate(id, "FORNO");
                            }
                            break;
                        default:
                            console.warn("[API] Unknown role:", role);
                    }
                }
                catch (fetchError) {
                    console.error("[API] Error fetching item:", fetchError);
                }
            }
            return new Response("Barcode added successfully", { status: 201 });
            } catch (err) {
            console.error("[API] Error adding barcode:", err);
            return new Response("Internal Server Error", { status: 500 });
            }
        });


        // ==================
        // Statistics API Routes
        // ==================
        
        this.app.get(`${BASE_PATH}/api/statistics/totals`, async ({ request }) => {
            try {
                const url = new URL(request.url);
                const startDate = url.searchParams.get("startDate");
                const endDate = url.searchParams.get("endDate");
                
                if (!startDate || !endDate) {
                    return new Response(JSON.stringify({ error: "startDate and endDate are required" }), { 
                        status: 400, 
                        headers: { "Content-Type": "application/json" } 
                    });
                }
                
                const gsgController = GSGController.getInstance();
                const statsController = new StatisticsController(gsgController["listener"]!);
                const data = await statsController.getTotals(startDate, endDate);
                
                return new Response(JSON.stringify(data), { 
                    status: 200, 
                    headers: { "Content-Type": "application/json" } 
                });
            } catch (err) {
                console.error("[API] Error getting statistics totals:", err);
                return new Response(JSON.stringify({ error: "Internal Server Error" }), { 
                    status: 500, 
                    headers: { "Content-Type": "application/json" } 
                });
            }
        });
        
        this.app.get(`${BASE_PATH}/api/statistics/trend`, async ({ request }) => {
            try {
                const url = new URL(request.url);
                const startDate = url.searchParams.get("startDate");
                const endDate = url.searchParams.get("endDate");
                
                if (!startDate || !endDate) {
                    return new Response(JSON.stringify({ error: "startDate and endDate are required" }), { 
                        status: 400, 
                        headers: { "Content-Type": "application/json" } 
                    });
                }
                
                const gsgController = GSGController.getInstance();
                const statsController = new StatisticsController(gsgController["listener"]!);
                const data = await statsController.getTrend(startDate, endDate);
                
                return new Response(JSON.stringify(data), { 
                    status: 200, 
                    headers: { "Content-Type": "application/json" } 
                });
            } catch (err) {
                console.error("[API] Error getting statistics trend:", err);
                return new Response(JSON.stringify({ error: "Internal Server Error" }), { 
                    status: 500, 
                    headers: { "Content-Type": "application/json" } 
                });
            }
        });
        
        this.app.get(`${BASE_PATH}/api/statistics/by-area`, async ({ request }) => {
            try {
                const url = new URL(request.url);
                const startDate = url.searchParams.get("startDate");
                const endDate = url.searchParams.get("endDate");
                
                if (!startDate || !endDate) {
                    return new Response(JSON.stringify({ error: "startDate and endDate are required" }), { 
                        status: 400, 
                        headers: { "Content-Type": "application/json" } 
                    });
                }
                
                const gsgController = GSGController.getInstance();
                const statsController = new StatisticsController(gsgController["listener"]!);
                const data = await statsController.getByArea(startDate, endDate);
                
                return new Response(JSON.stringify(data), { 
                    status: 200, 
                    headers: { "Content-Type": "application/json" } 
                });
            } catch (err) {
                console.error("[API] Error getting statistics by area:", err);
                return new Response(JSON.stringify({ error: "Internal Server Error" }), { 
                    status: 500, 
                    headers: { "Content-Type": "application/json" } 
                });
            }
        });
        
        this.app.get(`${BASE_PATH}/api/statistics/by-payment`, async ({ request }) => {
            try {
                const url = new URL(request.url);
                const startDate = url.searchParams.get("startDate");
                const endDate = url.searchParams.get("endDate");
                
                if (!startDate || !endDate) {
                    return new Response(JSON.stringify({ error: "startDate and endDate are required" }), { 
                        status: 400, 
                        headers: { "Content-Type": "application/json" } 
                    });
                }
                
                const gsgController = GSGController.getInstance();
                const statsController = new StatisticsController(gsgController["listener"]!);
                const data = await statsController.getByPayment(startDate, endDate);
                
                return new Response(JSON.stringify(data), { 
                    status: 200, 
                    headers: { "Content-Type": "application/json" } 
                });
            } catch (err) {
                console.error("[API] Error getting statistics by payment:", err);
                return new Response(JSON.stringify({ error: "Internal Server Error" }), { 
                    status: 500, 
                    headers: { "Content-Type": "application/json" } 
                });
            }
        });
        
        this.app.get(`${BASE_PATH}/api/statistics/channel`, async ({ request }) => {
            try {
                const url = new URL(request.url);
                const startDate = url.searchParams.get("startDate");
                const endDate = url.searchParams.get("endDate");
                
                if (!startDate || !endDate) {
                    return new Response(JSON.stringify({ error: "startDate and endDate are required" }), { 
                        status: 400, 
                        headers: { "Content-Type": "application/json" } 
                    });
                }
                
                const gsgController = GSGController.getInstance();
                const statsController = new StatisticsController(gsgController["listener"]!);
                const data = await statsController.getChannel(startDate, endDate);
                
                return new Response(JSON.stringify(data), { 
                    status: 200, 
                    headers: { "Content-Type": "application/json" } 
                });
            } catch (err) {
                console.error("[API] Error getting statistics channel:", err);
                return new Response(JSON.stringify({ error: "Internal Server Error" }), { 
                    status: 500, 
                    headers: { "Content-Type": "application/json" } 
                });
            }
        });
        
        this.app.get(`${BASE_PATH}/api/statistics/top-products`, async ({ request }) => {
            try {
                const url = new URL(request.url);
                const startDate = url.searchParams.get("startDate");
                const endDate = url.searchParams.get("endDate");
                
                if (!startDate || !endDate) {
                    return new Response(JSON.stringify({ error: "startDate and endDate are required" }), { 
                        status: 400, 
                        headers: { "Content-Type": "application/json" } 
                    });
                }
                
                const gsgController = GSGController.getInstance();
                const statsController = new StatisticsController(gsgController["listener"]!);
                const data = await statsController.getTopProducts(startDate, endDate);
                
                return new Response(JSON.stringify(data), { 
                    status: 200, 
                    headers: { "Content-Type": "application/json" } 
                });
            } catch (err) {
                console.error("[API] Error getting top products:", err);
                return new Response(JSON.stringify({ error: "Internal Server Error" }), { 
                    status: 500, 
                    headers: { "Content-Type": "application/json" } 
                });
            }
        });
        
        this.app.get(`${BASE_PATH}/api/statistics/top-categories`, async ({ request }) => {
            try {
                const url = new URL(request.url);
                const startDate = url.searchParams.get("startDate");
                const endDate = url.searchParams.get("endDate");
                
                if (!startDate || !endDate) {
                    return new Response(JSON.stringify({ error: "startDate and endDate are required" }), { 
                        status: 400, 
                        headers: { "Content-Type": "application/json" } 
                    });
                }
                
                const gsgController = GSGController.getInstance();
                const statsController = new StatisticsController(gsgController["listener"]!);
                const data = await statsController.getTopCategories(startDate, endDate);
                
                return new Response(JSON.stringify(data), { 
                    status: 200, 
                    headers: { "Content-Type": "application/json" } 
                });
            } catch (err) {
                console.error("[API] Error getting top categories:", err);
                return new Response(JSON.stringify({ error: "Internal Server Error" }), { 
                    status: 500, 
                    headers: { "Content-Type": "application/json" } 
                });
            }
        });
        
        this.app.get("/api/statistics/by-cashier", async ({ request }) => {
            try {
                const url = new URL(request.url);
                const startDate = url.searchParams.get("startDate");
                const endDate = url.searchParams.get("endDate");
                
                if (!startDate || !endDate) {
                    return new Response(JSON.stringify({ error: "startDate and endDate are required" }), { 
                        status: 400, 
                        headers: { "Content-Type": "application/json" } 
                    });
                }
                
                const gsgController = GSGController.getInstance();
                const statsController = new StatisticsController(gsgController["listener"]!);
                const data = await statsController.getByCashier(startDate, endDate);
                
                return new Response(JSON.stringify(data), { 
                    status: 200, 
                    headers: { "Content-Type": "application/json" } 
                });
            } catch (err) {
                console.error("[API] Error getting statistics by cashier:", err);
                return new Response(JSON.stringify({ error: "Internal Server Error" }), { 
                    status: 500, 
                    headers: { "Content-Type": "application/json" } 
                });
            }
        });
        
        this.app.get("/api/statistics/by-table", async ({ request }) => {
            try {
                const url = new URL(request.url);
                const startDate = url.searchParams.get("startDate");
                const endDate = url.searchParams.get("endDate");
                
                if (!startDate || !endDate) {
                    return new Response(JSON.stringify({ error: "startDate and endDate are required" }), { 
                        status: 400, 
                        headers: { "Content-Type": "application/json" } 
                    });
                }
                
                const gsgController = GSGController.getInstance();
                const statsController = new StatisticsController(gsgController["listener"]!);
                const data = await statsController.getByTable(startDate, endDate);
                
                return new Response(JSON.stringify(data), { 
                    status: 200, 
                    headers: { "Content-Type": "application/json" } 
                });
            } catch (err) {
                console.error("[API] Error getting statistics by table:", err);
                return new Response(JSON.stringify({ error: "Internal Server Error" }), { 
                    status: 500, 
                    headers: { "Content-Type": "application/json" } 
                });
            }
        });
        
        this.app.get("/api/statistics/departments", async ({ request }) => {
            try {
                const url = new URL(request.url);
                const startDate = url.searchParams.get("startDate");
                const endDate = url.searchParams.get("endDate");
                
                if (!startDate || !endDate) {
                    return new Response(JSON.stringify({ error: "startDate and endDate are required" }), { 
                        status: 400, 
                        headers: { "Content-Type": "application/json" } 
                    });
                }
                
                const gsgController = GSGController.getInstance();
                const statsController = new StatisticsController(gsgController["listener"]!);
                const data = await statsController.getDepartments(startDate, endDate);
                
                return new Response(JSON.stringify(data), { 
                    status: 200, 
                    headers: { "Content-Type": "application/json" } 
                });
            } catch (err) {
                console.error("[API] Error getting statistics departments:", err);
                return new Response(JSON.stringify({ error: "Internal Server Error" }), { 
                    status: 500, 
                    headers: { "Content-Type": "application/json" } 
                });
            }
        });

        this.app.get("/api/statistics/total-covers", async ({ request }) => {
            try {
                const url = new URL(request.url);
                const startDate = url.searchParams.get("startDate");
                const endDate = url.searchParams.get("endDate");
                
                if (!startDate || !endDate) {
                    return new Response(JSON.stringify({ error: "startDate and endDate are required" }), { 
                        status: 400, 
                        headers: { "Content-Type": "application/json" } 
                    });
                }
                
                const gsgController = GSGController.getInstance();
                const statsController = new StatisticsController(gsgController["listener"]!);
                const data = await statsController.getTotalCovers(startDate, endDate);
                
                return new Response(JSON.stringify(data), { 
                    status: 200, 
                    headers: { "Content-Type": "application/json" } 
                });
            } catch (err) {
                console.error("[API] Error getting total covers:", err);
                return new Response(JSON.stringify({ error: "Internal Server Error" }), { 
                    status: 500, 
                    headers: { "Content-Type": "application/json" } 
                });
            }
        });
        //#endregion API
        
        // Avvia il server HTTP sulla porta 4000
        const port = process.env.HTTP_SERVER_PORT ? parseInt(process.env.HTTP_SERVER_PORT) : 4000;
        this.app.listen(port);
        console.log(`[WWW] ✅ HTTP server su http://localhost:${port}`);
    }

    /**
     * Ritorna l'istanza singleton del controller.
     */
    public static get instance(): HttpServerController {
        if (!HttpServerController.#instance) {
            console.log("[HttpServerController] Creating new singleton instance");
            HttpServerController.#instance = new HttpServerController();
        } else {
            console.log("[HttpServerController] Returning existing singleton instance");
        }
        return HttpServerController.#instance;
    }

    /**
     * Ritorna l'istanza dell'app Elysia (per test o estensioni).
     * @returns Istanza dell'applicazione Elysia
     */
    public getApp() {
        return this.app;
    }

    /**
     * Invia dati su WebSocket a un singolo client o in broadcast a tutti i client connessi.
     * @param data Dati da inviare (stringa o oggetto serializzabile)
     * @param wsClient (opzionale) Istanza del client WebSocket destinatario. Se omesso, invia a tutti.
     */
    // public sendWsMessage(data: any, wsClient?: any): void {
    //     const message = typeof data === "string" ? data : JSON.stringify(data);
    //     // Se viene passato un client specifico, invia solo a lui
    //     if (wsClient) {
    //         wsClient.send(message);
    //     } else {
    //         // Broadcast a tutti i client connessi su /api/ws
    //         this.app.ws("/api/ws").clients.forEach((client: any) => {
    //             client.send(message);
    //         });
    //     }
    // }

    /**
     * Invia a un client specifico
     * @returns true se inviato, false se client non presente o errore
     */
    public sendToClient(id: string, data: any): boolean {
        const ws = this.wsClients.get(id);
        if (!ws) return false;
        try {
        ws.send(typeof data === 'string' ? data : JSON.stringify(data));
        return true;
        } catch {
        return false;
        }
    }

    /**
     * Invia a tutti i client connessi
     * @returns numero di client a cui è stato inviato
     */
    public broadcast(data: any): number {
        const payload = typeof data === 'string' ? data : JSON.stringify(data);
        console.log(`[WS] Broadcasting message to ${this.wsClients.size} clients`);
        console.log(`[WS] wsClients map keys:`, [...this.wsClients.keys()]);
        let count = 0;
        for (const ws of this.wsClients.values()) {
            try { 
                ws.send(payload); 
                count++; 
                console.log(`[WS] Message sent successfully to client ${count}`);
            } catch (err) { 
                console.error(`[WS] Failed to send to client:`, err);
            }
        }
        console.log(`[WS] Broadcast completed. Sent to ${count} clients`);
        return count;
    }

    /**
     * Invia una notifica strutturata a tutti i client connessi via WebSocket.
     * Utilizza un formato standard per tutte le notifiche del sistema.
     * 
     * @param type Tipo di notifica (es: 'ORDER_RECEIVED', 'PRINT_SUCCESS', 'PRINT_FAILED', etc.)
     * @param payload Dati specifici della notifica
     * @param severity Livello di gravità: 'info' | 'success' | 'warning' | 'error'
     * @returns numero di client a cui è stata inviata la notifica
     * 
     * @example
     * // Notifica ordine ricevuto
     * this.sendNotification('ORDER_RECEIVED', { orderId: 123, table: 5 }, 'info');
     * 
     * @example
     * // Notifica stampa fallita
     * this.sendNotification('PRINT_FAILED', { 
     *   receiptId: 456, 
     *   printer: 'CUCINA', 
     *   error: 'Connection timeout' 
     * }, 'error');
     */
    public sendNotification(
        type: string, 
        payload: any, 
        severity: 'info' | 'success' | 'warning' | 'error' = 'info'
    ): number {
        const notification = {
            type: 'NOTIFICATION',
            timestamp: new Date().toISOString(),
            data: {
                notificationType: type,
                severity,
                payload
            }
        };
        
        logger.debug(`[WS] Preparing to send notification: ${type} (${severity})`);
        logger.debug(`[WS] Notification payload:`, JSON.stringify(notification, null, 2));
        const result = this.broadcast(notification);
        logger.debug(`[WS] Notification sent to ${result} clients`);
        return result;
    }

    /** Utility opzionali */
    public listClients(): string[] { return [...this.wsClients.keys()]; }

    public disconnect(id: string, code = 1000, reason?: string): boolean {
        const ws = this.wsClients.get(id);
        if (!ws) return false;
        try { ws.close(code, reason); this.wsClients.delete(id); return true; } catch { return false; }
    }
}
