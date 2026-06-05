import { Client } from "pg";
import { handleIncomingOrderFromGSG } from "../dispatcher.ts";
import { gsg_queries } from "../gsg-helper.ts";
import { DatabaseController } from "./db.controller.ts";
import * as logger from "../logger.ts";

type NewOrderPayload = { operation: string; item: any };
type PgConfig = ConstructorParameters<typeof Client>[0];

export class GSGController {
  private static instance: GSGController;

  // Connessione dedicata solo al LISTEN/NOTIFY + heartbeat
  private listener?: Client;
  // Connessione separata per le query SQL (non blocca la ricezione dei NOTIFY)
  private queryClient?: Client;
  private stopping = false;
  private backoffMs = 1000;
  private readonly backoffMax = 15000;
  private heartbeatTimer?: Timer;

  private readonly queue: any[] = [];
  private isProcessing = false;

  private constructor(private readonly baseConfig?: PgConfig) {}

  public static getInstance(config?: PgConfig) {
    if (!this.instance) {
      this.instance = new GSGController(config);
    }
    return this.instance;
  }

  /** Avvio: solo LISTEN. Sposta DDL in una migrazione separata. */
  public async start(): Promise<void> {
    console.log("[GSG] Avvio GSGController...");
    this.stopping = false;
    await this.connectAndListen();
  }

  public async stop(): Promise<void> {
    this.stopping = true;
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.listener) {
      try { await this.listener.end(); } catch {}
      this.listener = undefined;
    }
    if (this.queryClient) {
      try { await this.queryClient.end(); } catch {}
      this.queryClient = undefined;
    }
  }

  private async connectAndListen(): Promise<void> {
    while (!this.stopping) {
      try {
        const client = new Client(this.baseConfig ?? {});
        await client.connect();
        this.listener = client;

        // Connessione separata per le query SQL
        const qClient = new Client(this.baseConfig ?? {});
        await qClient.connect();
        this.queryClient = qClient;

        // Reset backoff
        this.backoffMs = 1000;

        // LISTEN
        await client.query(`LISTEN new_order`);
        console.log(`[GSG] LISTEN new_order attivo`);

        // Heartbeat
        this.startHeartbeat();

        // Bug #3: .catch() esplicito per evitare unhandled Promise rejection
        client.on("notification", (msg) => {
          this.onNotification(msg.payload).catch(err =>
            logger.error("[GSG] Errore non gestito in onNotification:", err)
          );
        });
        client.on("error", (err) => console.error("[GSG] PG error:"));
        client.on("end", () => {
          console.warn("[GSG] PG connection ended");
          this.handleDisconnect();
        });

        return; // esci dal loop finché la connessione regge
      } catch (err) {
        console.error("[GSG] connect/listen failed:");
        await this.delay(this.backoffMs);
        this.backoffMs = Math.min(this.backoffMs * 2, this.backoffMax);
      }
    }
  }

  private startHeartbeat() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = setInterval(async () => {
      if (!this.listener) return;
      try {
        await this.listener.query("SELECT 1");
      } catch (err) {
        logger.warn("[GSG] heartbeat failed:", err);
        this.handleDisconnect();
      }
    }, 20000);
  }

  private handleDisconnect() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
    if (this.listener) {
      try { this.listener.end(); } catch {}
      this.listener = undefined;
    }
    if (this.queryClient) {
      try { this.queryClient.end(); } catch {}
      this.queryClient = undefined;
    }
    if (!this.stopping) void this.connectAndListen();
  }

  public async query(text: string, params?: any[]): Promise<any> {
    try {
      if (this.queryClient) {
        const res = await this.queryClient.query(text, params);
        return res;
      } else {
        console.error("[GSG] queryClient non disponibile");
        throw new Error("[GSG] queryClient non disponibile");
      }
    }
    catch (err) {
      console.error("[GSG] query error:", err);
      throw err;
    }
  }

  private async onNotification(payload?: string) {
    if (!payload) return;
    let data: NewOrderPayload;
    try {
      data = JSON.parse(payload);
    } catch (e) {
      console.error("[GSG] payload non JSON:", payload);
      return;
    }

    try {
      // Recupera le righe dell'ordine
      let righeResult = await this.query(gsg_queries.righePerOrdineConTipologia, [data.item.id]);
      
      // Recupera i dati dell'ordine dalla tabella ordini
      let ordineResult = await this.query(gsg_queries.datiOrdine, [data.item.id]);
      
      // Combina righe e dati ordine
      const eventData = {
        righe: righeResult.rows,
        ordine: ordineResult.rows.length > 0 ? ordineResult.rows[0] : null
      };
      
      await this.enqueueEvent(eventData);
    } catch (err) {
      console.error("[GSG] errore processEvent:", err);
      // opzionale: DLQ / retry
    }
  }

  private async printOrderSittingsCount(order: any): Promise<void> {
    await handleIncomingOrderFromGSG(order);
  }

  private delay(ms: number) {
    return new Promise((res) => setTimeout(res, ms));
  }

  public async enqueueEvent(eventData: any) {
    this.queue.push(eventData);
    logger.debug(`[GSG] Event enqueued, data: ${JSON.stringify(eventData)}`);
    this.processQueue();
  }

  public async processQueue() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    logger.debug(`[GSG] Starting to process queue, items: ${this.queue.length}`);

    while (this.queue.length > 0) {
      logger.debug(`[GSG] Processing queue, items left: ${this.queue.length}`);
      const event = this.queue.shift();
      
      // Log dettagliati per debug
      logger.debug(`[GSG] Event structure: ${JSON.stringify(event, null, 2)}`);
      
      try {
        // Salva l'ordine GSG in SQLite (idempotente: INSERT OR IGNORE su gsgId)
        if (event?.ordine) {
          await this.insertIntoSQLite(event);
        }
        
        // Verifica se abbiamo i dati dell'ordine per la stampa coperti
        if (event?.ordine) {
          const ordine = event.ordine;
          logger.debug(`[GSG] Dati ordine: id=${ordine.id}, esportazione=${ordine.esportazione}, coperti=${ordine.coperti}, numeroTavolo=${ordine.numeroTavolo}`);
          
          // Filtro business: esportazione=false, coperti>0, numeroTavolo non vuoto
          if (ordine.esportazione === false && ordine.coperti > 0 && ordine.numeroTavolo && ordine.numeroTavolo !== "") {
            logger.info(`[GSG] Stampa coperti per ordine ${ordine.id} - tavolo ${ordine.numeroTavolo}, ${ordine.coperti} coperti`);
            await this.printOrderSittingsCount(ordine);
          }
          else {
            logger.debug(`[GSG] Ordine id ${ordine.id} NON soddisfa i criteri per stampa coperti`);
          }
        } else {
          console.warn(`[GSG] Event senza dati ordine, skip stampa coperti`);
        }
      } catch (error) {
        console.error("[GSG] Errore durante l'inserimento in SQLite:", error);
      }
    }

    this.isProcessing = false;
  }

  // Salva l'ordine GSG nel database SQLite locale (idempotente via INSERT OR IGNORE)
  private async insertIntoSQLite(event: { ordine?: any; righe?: any[] }) {
    if (!event.ordine) return;
    try {
      DatabaseController.getInstance().saveGsgOrder(event.ordine);
      logger.debug(`[GSG] Ordine ${event.ordine.id} salvato in gsg_orders`);
    } catch (err) {
      logger.error("[GSG] Errore salvataggio gsg_orders:", err);
    }
  };

}

type GSGQueueHandler<T> = (item: T) => Promise<void>;

export class GSGQueueProcessor<T> {
  private queue: T[] = [];
  private isProcessing = false;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private handler: GSGQueueHandler<T>,
    private intervalMs: number = 100
  ) {}

  enqueue(item: T): void {
    this.queue.push(item);
  }

  start(): void {
    if (this.timer) return; // già in esecuzione
    this.timer = setInterval(() => this.processQueue(), this.intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  flush(): Promise<void> {
    return this.processQueue();
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.queue.length === 0) return;

    this.isProcessing = true;
    try {
      while (this.queue.length > 0) {
        const item = this.queue.shift();
        if (item) {
          await this.handler(item);
        }
      }
    } catch (err) {
      console.error(`[QueueProcessor] Errore durante l'elaborazione:`, err);
    } finally {
      this.isProcessing = false;
    }
  }
}


