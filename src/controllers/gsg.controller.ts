import { Client } from "pg";
import { handleIncomingOrderFromGSG } from "../dispatcher.ts";

type NewOrderPayload = { operation: string; item: any };

export class GSGController {
  private static instance: GSGController;

  // Listener dedicato
  private listener?: Client;
  private stopping = false;
  private backoffMs = 1000;
  private readonly backoffMax = 15000;
  private heartbeatTimer?: Timer;

  private constructor(private readonly baseConfig?: ConstructorParameters<typeof Client>[0]) {}

  public static getInstance(clientOrConfig?: Client | ConstructorParameters<typeof Client>[0]) {
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
      // Filtro business: esportazione=false (coerente col tuo esempio)
      if (data?.item?.esportazione === false) {
        await this.printOrder(data.item);
      }
    } catch (err) {
      console.error("[GSG] errore processEvent:", err);
      // opzionale: DLQ / retry
    }
  }

  private async printOrder(order: any): Promise<void> {
    await handleIncomingOrderFromGSG(order);
  }

  private delay(ms: number) {
    return new Promise((res) => setTimeout(res, ms));
  }
}
