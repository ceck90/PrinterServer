import { Database } from "bun:sqlite";
import type { ReceiptLog } from "../types";
import { $ } from "bun";
import { existsSync } from "fs";
import { hashPassword, verifyPassword } from "../users";
import { readdirSync, unlinkSync } from "fs";
import { dirname, basename } from "path";


/**
 * Controller singleton per la gestione del database SQLite.
 * Gestisce backup, integrità, CRUD per ticket e stampanti.
 */
export class DatabaseController {
    static #instance: DatabaseController;
    private db: Database;

    private dbPath: string;

    /**
     * Costruttore privato: inizializza il database e verifica integrità.
     */
    private constructor(dbPath: string) {
        if (!dbPath) {
            throw new Error("[DB] dbPath is required.");
        }
        this.db = new Database(dbPath);
        this.dbPath = dbPath;
        console.log("[DB] Database initialized with file:", this.dbPath);
        if (existsSync(this.dbPath)) {
            this.backupDatabase(this.dbPath);
        }
        this.initializeDatabase();
    }

    /**
     * Ritorna l'istanza singleton del controller.
     */
    public static getInstance(dbPath?: string): DatabaseController {
        if (!DatabaseController.#instance) {
            DatabaseController.#instance = new DatabaseController(dbPath || './data/db.sqlite');
        }
        return DatabaseController.#instance;
    }

    /** Restituisce il percorso del file di database.
     * @returns Percorso del file di database
     */
    public getDbPath() {
        return this.dbPath;
    }

    /** Controlla se il database è bloccato.
     * @returns true se il database è bloccato, false altrimenti
     */
    private isDbLocked(): boolean {
        try {
            const result = this.db.query(`PRAGMA database_list;`).all();
            return result.some((dbInfo: any) => dbInfo.file === this.dbPath && dbInfo.locked);
        } catch (error) {
            console.error("[DB] Error checking if database is locked:", error);
            return false;
        }
    }

    /**
     * Esegue il backup del database su un file specificato.
     * @param backupPath Percorso del file di backup
     */
    public async backupDatabase(backupPath: string) {
        // if (existsSync(backupPath)) {
        //     console.warn(`[DB] Backup file already exists at: ${backupPath}. Overwriting...`);
        // }
        if (this.isDbLocked()) {
            console.error("[DB] Cannot create backup, database is locked.");
            return;
        }
        if(this.checkIntegrity() === false) {
            console.error("[DB] Database integrity check failed! Backup aborted.");
            return;
        }
        // File name + `.backup-${new Date().toISOString().replace(/[:.]/g, '-')}.sqlite`
        backupPath += `.backup-${new Date().toISOString().replace(/[:.]/g, '-')}.sqlite`;
        Bun.write(backupPath, Bun.file(this.dbPath));
        console.log(`[DB] Database backup created at: ${backupPath}`);
        //Mantieni solo gli ultimi 10 backup
        const backupDir = dirname(backupPath);
        const baseName = basename(this.dbPath);
        const backupFiles = readdirSync(backupDir)
            .filter(f => f.startsWith(baseName + ".backup-") && f.endsWith(".sqlite"))
            .sort((a, b) => b.localeCompare(a)); // newest first

        if (backupFiles.length > 10) {
            for (const oldFile of backupFiles.slice(10)) {
                unlinkSync(`${backupDir}/${oldFile}`);
            }
        }
    }

    /**
     * Esegue un controllo di integrità sul database.
     * @returns true se il database è integro, false altrimenti
     */
    public checkIntegrity(): boolean {
        const result = this.db.query(`PRAGMA integrity_check;`).get() as { integrity_check?: string } | undefined;
        if (result?.integrity_check === "ok") {
            console.log("[DB] Integrity check passed.");
            return true;
        } else {
            console.error("[DB] Integrity check failed:", result);
            return false;
        }
    }

    /**
     * Inizializza lo schema del database (crea tabelle e indici se non esistono).
     */
    private initializeDatabase() {
        console.log("[DB] Initializing database schema...");

        // Tabella ricevute
        this.db.run(`
            CREATE TABLE IF NOT EXISTS receipts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                orderId STRING UNIQUE,
                orderNumber INTEGER,
                orderStatus TEXT CHECK(orderStatus IN ('TODO', 'PROGRESS', 'DONE', 'CANCELLED')),
                destination TEXT,
                itemName TEXT,
                tableNumber TEXT,
                clientName TEXT,
                itemNote TEXT,
                orderNotes TEXT,
                printData BLOB,
                printStatus TEXT CHECK(printStatus IN ('PRINTED', 'FAILED')),
                printed BOOLEAN DEFAULT 0,
                printedAt TEXT,
                reprinted BOOLEAN DEFAULT 0,
                reprintedAt TEXT,
                takeAway BOOLEAN DEFAULT 0
            );
        `);

        // Indice per ricerca rapida su orderNumber
        this.db.run(`
            CREATE INDEX IF NOT EXISTS idx_receipts_orderNumber ON receipts (orderNumber);
        `);

        // Tabella stampanti
        this.db.run(`
            CREATE TABLE IF NOT EXISTS printers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,   
                key TEXT UNIQUE,
                printerName TEXT,
                printerIp TEXT,
                printerPort INTEGER,
                printerDestinations TEXT,
                active BOOLEAN DEFAULT 0,
                upsideDown BOOLEAN DEFAULT 0,
                beepEnable BOOLEAN DEFAULT 0,
                description TEXT
            );
        `);

        // Tabella impostazioni generiche
        this.db.run(`
            CREATE TABLE IF NOT EXISTS settings (
                id INTEGER PRIMARY KEY AUTOINCREMENT  
            );
        `);

        //tabella barcode
        this.db.run(`
            CREATE TABLE IF NOT EXISTS barcodes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                code TEXT UNIQUE,
                timestamp TEXT,
                success BOOLEAN
            );
        `);

        // tabella token
        this.db.run(`
            CREATE TABLE IF NOT EXISTS tokens (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                token TEXT UNIQUE,
                createdAt TEXT,
                expiresAt TEXT
            );
        `);

        //tabella users
        this.db.run(`
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE,
                password TEXT,
                createdAt TEXT,
                updatedAt TEXT
            );
        `);

        //tabella ordini da GSG
        this.db.run(`
            CREATE TABLE IF NOT EXISTS gsg_orders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                gsgId INTEGER UNIQUE,
                orderId STRING UNIQUE,
                orderNumber INTEGER,
                tableNumber TEXT,
                clientName TEXT,
                orderNotes TEXT,
                orderTimestamp TEXT,
                coperti INTEGER
            );
        `);

        // Cache persistente della plate originale degli ordini TODO.
        // Sopravvive a crash e reboot: consente al resync di stampare sulla
        // stampante corretta anche se la plate è cambiata durante la transizione
        // TODO → PROGRESS. La riga viene rimossa dopo che l'ordine è stampato.
        this.db.run(`
            CREATE TABLE IF NOT EXISTS todo_plate_cache (
                orderId TEXT PRIMARY KEY,
                plateName TEXT NOT NULL,
                createdAt TEXT NOT NULL
            );
        `);

        // Seed iniziale per gli utenti
        this.seedUsers();
    }

    private async seedUsers() {
        const users = [
            { username: "admin", password: "password", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
            { username: "user", password: "user", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
        ];

        for (const user of users) {
            user.password = await hashPassword(user.password);
        }

        for (const user of users) {
            this.db.run(
                `INSERT INTO users (username, password, createdAt, updatedAt)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(username) DO UPDATE SET
                    password = excluded.password,
                    updatedAt = excluded.updatedAt`,
                [user.username, user.password, user.createdAt, user.updatedAt]
            );
        }

        console.log("[DB] Users seeded");
    }

    /**
     * Restituisce tutte le stampanti configurate.
     * @returns Array di stampanti dal DB
     */
    public getPrinterSettings() {
        const result = this.db.query(
            `SELECT key as key, printerName as name, printerIp as ip, printerPort as port, printerDestinations as destination, active, upsideDown, beepEnable, description FROM printers`
        ).all();
        return Array.isArray(result) ? result : [];
    }

    /**
     * Restituisce le impostazioni di una stampante tramite la chiave.
     * @param key Chiave univoca della stampante
     * @returns Oggetto stampante o undefined
     */
    public getPrinterSettingsByKey(key: string) {
        return this.db.query(
            `SELECT * FROM printers WHERE key = ?`
        ).get(key);
    }

    /**
     * Salva o aggiorna le impostazioni di una stampante.
     * @param printer Oggetto con i dati della stampante
     */
    public savePrinterSettings(printer: { key: string, printerName: string, printerIp: string, printerPort: number, printerDestinations: string, active: boolean, upsideDown: boolean, beepEnable: boolean, description: string }) {
        this.db.run(
            `INSERT INTO printers (key, printerName, printerIp, printerPort, printerDestinations, active, upsideDown, beepEnable, description)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET
                printerName = excluded.printerName,
                printerIp = excluded.printerIp,
                printerPort = excluded.printerPort,
                printerDestinations = excluded.printerDestinations,
                active = excluded.active,
                upsideDown = excluded.upsideDown,
                beepEnable = excluded.beepEnable,
                description = excluded.description`,
            [
                printer.key,
                printer.printerName,
                printer.printerIp,
                printer.printerPort,
                printer.printerDestinations,
                printer.active,
                printer.upsideDown,
                printer.beepEnable,
                printer.description
            ]
        );

        // console.log("[DB] Printer settings saved:", settings);
    }

    /**
     * Restituisce una stampante tramite la chiave (id).
     * @param id Chiave della stampante
     * @returns Oggetto stampante o undefined
     */
    public getPrinterById(id: string) {
        return this.db.query(
            `SELECT * FROM printers WHERE key = ${id}`
        ).get();
    }

    /**
     * Restituisce una stampante tramite la destinazione.
     * @param dest Nome destinazione
     * @returns Oggetto stampante o undefined
     */
    public getPrinterByDestination(dest: string) {
        return this.db.query(
            `SELECT * FROM printers WHERE printerDestinations LIKE ${dest}`
        ).get();
    }

    /**
     * Elimina una stampante dal database.
     * @param key Chiave della stampante da eliminare
     */
    public async deletePrinter(key: string) {
        this.db.run(
            `DELETE FROM printers WHERE key = ?`,
            [key]
        );
    }   

    /**
     * Aggiorna le impostazioni di una stampante esistente.
     * @param printer Oggetto con i dati della stampante
     */
    public async updatePrinterSettings(printer: { key: string, printerName: string, printerIp: string, printerPort: number, printerDestinations: string, active: boolean, upsideDown: boolean, description: string }) {
        this.db.run(
            `UPDATE printers SET
                printerName = ?,
                printerIp = ?,
                printerPort = ?,
                printerDestinations = ?,
                active = ?,
                upsideDown = ?,
                description = ?
            WHERE key = ?`,
            [
                printer.printerName,
                printer.printerIp,
                printer.printerPort,
                printer.printerDestinations,
                printer.active,
                printer.upsideDown,
                printer.description,
                printer.key
            ]
        );
    }   

    /**
     * Aggiunge una nuova stampante nel database.
     * @param printer Oggetto con i dati della stampante
     */
    public async addPrinter(printer: { key: string, printerName: string, printerIp: string, printerPort: number, printerDestinations: string, active: boolean, upsideDown: boolean, description: string }) {
        this.db.run(
            `INSERT INTO printers (key, printerName, printerIp, printerPort, printerDestinations, active, upsideDown, description)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                printer.key,
                printer.printerName,
                printer.printerIp,
                printer.printerPort,
                printer.printerDestinations,
                printer.active,
                printer.upsideDown,
                printer.description
            ]
        );
    }

    /**
     * Salva o aggiorna una ricevuta nel database.
     * @param log Oggetto ReceiptLog con i dati della ricevuta
     */
    public saveReceipt(log: ReceiptLog) {
        this.db.run(
            `INSERT INTO receipts (
            orderId, orderNumber, orderStatus, destination, printData, tableNumber, clientName,
            itemNote, orderNotes, itemName, printStatus, printedAt, reprintedAt, takeAway
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(orderId) DO UPDATE SET
            orderNumber = excluded.orderNumber,
            orderStatus = excluded.orderStatus,
            destination = excluded.destination,
            printData = excluded.printData,
            tableNumber = excluded.tableNumber,
            clientName = excluded.clientName,
            itemNote = excluded.itemNote,
            orderNotes = excluded.orderNotes,
            itemName = excluded.itemName,
            printStatus = excluded.printStatus,
            printedAt = excluded.printedAt,
            reprintedAt = excluded.reprintedAt,
            takeAway = excluded.takeAway`,
            [
                log.id,
                log.orderNumber,
                log.orderStatus,
                log.destination,
                log.printData,
                log.tableNumber,
                log.clientName,
                log.itemNote,
                log.orderNotes,
                log.itemName,
                log.printStatus,
                log.printedAt.toISOString(),
                log.reprintedAt ? log.reprintedAt.toISOString() : null,
                log.takeAway ? 1 : 0
            ]
        );
    }

    /**
     * Restituisce tutte le ricevute, con filtri opzionali.
     * @param limit Numero massimo di risultati
     * @param offset Offset per la paginazione
     * @param printStatus Filtro per stato stampa
     * @param startDate Data inizio filtro
     * @param endDate Data fine filtro
     * @returns Array di ReceiptLog
     */
    public getAllReceipts(
        limit = 50,
        offset = 0,
        printStatus?: "PRINTED" | "FAILED",
        startDate?: Date,
        endDate?: Date
    ) {
        const fields = `
        id, orderId, orderNumber, orderStatus, destination, itemName, tableNumber, clientName,
        itemNote, orderNotes, printStatus, printed, printedAt, reprinted, reprintedAt, takeAway
    `;

        // Costruzione dinamica della WHERE clause
        const conditions: string[] = [];
        const params: (string | number)[] = [];

        if (printStatus) {
            conditions.push("printStatus = ?");
            params.push(printStatus);
        }

        if (startDate) {
            conditions.push("printedAt >= ?");
            const start = new Date(startDate);
            start.setUTCHours(0, 0, 0, 0);
            params.push(start.toISOString());
        }

        if (endDate) {
            conditions.push("printedAt <= ?");
            const end = new Date(endDate);
            end.setUTCHours(23, 59, 59, 999);
            params.push(end.toISOString());
        }

        let query = `SELECT ${fields} FROM receipts`;

        if (conditions.length > 0) {
            query += ` WHERE ${conditions.join(" AND ")}`;
        }

        query += ` ORDER BY printedAt DESC LIMIT ? OFFSET ?`;
        params.push(limit, offset);

        // console.log("[DB] Fetching all receipts:", { limit, offset, printStatus, startDate, endDate });

        // console.log("[DB] Query:", query, "Params:", params);

        return this.db.query(query).all(...params) as ReceiptLog[];
    }

    /**
     * Restituisce tutte le ricevute stampate tra due date.
     * @param startDate Data inizio
     * @param endDate Data fine
     * @param limit Numero massimo risultati
     * @returns Array di ReceiptLog
     */
    public getReceiptsByDate(startDate: Date, endDate: Date, limit = 50) {
        return this.db.query(
            `SELECT * FROM receipts WHERE printedAt BETWEEN ${startDate.toISOString()} AND ${endDate.toISOString()} ORDER BY printedAt DESC LIMIT ${limit}`
        ).all() as ReceiptLog[];
    }

    /**
     * Restituisce una ricevuta tramite ID.
     * @param id ID della ricevuta
     * @returns Oggetto ReceiptLog o undefined
     */
    public getReceiptById(id: number, status?: string) {
        return this.db.query(
            `SELECT * FROM receipts WHERE id = ?`
        ).get(id);
    }

    /**
     * Restituisce una ricevuta tramite ID.
     * @param id ID della ricevuta
     * @param status Stato opzionale della ricevuta
     * @return ReceiptLog o undefined
     */
    public getReceiptByIdAndStatus(orderId: string, orderStatus?: string) {
        const conditions = ["orderId = ?"];
        const params: (string | number)[] = [orderId];

        if (orderStatus) {
            conditions.push("orderStatus = ?");
            params.push(orderStatus);
        }

        const query = `SELECT * FROM receipts WHERE ${conditions.join(" AND ")}`;
        // console.log("[DB] Query receipt by ID:", query, "Params:", params);
        return this.db.query(query).get(...params) as ReceiptLog | undefined;
    }

    /**
     * Aggiorna lo stato di stampa di una ricevuta.
     * @param id ID della ricevuta
     * @param printStatus Nuovo stato stampa
     */
    public async updateReceiptStatus(id: number, printStatus: string) {
        this.db.run(
            `UPDATE receipts SET printStatus = ?, printed = ? WHERE id = ?`,
            [printStatus, true, id]
        );
    }

    /**
     * Aggiorna lo stato di ristampa di una ricevuta.
     * @param id ID della ricevuta
     * @param printStatus Nuovo stato stampa
     */
    public async updateReceiptReprint(id: number, printStatus: string) {
        this.db.run(
            `UPDATE receipts SET printStatus = ?, reprintedAt = ?, reprinted = ? WHERE id = ?`,
            [printStatus, new Date().toISOString(), true, id]
        );
    }

    /**
     * Elimina una ricevuta dal database.
     * @param id ID della ricevuta
     */
    public async deleteReceipt(id: string) {
        this.db.run(
            `DELETE FROM receipts WHERE id = ?`,
            [id]
        );
    }

    /**
     * Elimina tutte le ricevute dal database.
     */
    public async deleteAllReceipts() {
        this.db.run(
            `DELETE FROM receipts`
        );
    }

    /**
     * Aggiunge o aggiorna un codice a barre.
     * @param code Valore del codice a barre
     * @param success Stato di successo dell'operazione
     */
    public async addOrUpdateBarcode(code: string, success: boolean) {
        this.db.run(
            `INSERT INTO barcodes (code, timestamp, success)
            VALUES (?, ?, ?)
            ON CONFLICT(code) DO UPDATE SET
                timestamp = excluded.timestamp,
                success = excluded.success`,
            [code, new Date().toISOString(), success ? 1 : 0]
        );
    }

    /**
     * Restituisce un codice a barre tramite il suo valore.
     * @param code Valore del codice a barre
     * @returns Oggetto Barcode o undefined
     */
    public async getBarcode(code: string) {
        return this.db.query(
            `SELECT * FROM barcodes WHERE code = ?`
        ).get(code);
    }

    /**
     * Restituisce tutti i codici a barre.
     * @returns Array di Barcode
     */
    public async getAllBarcodes() {
        return this.db.query(
            `SELECT * FROM barcodes`
        ).all();
    }

    /**
     * Elimina tutti i codici a barre.
     */
    public async deleteAllBarcodes() {
        this.db.run(
            `DELETE FROM barcodes`
        );
    }

    //#region USERS

    /**
     * Restituisce un utente tramite il suo ID.
     * @param id ID dell'utente
     * @returns Oggetto User o undefined
     */
    public async getUserById(id: number) {
        return this.db.query(
            `SELECT * FROM users WHERE id = ?`
        ).get(id);
    }

    /**
     * Restituisce un utente tramite il suo nome utente.
     * @param username Nome utente dell'utente
     * @returns Oggetto User o undefined
     */
    public async getUserByUsername(username: string) {
        return this.db.query(
            `SELECT * FROM users WHERE username = ?`
        ).get(username);
    }

    /**
     * Crea un nuovo utente.
     * @param username Nome utente dell'utente
     * @param password Password dell'utente
     * @returns ID dell'utente creato
     */
    public async createUser(username: string, password: string) {
        const result = await this.db.run(
            `INSERT INTO users (username, password) VALUES (?, ?)`,
            [username, password]
        );
        return result;
    }

    /**
     * Aggiorna un utente esistente.
     * @param id ID dell'utente
     * @param username Nome utente dell'utente
     * @param password Password dell'utente
     */
    public async updateUser(id: number, username: string, password: string) {
        await this.db.run(
            `UPDATE users SET username = ?, password = ? WHERE id = ?`,
            [username, password, id]
        );
    }

    /**
     * Aggiorna la password di un utente esistente.
     * @param id ID dell'utente
     * @param newPassword Nuova password dell'utente
     */
    public async updateUserPassword(id: number, newPassword: string) {
        await this.db.run(
            `UPDATE users SET password = ? WHERE id = ?`,
            [newPassword, id]
        );
    }

    /**
     * Elimina un utente esistente.
     * @param id ID dell'utente
     */
    public async deleteUser(id: number) {
        await this.db.run(
            `DELETE FROM users WHERE id = ?`,
            [id]
        );
    }

    //#endregion USERS

    //#region TODO PLATE CACHE

    /**
     * Persiste la plate originale di un ordine TODO nel database.
     * Usa INSERT OR IGNORE per non sovrascrivere il valore originale se
     * l'ordine viene visto più volte prima della stampa.
     * @param orderId ID dell'ordine
     * @param plateName Nome originale della plate al momento della creazione
     */
    public saveTodoPlate(orderId: string, plateName: string): void {
        this.db.run(
            `INSERT OR IGNORE INTO todo_plate_cache (orderId, plateName, createdAt)
             VALUES (?, ?, ?)`,
            [orderId, plateName, new Date().toISOString()]
        );
    }

    /**
     * Restituisce la plate originale memorizzata per un ordine TODO.
     * @param orderId ID dell'ordine
     * @returns Nome della plate originale, o null se non presente
     */
    public getTodoPlate(orderId: string): string | null {
        const row = this.db.query(
            `SELECT plateName FROM todo_plate_cache WHERE orderId = ?`
        ).get(orderId) as { plateName: string } | null;
        return row?.plateName ?? null;
    }

    /**
     * Rimuove la plate originale dalla cache persistente dopo che l'ordine
     * è stato processato (stampato o scartato per idempotency).
     * @param orderId ID dell'ordine
     */
    public deleteTodoPlate(orderId: string): void {
        this.db.run(
            `DELETE FROM todo_plate_cache WHERE orderId = ?`,
            [orderId]
        );
    }

    /**
     * Restituisce tutte le entry della cache plate originale.
     * Usato dal meccanismo di riconciliazione per trovare ordini potenzialmente
     * persi (passati a DONE/CANCELLED senza essere stati catturati come PROGRESS).
     */
    public getAllTodoPlateCache(): Array<{ orderId: string; plateName: string; createdAt: string }> {
        return this.db.query(
            `SELECT orderId, plateName, createdAt FROM todo_plate_cache`
        ).all() as Array<{ orderId: string; plateName: string; createdAt: string }>;
    }

    //#endregion TODO PLATE CACHE
}

