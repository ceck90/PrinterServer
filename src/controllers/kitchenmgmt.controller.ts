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

type KitchenManagementOptions = {
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
        this.url = options.url ?? "http://127.0.0.1:8080";

        // Permette connessioni wss anche con certificati self-signed in Node.js
        if (this.url.startsWith("https://")) {
            // @ts-ignore
            process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
        }
        this.reconnectAttempts = options.reconnectAttempts ?? -1;
        this.reconnectDelayMs = options.reconnectDelayMs ?? 2000;
        this.connect();

        // Attendi l'esecuzione del fetch iniziale degli items
        // KitchenManagementController.getInstance().fetchItems().then(async data => {
        //     // console.log("[SOCK] parsing data:", data);
        //     if (Array.isArray(data)) {
        //         console.log("[SOCK] Items fetched:", data.length, "items");
        //         await handleSyncOrderData(data);
        //     }
        // }).catch(error => {
        //     console.error("[SOCK] Error fetching items:", error);   
        // });
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

            KitchenManagementController.getInstance().fetchItems().then(async data => {
                // console.log("[SOCK] parsing data:", data);
                if (Array.isArray(data)) {
                    console.log("[SOCK] Items fetched:", data.length, "items");
                    await handleSyncOrderData(data);
                }
            }).catch(error => {
                console.error("[SOCK] Error fetching items:", error);   
            });

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
}

export class KitchenManagementController {
    // Implementa qui la logica per la gestione della cucina

    static #instance: KitchenManagementController;

    private url: string;

    static getInstance(options?: KitchenManagementOptions): KitchenManagementController {
        if (!this.#instance) {
            this.#instance = new KitchenManagementController(options);
        }
        return this.#instance;
    }

    private constructor(option: KitchenManagementOptions = {}) {
        // Inizializza qui la logica per la gestione della cucina
        this.url = option.url || "http://127.0.0.1:8080";
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

    /**
     * Recupera un singolo elemento (plate-item) dal server tramite ID.
     * @param id ID dell'elemento da recuperare
     * @returns L'elemento corrispondente oppure null in caso di errore
     */
    public async fetchItemById(id: string) {
        try {
            const url = `${this.url}/plate-item/${id}`;
            console.log("[REST] Fetching item from:", url);
            const response = await fetch(url, {
                method: "GET",
                headers: { "Content-Type": "application/json" }
            });
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const data = await response.json();
            return data;
        } catch (error) {
            console.error("[REST] Error fetching item:", error);
            return null;
        }
    }

    /**
     * Recupera tutti i piatti dal server Kitchen-management-server.
     * @returns Array di piatti disponibili oppure [] in caso di errore.
     */
    public async fetchPlates() {
        try {
            const url = `${this.url}/plate`;
            console.log("[REST] Fetching plates from:", url);
            const response = await fetch(url, {
                method: "GET",
                headers: { "Content-Type": "application/json" }
            });
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const data = await response.json();
            return data;
        } catch (error) {
            console.error("[REST] Error fetching plates:", error);
            return [];
        }
    }

    /**
     * Restituisce un piatto dato il suo nome.
     * @param plateName Nome del piatto da cercare
     * @returns Il piatto corrispondente oppure null se non trovato
     */
    public getPlateByName(plateName: string) {
        return this.fetchPlates().then(plates => {
            return plates.find((plate: any) => plate.name === plateName) || null;
        });
    }

    /**
     * Aggiorna lo stato di un ordine (plate-item) tramite il suo ID.
     * @param id ID dell'elemento da aggiornare
     * @param status Nuovo stato da impostare (TODO, DONE, PROGRESS, CANCELLED)
     * @returns L'elemento aggiornato oppure null in caso di errore
     */
    public async updateOrderStatus(id: string, status: string) {
        try {

            console.log("[KITCHEN-SRV] Updating order status for item:", id, "to", status);
            // Recupera l'item corrente
            const item = await this.fetchItemById(id);
            if (!item) throw new Error("Item not found");

            // Aggiorna lo status solo se il valore è valido
            const validStatuses = ["TODO", "DONE", "PROGRESS", "CANCELLED"];
            if (!validStatuses.includes(status)) {
                throw new Error(`Invalid status: ${status}`);
            }
            item.status = status;

            // Invia la richiesta PUT per aggiornare l'item
            const url = `${this.url}/plate-item`;
            const response = await fetch(url, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(item)
            });

            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const data = await response.json();
            return data;
        } catch (error) {
            console.error("[KITCHEN-SRV] Error updating order status:", error);
            return null;
        }
    }

    /**
     * Cambia il piatto associato a un ordine (plate-item) tramite il suo ID.
     * @param id ID dell'elemento da aggiornare
     * @param newPlate Nome del nuovo piatto da associare
     * @returns L'elemento aggiornato oppure null in caso di errore
     */
    public async changeOrderPlate(id: string, newPlate: string) {
        try {
            // Recupera l'item corrente
            const item = await this.fetchItemById(id);
            if (!item) throw new Error("Item not found");

            // Aggiorna il piatto solo se il valore è valido
            if (!newPlate || typeof newPlate !== "string") {
                throw new Error(`Invalid plate: ${newPlate}`);
            }
            item.plate = await this.getPlateByName(newPlate);

            if(item.plate !== null) {
                // Invia la richiesta PUT per aggiornare l'item
                const url = `${this.url}/plate-item`;
                const response = await fetch(url, {
                    method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(item)
                });

                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                const data = await response.json();
                return data;
            } 
        }
        catch (error) {
            console.error("[REST] Error changing order plate:", error);
            return null;
        }
    }
}