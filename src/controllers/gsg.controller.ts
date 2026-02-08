import { Client } from "pg";
import { handleIncomingOrderFromGSG } from "../dispatcher.ts";
import { gsg_queries } from "../gsg-helper.ts";

type NewOrderPayload = { operation: string; item: any };
type PgConfig = ConstructorParameters<typeof Client>[0];

export class GSGController {
  private static instance: GSGController;

  // Listener dedicato
  private listener?: Client;
  private stopping = false;
  private backoffMs = 1000;
  private readonly backoffMax = 15000;
  private heartbeatTimer?: Timer;

  private readonly queue: any[] = [];
  private isProcessing = false;

  private constructor(private readonly baseConfig?: PgConfig) {}

  public static getInstance(clientOrConfig?: Client | PgConfig) {
    if (!this.instance) {
      if (clientOrConfig instanceof Client) {
        this.instance = new GSGController(clientOrConfig);
        console.log("[GSG] Client passato direttamente");
        // facoltativo: usare direttamente il client passato per query non-listen
      } else {
        this.instance = new GSGController(
          clientOrConfig ?? { host: "localhost", port: 5432, user: "user", password: "password", database: "dbname" }
        );
      }
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
  }

  private async connectAndListen(): Promise<void> {
    while (!this.stopping) {
      try {
        const client = new Client(this.baseConfig ?? {});
        await client.connect();
        this.listener = client;

        // Reset backoff
        this.backoffMs = 1000;

        // LISTEN
        await client.query(`LISTEN new_order`);
        console.log(`[GSG] LISTEN new_order attivo`);

        // Heartbeat
        this.startHeartbeat();

        // Handler eventi
        client.on("notification", (msg) => this.onNotification(msg.payload));
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
        await this.listener.query("SELECT 1").then(() => {
            console.log("[GSG] heartbeat OK");
        });
      } catch (err) {
        console.warn("[GSG] heartbeat failed:", err);
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
    if (!this.stopping) void this.connectAndListen();
  }

  public async query(text: string, params?: any[]): Promise<any> {
    try {
      if(this.listener) {
        const res = await this.listener.query(text, params);
        return res;
      } else {
        console.error("[GSG] No client available for queries");
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
    console.log(`[GSG] Event enqueued, data: ${JSON.stringify(eventData)}`);
    this.processQueue();
  }

  public async processQueue() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    console.log(`[GSG] Starting to process queue, items: ${this.queue.length}`);

    while (this.queue.length > 0) {
      console.log(`[GSG] Processing queue, items left: ${this.queue.length}`);
      const event = this.queue.shift();
      
      // Log dettagliati per debug
      console.log(`[GSG] Event structure: ${JSON.stringify(event, null, 2)}`);
      
      try {
        // Inserisci le righe in SQLite
        if (event?.righe) {
          await this.insertIntoSQLite(event.righe);
        }
        
        // Verifica se abbiamo i dati dell'ordine per la stampa coperti
        if (event?.ordine) {
          const ordine = event.ordine;
          console.log(`[GSG] Dati ordine: id=${ordine.id}, esportazione=${ordine.esportazione}, coperti=${ordine.coperti}, numeroTavolo=${ordine.numeroTavolo}`);
          
          // Filtro business: esportazione=false, coperti>0, numeroTavolo non vuoto
          if (ordine.esportazione === false && ordine.coperti > 0 && ordine.numeroTavolo && ordine.numeroTavolo !== "") {
            console.log(`[GSG] Ordine id ${ordine.id} filtrato per stampa coperti (esportazione=false, coperti=${ordine.coperti}, tavolo=${ordine.numeroTavolo})`);
            await this.printOrderSittingsCount(ordine);
          }
          else {
            console.log(`[GSG] Ordine id ${ordine.id} NON soddisfa i criteri per stampa coperti`);
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

  // Funzione simulata di inserimento in SQLite
  private async insertIntoSQLite(event: any) {
    // Esegui la tua query di inserimento su SQLite
    // Ad esempio db.run("INSERT INTO ordini ...", [event.data]);
    console.log("[GSG] Evento inserito:", event);
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


