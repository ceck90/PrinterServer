import { Database } from "bun:sqlite";
import type { ReceiptLog } from "../types";
import { $ } from "bun";
import { existsSync } from "fs";


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
            if (this.checkIntegrity()) {
                this.backupDatabase(this.dbPath + ".backup");
            } else {
                throw new Error("[DB] Database integrity check failed. Aborting initialization.");
            }
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

    /**
     * Esegue il backup del database su un file specificato.
     * @param backupPath Percorso del file di backup
     */
    public backupDatabase(backupPath: string) {
        if (existsSync(backupPath)) {
            console.warn(`[DB] Backup file already exists at: ${backupPath}. Overwriting...`);
        }
        Bun.write(backupPath, Bun.file(this.dbPath));
        console.log(`[DB] Database backup created at: ${backupPath}`);
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
                note TEXT,
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

        // savePrintersToDb();
    }

    /**
     * Restituisce tutte le stampanti configurate.
     * @returns Array di stampanti dal DB
     */
    public getPrinterSettings() {
        const result = this.db.query(
            `SELECT key as key, printerName as name, printerIp as ip, printerPort as port, printerDestinations as destination, active, description FROM printers`
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
    public savePrinterSettings(printer: { key: string, printerName: string, printerIp: string, printerPort: number, printerDestinations: string, active: boolean, description: string }) {
        this.db.run(
            `INSERT INTO printers (key, printerName, printerIp, printerPort, printerDestinations, active, description)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET
                printerName = excluded.printerName,
                printerIp = excluded.printerIp,
                printerPort = excluded.printerPort,
                printerDestinations = excluded.printerDestinations,
                active = excluded.active,
                description = excluded.description`,
            [
                printer.key,
                printer.printerName,
                printer.printerIp,
                printer.printerPort,
                printer.printerDestinations,
                printer.active,
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
    public async updatePrinterSettings(printer: { key: string, printerName: string, printerIp: string, printerPort: number, printerDestinations: string, active: boolean, description: string }) {
        this.db.run(
            `UPDATE printers SET
                printerName = ?,
                printerIp = ?,
                printerPort = ?,
                printerDestinations = ?,
                active = ?,
                description = ?
            WHERE key = ?`,
            [
                printer.printerName,
                printer.printerIp,
                printer.printerPort,
                printer.printerDestinations,
                printer.active,
                printer.description,
                printer.key
            ]
        );
    }   

    /**
     * Aggiunge una nuova stampante nel database.
     * @param printer Oggetto con i dati della stampante
     */
    public async addPrinter(printer: { key: string, printerName: string, printerIp: string, printerPort: number, printerDestinations: string, active: boolean, description: string }) {
        this.db.run(
            `INSERT INTO printers (key, printerName, printerIp, printerPort, printerDestinations, active, description)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                printer.key,
                printer.printerName,
                printer.printerIp,
                printer.printerPort,
                printer.printerDestinations,
                printer.active,
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
            note, orderNotes, itemName, printStatus, printedAt, reprintedAt, takeAway
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(orderId) DO UPDATE SET
            orderNumber = excluded.orderNumber,
            orderStatus = excluded.orderStatus,
            destination = excluded.destination,
            printData = excluded.printData,
            tableNumber = excluded.tableNumber,
            clientName = excluded.clientName,
            note = excluded.note,
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
        note, orderNotes, printStatus, printed, printedAt, reprinted, reprintedAt, takeAway
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

    public async getBarcode(code: string) {
        return this.db.query(
            `SELECT * FROM barcodes WHERE code = ?`
        ).get(code);
    }

    public async getAllBarcodes() {
        return this.db.query(
            `SELECT * FROM barcodes`
        ).all();
    }
}

