import Elysia from "elysia";
import { readFileSync } from "fs";
import { join } from "path";
import { DatabaseController } from "./db.controller";
// import { getAllReceipts, retryReceipt } from "./receiptController";


export class HttpServerController {
    private readonly app = new Elysia();

    static #instance: HttpServerController;
    private constructor() {
        // Define routes inside the constructor using this.app
        this.app.get("/", () => {
            try {
                const html = readFileSync(join(import.meta.dir, "../www/index.html"), "utf8");
                return new Response(html, { headers: { "Content-Type": "text/html" } });
            } catch (err) {
                return new Response("File index.html Not found", { status: 404 });
            }
        });

        this.app.get("/status", () => {
            try {
                const html = readFileSync(join(import.meta.dir, "../www/status.html"), "utf8");
                return new Response(html, { headers: { "Content-Type": "text/html" } });
            } catch (err) {
                return new Response("File status.html Not found", { status: 404 });
            }
        });

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

        
        this.app.all("*", () => new Response("404 Not Found", { status: 404 }));
        
        // API routes delegate to controller
        this.app.get("/api/receipts", async ({ request }) => {
            try {
            const url = new URL(request.url);
            const limitParam = url.searchParams.get("limit");
            const typeParam = url.searchParams.get("type");

            const limit = limitParam ? parseInt(limitParam, 10) : 100;
            const allowedTypes = ["PRINTED", "FAILED"] as const;
            const type: "PRINTED" | "FAILED" | undefined = allowedTypes.includes(typeParam as any) ? typeParam as "PRINTED" | "FAILED" : "PRINTED";

            const receipts = await DatabaseController.instance.getAllReceipts(limit, type);
            return new Response(JSON.stringify(receipts), { headers: { "Content-Type": "application/json" } });
            } catch (err) {
            console.error("[API] Error fetching receipts:", err);
            return new Response("Internal Server Error", { status: 500 });
            }
        });
        // this.app.get("/api/receipts/:id", ({ params }) => getAllReceipts(params.id));


        // this.app.post("/api/receipts/:id/retry", ({ params }) => retryReceipt(params.id));

        // Initialize the HTTP server
        this.app.listen(4000);
        console.log("[WWW] ✅ HTTP server su http://localhost:4000");
    }
    public static get instance(): HttpServerController {
        if (!HttpServerController.#instance) {
            HttpServerController.#instance = new HttpServerController();
        }
        return HttpServerController.#instance;
    }
    public getApp() {
        return this.app;
    }
}


