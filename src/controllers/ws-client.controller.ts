import { handleIncomingData, handleSingleOrderData as handleSyncOrderData, handleSyncOrders } from "../dispatcher";
import Stomp from "stompjs";
import SockJS from "sockjs-client";

/**
 * Opzioni di configurazione per il client WebSocket.
 * - reconnectAttempts: numero massimo di tentativi di riconnessione (-1 = infinito)
 * - reconnectDelayMs: millisecondi tra i tentativi di riconnessione
 * - url: endpoint del server WebSocket
 */
type WSClientOptions = {
    reconnectAttempts?: number;
    reconnectDelayMs?: number;
    url?: string;
};

/**
 * Controller singleton per la gestione del client WebSocket STOMP/SockJS.
 * Gestisce la connessione, la riconnessione automatica e la sottoscrizione ai topic.
 */
export class WSClientController {
    static #instance: WSClientController;

    private url: string;
    private reconnectAttempts: number;
    private reconnectDelayMs: number;
    private currentAttempts = 0;
    private shouldReconnect = true;

    private stompClient: any;

    // Topic STOMP a cui sottoscriversi
    private pkmiTopic: string = "/topic/pkmi";
    private greetingsTopic: string = "/topic/greetings";

    /**
     * Costruttore privato: inizializza la connessione e le opzioni.
     * @param options Opzioni di configurazione
     */
    private constructor(options: WSClientOptions = {}) {
        this.url = options.url ?? "http://10.10.1.12:8080";

        // Permette connessioni wss anche con certificati self-signed in Node.js
        if (this.url.startsWith("https://")) {
            // @ts-ignore
            process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
        }
        this.reconnectAttempts = options.reconnectAttempts ?? -1;
        this.reconnectDelayMs = options.reconnectDelayMs ?? 2000;
        this.connect();

        // Attendi l'esecuzione del fetch iniziale degli items
        this.fetchItems().then(async data => {
            // console.log("[SOCK] parsing data:", data);
            if (Array.isArray(data)) {
                console.log("[SOCK] Items fetched:", data.length, "items");
                await handleSyncOrderData(data);
            }
        }).catch(error => {
            console.error("[SOCK] Error fetching items:", error);   
        });
    }

    /**
     * Restituisce l'istanza singleton del controller.
     * @param options Opzioni di configurazione (solo alla prima chiamata)
     */
    public static getInstance(options?: WSClientOptions): WSClientController {
        if (!WSClientController.#instance) {
            WSClientController.#instance = new WSClientController(options);
        }
        return WSClientController.#instance;
    }    

    /**
     * Inizializza la connessione WebSocket e la sottoscrizione ai topic STOMP.
     * Gestisce anche la riconnessione automatica in caso di errore.
     */
    connect() {
        console.log("[SOCK] Initialize WebSocket Connection to: " + this.url);
        let ws = new SockJS(this.url+"/ws");
        console.log("[SOCK] WebSocket creato con URL:", this.url);
        this.stompClient = Stomp.over(ws);
        const _this = this;

        _this.stompClient.connect({}, () => {
            // Connessione STOMP riuscita
            console.log("[STOMP] Client connesso a:", _this.url);

            // Sottoscrizione ai topic
            _this.stompClient.subscribe(_this.greetingsTopic, (event: any) => {
                console.log("[STOMP] Messaggio ricevuto dal server:", event.body);
            });

            _this.stompClient.subscribe(_this.pkmiTopic, (event: any) => {
                const data = JSON.parse(event.body);
                handleIncomingData(data);
            });

        }, (error: any) => {
            // Gestione errore di connessione e tentativo di riconnessione
            console.error("[STOMP] Errore di connessione:", error);
            this.tryReconnect();
        });
    };

    /**
     * Gestisce la logica di riconnessione automatica.
     * Se il numero di tentativi è -1, tenta all'infinito.
     */
    private tryReconnect() {
        if (!this.shouldReconnect) return;
        if (this.reconnectAttempts !== -1 && this.currentAttempts >= this.reconnectAttempts) {
            console.error("[SOCK] Numero massimo di tentativi di riconnessione raggiunto.");
            return;
        }
        this.currentAttempts++;
        console.log(`[SOCK] Tentativo di riconnessione #${this.currentAttempts} tra ${this.reconnectDelayMs}ms...`);
        setTimeout(() => this.connect(), this.reconnectDelayMs);
    }

    /**
     * Chiude la connessione e disabilita la riconnessione automatica.
     */
    public close() {
        this.shouldReconnect = false;
        // this.ws?.close();
    }

    /**
     * Recupera tutti gli elementi dal server Kitchen-management-server,
     * paginando automaticamente se necessario.
     * 
     * @param statuses Array di status da filtrare (es: ["TODO", "PROGRESS"])
     * @param pageSize Numero di elementi per pagina (default: 10)
     * @returns Array di elementi aggregati da tutte le pagine
     */
    public async fetchItems(
        statuses: string[] = ["TODO", "PROGRESS"],
        pageSize: number = 10
    ) {
        const statusParam = statuses.join(",");
        const baseUrl = this.url.replace(/(ws|wss):\/\//, "http://").replace(/\/ws$/, "");
        let allElements: any[] = [];
        let totalPage = 0;
        let offset = 0;

        try {
            // Prima richiesta per ottenere totalPage
            const url = `${baseUrl}/plate-item?statuses=${statusParam}&offset=${offset}&size=${pageSize}`;
            console.log("[REST] Fetching items from:", url);
            const response = await fetch(url, {
                method: "GET",
                headers: { "Content-Type": "application/json" }
            });
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const data = await response.json();
            if (Array.isArray(data.elements)) {
                allElements = data.elements;
            }
            totalPage = data.totalPage + 1 || 0;

            // Se ci sono più pagine, scarica anche le altre
            const requests: Promise<any>[] = [];
            for (let page = 1; page < totalPage; page++) {
                const pageOffset = page * pageSize;
                const pageUrl = `${baseUrl}/plate-item?statuses=${statusParam}&offset=${pageOffset}&size=${pageSize}`;
                requests.push(
                    fetch(pageUrl, {
                        method: "GET",
                        headers: { "Content-Type": "application/json" }
                    }).then(res => res.json())
                );
            }
            if (requests.length > 0) {
                const results = await Promise.all(requests);
                for (const result of results) {
                    if (Array.isArray(result.elements)) {
                        allElements = allElements.concat(result.elements);
                    }
                }
            }

            console.log("[REST] Items totali:", allElements.length);
            return allElements;
        } catch (error) {
            console.error("[REST] Error fetching items:", error);
            return [];
        }
    }
}