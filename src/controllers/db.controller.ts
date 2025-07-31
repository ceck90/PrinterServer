import { Database } from "bun:sqlite";
import type { ReceiptLog } from "../types";
import { $ } from "bun";
import { existsSync } from "fs";
import { savePrintersToDb } from "../print-routing.config";

const DB_FILE = "data/receipts.sqlite";
const BACKUP_FILE = "data/receipts_backup.sqlite";

export class DatabaseController {
    static #instance: DatabaseController;
    private db: Database;

    private constructor() {
        this.db = new Database(DB_FILE);
        console.log("[DB] Database initialized with file:", DB_FILE);
        if (existsSync(DB_FILE)) {
            if (this.checkIntegrity()) {
                this.backupDatabase(BACKUP_FILE);
            } else {
                throw new Error("[DB] Database integrity check failed. Aborting initialization.");
            }
        }
        this.initializeDatabase();

        // savePrintersToDb().then(() => {
        //     console.log("[DB] Printers saved to database.");
        // }).catch(err => {
        //     console.error("[DB] Error saving printers to database:", err);
        // });
    }


    public static get instance(): DatabaseController {
        if (!DatabaseController.#instance) {
            DatabaseController.#instance = new DatabaseController();
        }
        return DatabaseController.#instance;
    }

    public backupDatabase(backupPath: string) {
        if (existsSync(backupPath)) {
            console.warn(`[DB] Backup file already exists at: ${backupPath}. Overwriting...`);
        }
        Bun.write(backupPath, Bun.file(DB_FILE));
        console.log(`[DB] Database backup created at: ${backupPath}`);
    }

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

    private initializeDatabase() {
        console.log("[DB] Initializing database schema...");

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
                printData BLOB,
                printStatus TEXT CHECK(printStatus IN ('PRINTED', 'FAILED')),
                printed BOOLEAN DEFAULT 0,
                printedAt TEXT,
                reprinted BOOLEAN DEFAULT 0,
                reprintedAt TEXT
            );
        `);

        this.db.run(`
            CREATE INDEX IF NOT EXISTS idx_receipts_orderNumber ON receipts (orderNumber);
        `);

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

        this.db.run(`
            CREATE TABLE IF NOT EXISTS settings (
                id INTEGER PRIMARY KEY AUTOINCREMENT  
            );
        `);

        // savePrintersToDb();
    }

    public getPrinterSettings() {
        return this.db.query(
            `SELECT * FROM printers`
        ).get();
    }

    public getPrinterSettingsByKey(key: string) {
        return this.db.query(
            `SELECT * FROM printers WHERE key = ?`
        ).get(key);
    }

    public savePrinterSettings(printers: { key:string, printerName: string, printerIp: string, printerPort: number, printerDestinations: string, active: boolean, description: string }) {
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
                printers.key,
                printers.printerName,
                printers.printerIp,
                printers.printerPort,
                printers.printerDestinations,
                printers.active,
                printers.description
            ]
        );

        // console.log("[DB] Printer settings saved:", settings);
    }

    public getPrinterById(id: string) {
        return this.db.query(
            `SELECT * FROM printers WHERE key = ${id}`
        ).get();
    }

    public getPrinterByDestination(dest: string) {
        return this.db.query(
            `SELECT * FROM printers WHERE printerDestinations LIKE ${dest}`
        ).get();
    }

    public saveReceipt(log: ReceiptLog) {
        this.db.run(
            `INSERT INTO receipts (
            orderId, orderNumber, orderStatus, destination, printData, tableNumber, clientName,
            note, itemName, printStatus, printedAt, reprintedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(orderId) DO UPDATE SET
            orderNumber = excluded.orderNumber,
            orderStatus = excluded.orderStatus,
            destination = excluded.destination,
            printData = excluded.printData,
            tableNumber = excluded.tableNumber,
            clientName = excluded.clientName,
            note = excluded.note,
            itemName = excluded.itemName,
            printStatus = excluded.printStatus,
            printedAt = excluded.printedAt,
            reprintedAt = excluded.reprintedAt`,
            [
                log.id,
                log.orderNumber,
                log.orderStatus,
                log.destination,
                log.printData,
                log.tableNumber,
                log.clientName,
                log.note,
                log.itemName,
                log.printStatus,
                log.printedAt.toISOString(),
                log.reprintedAt ? log.reprintedAt.toISOString() : null
            ]
        );
    }


    public getAllReceipts(
        limit = 50,
        offset = 0,
        printStatus?: "PRINTED" | "FAILED",
        startDate?: Date,
        endDate?: Date
    ) {
        const fields = `
        id, orderId, orderNumber, orderStatus, destination, itemName, tableNumber, clientName,
        note, printStatus, printed, printedAt, reprinted, reprintedAt
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


    public getReceiptsByDate(startDate: Date, endDate: Date, limit = 50) {
        return this.db.query(
            `SELECT * FROM receipts WHERE printedAt BETWEEN ${startDate.toISOString()} AND ${endDate.toISOString()} ORDER BY printedAt DESC LIMIT ${limit}`
        ).all() as ReceiptLog[];
    }

    public getReceiptById(id: number) {
        return this.db.query(
            `SELECT * FROM receipts WHERE id = ?`
        ).get(id);
    }

    public async updateReceiptStatus(id: number, printStatus: string) {
        this.db.run(
            `UPDATE receipts SET printStatus = ?, printed = ? WHERE id = ?`,
            [printStatus, true, id]
        );
    }

    public async updateReceiptReprint(id: number, printStatus: string) {
        this.db.run(
            `UPDATE receipts SET printStatus = ?, reprintedAt = ?, reprinted = ? WHERE id = ?`,
            [printStatus, new Date().toISOString(), true, id]
        );
    }

    public async deleteReceipt(id: string) {
        this.db.run(
            `DELETE FROM receipts WHERE id = ?`,
            [id]
        );
    }
}

