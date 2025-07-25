import { subscribe } from "diagnostics_channel";
import { handleIncomingData, handleIncomingOrder } from "../dispatcher";
import Stomp from "stompjs";
import SockJS from "sockjs-client";

type WSClientOptions = {
    reconnectAttempts?: number; // Numero massimo di tentativi, -1 per infinito
    reconnectDelayMs?: number;  // Millisecondi tra i tentativi
    url?: string;
};

export class WSClientController {
    static #instance: WSClientController;
    // private ws?: WebSocket;
    private url: string;
    private reconnectAttempts: number;
    private reconnectDelayMs: number;
    private currentAttempts = 0;
    private shouldReconnect = true;

    private stompClient: any;

    private pkmiTopic: string = "/topic/pkmi";
    private greetingsTopic: string = "/topic/greetings";

    private constructor(options: WSClientOptions = {}) {
        // this.url = options.url ?? "ws://10.10.1.12:8080/ws/11/22/websocket";
        this.url = options.url ?? "http://10.10.1.12:8080/ws";

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

    connect() {
        console.log("Initialize WebSocket Connection to: " + this.url);
        let ws = new SockJS(this.url);
        console.log("[WS] WebSocket creato con URL:", this.url);
        this.stompClient = Stomp.over(ws);
        const _this = this;

        _this.stompClient.connect({}, () => {
            //if (!!this.interval) {
            //  clearInterval(this.interval);
            //}
            console.log("[STOMP] STOMP Client connesso a:", _this.url);
            _this.stompClient.subscribe(_this.greetingsTopic, (event: any) => {
                console.log("[STOMP] Messaggio ricevuto dal server:", event.body);
                // _this.onNotificationReceived(event);
            });

            _this.stompClient.subscribe(_this.pkmiTopic, (event: any) => {
                // console.log("[STOMP] Messaggio ricevuto:", event.body);
                const data = JSON.parse(event.body);
                handleIncomingData(data);
            });
            // _this.stompClient.reconnect_delay = 2000;
        }, (error: any) => {
            console.error("[STOMP] Errore di connessione:", error);
            this.tryReconnect();
        });
    };

    /*private connect() {
        this.ws = new WebSocket(this.url);
  
        this.ws.addEventListener("open", () => {
            console.log("[WS] Connesso a", this.url);
            if(this.ws) {
                console.log("[WS] Connettendo WebSocket a", this.url);
                this.stompClient = Stomp.over(this.ws);
                console.log("[STOMP] Connettendo STOMP Client...");
                const _this = this; // Per usare 'this' all'interno della callback
                _this.stompClient.connect(
                    {},
                    () => {
                        console.log("[STOMP] STOMP connesso");
                        _this.stompClient.subscribe(_this.greetingsTopic, (message : any) => {
                            console.log("[STOMP] Messaggio STOMP di stampa ricevuto:", message.body);
                            // const data = JSON.parse(message.body);
                            // handleIncomingOrder(data);
                        });
                        _this.stompClient.subscribe(_this.pkmiTopic, (message : any) => {
                            console.log("[STOMP] Messaggio STOMP ricevuto:", message.body);
                            // const data = JSON.parse(message.body);
                            // await handleIncomingOrder(data);
                        });
                    },
                    (error : any) => {
                        console.error("[STOMP] Errore STOMP:", error);
                        this.ws?.close();
                    }
                ); 
            }
        //     this.currentAttempts = 0;
        //     // var subscribeMsg = "SUBSCRIBE\nid:sub-1\ndestination:/topic/pkmi\n\n\u0000";
        //     // this.ws?.send(subscribeMsg);
        //     // console.log("[WS] Messaggio di sottoscrizione inviato:", subscribeMsg);
            
        });

        this.ws.addEventListener("message", async (msg) => {
            try {
                console.log("[WS] Messaggio ricevuto:", msg.data);
                // const data = JSON.parse(msg.data.toString());
                // await handleIncomingOrder(data);
            } catch (err) {
                console.error("[WS] Errore parsing o stampa ordine:", err);
            }
        });

        this.ws.addEventListener("close", (event) => {
            console.warn(`[WS] Connessione chiusa (code: ${event.code}).`);
            // this.tryReconnect();
        });

        this.ws.addEventListener("error", (err) => {
            console.error("[WS] Errore WebSocket:", err);
            // L'evento error non chiude la connessione, quindi chiudiamo manualmente
            this.ws?.close();
        });
    }*/

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
        // this.ws?.close();
    }
}