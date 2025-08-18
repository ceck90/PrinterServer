import { Client } from 'pg';
import { handleIncomingOrderFromGSG } from '../dispatcher.ts';

export class GSGController {
    private static instance: GSGController;

    private client = new Client({
        host: 'localhost',
        port: 5432,
        user: 'user',
        password: 'password',
        database: 'dbname'
    });

    /**
     * Costruttore privato: inizializza la connessione con i parametri forniti.
     * @param connectionString Stringa di connessione al database Postgres
     */
    private constructor(newClient?: Client) {
        if (newClient) {
            this.client = newClient;
            this.client.connect()
                .then(() => {
                    console.log(`[GSG] Postgres SQL controller initialized with connection: ${this.client.host}:${this.client.port}/${this.client.database}`);
                    this.createDbFunction();
                    this.subscribeToNewOrders((data) => {
                        
                        if(data.item.esportazione == false) {
                            // Invia i dati dell'ordine al servizio di stampa
                            this.printOrder(data.item);
                        }
                    });
                })
                .catch(err => {
                    console.error(`[GSG] Error initializing Bun SQL controller: ${err.message}`);
                });
        }
    }

    /**
     * Restituisce l'istanza singleton del controller.
     * @param connectionString Stringa di connessione al database Postgres (solo alla prima chiamata)
     */
    public static getInstance(client?: Client): GSGController {
        if (!GSGController.instance) {
            GSGController.instance = new GSGController(client);
        }
        return GSGController.instance;
    }

    /**
     * Restituisce il client Postgres attualmente utilizzato.
     * @returns Istanza del client Postgres
     */
    public getClient(): Client {
        return this.client;
    }

    /**
     * Crea una funzione e un trigger nel database per notificare nuovi ordini tramite il canale 'new_order'.
     * Utile per ricevere eventi in tempo reale quando vengono inseriti nuovi ordini.
     */
    public createDbFunction(): void {
        console.log("[GSG] Creazione funzione e trigger nel database...");
        this.client.query(`
            CREATE OR REPLACE FUNCTION notify_new_order()
            RETURNS TRIGGER AS $$
            BEGIN
                PERFORM pg_notify('new_order', json_build_object(
                    'operation', TG_OP,
                    'item', row_to_json(NEW)
                )::text);
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;
        `)
        .then(() => {
            return this.client.query(`
                DROP TRIGGER IF EXISTS ordini_trigger ON ordini;
                CREATE TRIGGER ordini_trigger
                AFTER INSERT ON ordini
                FOR EACH ROW EXECUTE FUNCTION notify_new_order();
            `);
        })
        .then(() => {
            console.log("[GSG] Funzione e trigger creati con successo.");
        })
        .catch(err => {
            console.error("[GSG] Errore creazione funzione e trigger:", err);
        });
    }

    /**
     * Si sottoscrive agli eventi di nuovi ordini tramite il canale 'new_order'.
     * Invoca la callback ogni volta che viene ricevuta una notifica dal database.
     * @param callback Funzione da chiamare con i dati dell'ordine ricevuto
     */
    public async subscribeToNewOrders(callback: (data: any) => void): Promise<void> {
        this.client.query("LISTEN new_order");

        this.client.on("notification", (msg) => {
            if (!msg.payload) return;

            try {
                const data = JSON.parse(msg.payload);
                // console.log("📥 Evento ricevuto:", data);
                callback(data);
            } catch (err) {
                console.error("Errore parsing payload:", err, msg.payload);
            }
        });
    }

    /**
     * Invia l'ordine ricevuto al servizio di stampa.
     * Puoi personalizzare questa funzione per aggiungere logica di stampa specifica.
     * @param order Oggetto ordine da stampare
     */
    public async printOrder(order: any): Promise<void> {
        // console.log("[GSG] Stampa ordine:", order);

        // console.log("[GSG] Nuovo ordine ID:", order.id);
        // console.log("[GSG] Coperti:", order.coperti);
        // console.log("[GSG] Numero Tavolo:", order.numeroTavolo);
        // console.log("[GSG] Cliente:", order.cliente);
        // console.log("[GSG] Timestamp:", order.ora);
        // console.log("[GSG] Cassiere:", order.cassiere);
        // Qui puoi aggiungere la logica per inviare l'ordine al servizio di stampa

        await handleIncomingOrderFromGSG(order);
    }

    /**
     * Esegue una query SQL usando Bun con Postgres.
     * @param query La query SQL da eseguire
     * @param params Parametri opzionali per la query
     * @returns Risultato della query
     */
    // public async query<T = any>(query: string, params?: any[]): Promise<T[]> {
    //     // Usa la stringa di connessione per ogni query
    //     return await sql<T[]>({ connectionString: this.connectionString })`${sql.raw(query, ...(params || []))}`;
    // }

    /**
     * Bun gestisce la connessione automaticamente, quindi non serve chiudere manualmente.
     */
    public async closeConnection(): Promise<void> {
        if (this.client) {
            await this.client.end();
            console.log("[GSG] Connessione al database chiusa.");
        } else {
            console.warn("[GSG] Nessuna connessione da chiudere.");
        }
        return;
    }

}