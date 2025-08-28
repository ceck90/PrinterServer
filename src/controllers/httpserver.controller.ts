import Elysia from "elysia";
import { readFileSync } from "fs";
import { join } from "path";
import { DatabaseController } from "./db.controller";
import { printSpecificOrder, printTestTicket, regenerateSpecificReceipt } from "../dispatcher";
import { loadPrintersFromDb } from "../print-routing.config";
import { KitchenManagementController } from "./kitchenmgmt.controller";

/**
 * Controller singleton per la gestione del server HTTP tramite Elysia.
 * Definisce le route per pagine statiche, asset e API.
 */
export class HttpServerController {
    private readonly app = new Elysia();

    static #instance: HttpServerController;

    /**
     * Costruttore privato: definisce tutte le route HTTP.
     */
    private constructor() {
        // Route per la pagina principale
        this.app.get("/", () => {
            try {
                const html = readFileSync(join(import.meta.dir, "../www/index.html"), "utf8");
                return new Response(html, { headers: { "Content-Type": "text/html" } });
            } catch (err) {
                return new Response("File index.html Not found", { status: 404 });
            }
        });

        // Route per la pagina di stato
        this.app.get("/status", () => {
            try {
                const html = readFileSync(join(import.meta.dir, "../www/status.html"), "utf8");
                return new Response(html, { headers: { "Content-Type": "text/html" } });
            } catch (err) {
                return new Response("File status.html Not found", { status: 404 });
            }
        });
        
        // Route per la pagina di stato
        this.app.get("/settings", () => {
            try {
                const html = readFileSync(join(import.meta.dir, "../www/settings.html"), "utf8");
                return new Response(html, { headers: { "Content-Type": "text/html" } });
            } catch (err) {
                return new Response("File settings.html Not found", { status: 404 });
            }
        });
        
        // Route per la pagina di stato
        this.app.get("/barcode", () => {
            try {
                const html = readFileSync(join(import.meta.dir, "../www/barcode.html"), "utf8");
                return new Response(html, { headers: { "Content-Type": "text/html" } });
            } catch (err) {
                return new Response("File barcode.html Not found", { status: 404 });
            }
        });

        // Route per servire asset statici (js, css, immagini, ecc.)
        this.app.get("/assets/*", ({ request }) => {
            const url = new URL(request.url);
            const assetPath = url.pathname.replace(/^\/assets\//, "");
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
                    "json": "application/json"
                };
                const contentType = contentTypes[ext || ""] || "application/octet-stream";
                return new Response(file, { headers: { "Content-Type": contentType } });
            } catch {
                return new Response("Not found", { status: 404 });
            }
        });

        // Catch-all per tutte le altre route non definite (404)
        this.app.all("*", () => new Response("404 Not Found", { status: 404 }));

        this.app.ws("/api/ws", {
            open(ws) {
                console.log("[WS] Client connected");
            },
            message(ws, message) {
                console.log("[WS] Message from client:", message);
            },
            close(ws) {
                console.log("[WS] Client disconnected");
            }
        });

        // API: restituisce le ricevute con filtri e paginazione
        this.app.get("/api/receipts", async ({ request }) => {
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
        this.app.post("/api/receipts/:id/print", ({ params }) => {
            console.log("[API] Ristampa ticket @ ID:", params.id);
            // printSpecificOrder(parseInt(params.id));
            regenerateSpecificReceipt(parseInt(params.id));
        });

        this.app.get("/api/printers/getAll", async () => {
            try {
                const printers = await DatabaseController.getInstance().getPrinterSettings();
                return new Response(JSON.stringify(printers), { headers: { "Content-Type": "application/json" } });
            } catch (err) {
                console.error("[API] Error fetching printers:", err);
                return new Response("Internal Server Error", { status: 500 });
            }
        });

        this.app.post("/api/printers/delete/:key", async ({ params }) => {
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

        this.app.post("/api/printers/update", async ({ request }) => {
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

        this.app.post("/api/printers/add", async ({ request }) => {
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

        this.app.post("/api/printers/test/:key", async ({ params }) => {
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

        this.app.post("/api/printers/saveAll", async ({ request }) => {
            try {   
                const data = await request.json();
                if (!Array.isArray(data) || data.length === 0) {
                    return new Response("Invalid printer data", { status: 400 });
                }
                console.log("[API] Saving all printers", data);
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

        this.app.get("/api/barcodes/getAll", async () => {
            try {
                const barcodes = await DatabaseController.getInstance().getAllBarcodes();
                return new Response(JSON.stringify(barcodes), { status: 200, headers: { "Content-Type": "application/json" } });
            } catch (err) {
                console.error("[API] Error getting all barcodes:", err);
                return new Response("Internal Server Error", { status: 500 });
            }
        });

        this.app.post("/api/barcodes/add/:id", async ({ request, params }) => {
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

        // Avvia il server HTTP sulla porta 4000
        this.app.listen(4000);
        console.log("[WWW] ✅ HTTP server su http://localhost:4000");
    }

    /**
     * Ritorna l'istanza singleton del controller.
     */
    public static get instance(): HttpServerController {
        if (!HttpServerController.#instance) {
            HttpServerController.#instance = new HttpServerController();
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
}


