import { handleIncomingData } from "../dispatcher";
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
        this.url = options.url ?? "http://10.10.1.12:8080/ws";

        // Permette connessioni wss anche con certificati self-signed in Node.js
        if (this.url.startsWith("wss://")) {
            // @ts-ignore
            process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
        }
        this.reconnectAttempts = options.reconnectAttempts ?? -1;
        this.reconnectDelayMs = options.reconnectDelayMs ?? 2000;
        this.connect();
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
        console.log("[WS] Initialize WebSocket Connection to: " + this.url);
        let ws = new SockJS(this.url);
        console.log("[WS] WebSocket creato con URL:", this.url);
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

    /*
    // Esempio alternativo di connessione WebSocket puro (non usato)
    private connect() {
        this.ws = new WebSocket(this.url);
        ...
    }
    */

    /**
     * Gestisce la logica di riconnessione automatica.
     * Se il numero di tentativi è -1, tenta all'infinito.
     */
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

    /**
     * Chiude la connessione e disabilita la riconnessione automatica.
     */
    public close() {
        this.shouldReconnect = false;
        // this.ws?.close();
    }
}