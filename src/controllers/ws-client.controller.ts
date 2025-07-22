import { handleIncomingOrder } from "../dispatcher";

type WSClientOptions = {
    reconnectAttempts?: number; // Numero massimo di tentativi, -1 per infinito
    reconnectDelayMs?: number;  // Millisecondi tra i tentativi
    url?: string;
};

export class WSClientController {
    static #instance: WSClientController;
    private ws?: WebSocket;
    private url: string;
    private reconnectAttempts: number;
    private reconnectDelayMs: number;
    private currentAttempts = 0;
    private shouldReconnect = true;

    private constructor(options: WSClientOptions = {}) {
        this.url = options.url ?? "wss://10.10.5.170/api";

        // Se siamo in ambiente Node.js e la url è wss, accetta tutti i certificati
        if (this.url.startsWith("wss://")) {
            // @ts-ignore
            process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
        }
        this.reconnectAttempts = options.reconnectAttempts ?? -1;
        this.reconnectDelayMs = options.reconnectDelayMs ?? 2000;
        this.connect();
    }

    public static getInstance(options?: WSClientOptions): WSClientController {
        if (!WSClientController.#instance) {
            WSClientController.#instance = new WSClientController(options);
        }
        return WSClientController.#instance;
    }

    private connect() {
        this.ws = new WebSocket(this.url);

        this.ws.addEventListener("open", () => {
            this.currentAttempts = 0;
            console.log("[WS] Connesso a", this.url);
        });

        this.ws.addEventListener("message", async (msg) => {
            try {
                // console.log("[WS] Messaggio ricevuto:", msg.data);
                const data = JSON.parse(msg.data.toString());
                await handleIncomingOrder(data);
            } catch (err) {
                console.error("[WS] Errore parsing o stampa ordine:", err);
            }
        });

        this.ws.addEventListener("close", (event) => {
            console.warn(`[WS] Connessione chiusa (code: ${event.code}).`);
            this.tryReconnect();
        });

        this.ws.addEventListener("error", (err) => {
            console.error("[WS] Errore WebSocket:", err);
            // L'evento error non chiude la connessione, quindi chiudiamo manualmente
            this.ws?.close();
        });
    }

    private tryReconnect() {
        if (!this.shouldReconnect) return;
        if (this.reconnectAttempts !== -1 && this.currentAttempts >= this.reconnectAttempts) {
            console.error("[WS] Numero massimo di tentativi di riconnessione raggiunto.");
            return;
        }
        this.currentAttempts++;
        console.log(`[WS] Tentativo di riconnessione #${this.currentAttempts} tra ${this.reconnectDelayMs}ms...`);
        setTimeout(() => this.connect(), this.reconnectDelayMs);
    }

    public close() {
        this.shouldReconnect = false;
        this.ws?.close();
    }
}