import { Database } from "bun:sqlite";
import type { ReceiptLog } from "../types";
import { $ } from "bun";
import { existsSync } from "fs";
import { savePrintersToDb } from "../print-routing.config";

export class DatabaseController {
    static #instance: DatabaseController;
    private db: Database;

    private constructor() {
        this.db = new Database("receipts.sqlite");
        console.log("[DB] Database initialized with file: receipts.sqlite");
        if (existsSync("receipts.sqlite")) {
            if (this.checkIntegrity()) {
                const backupPath = `receipts_backup.sqlite`;
                this.backupDatabase(backupPath);
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
        Bun.write(backupPath, Bun.file("receipts.sqlite"));        
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
                orderId TEXT,
                destination TEXT,
                itemName TEXT,
                printData BLOB,
                status TEXT CHECK(status IN ('PRINTED', 'FAILED')),
                printedAt TEXT,
                reprintedAt TEXT
            );
        `);

        this.db.run(`
            CREATE INDEX IF NOT EXISTS idx_receipts_orderId ON receipts (orderId);
        `);

        this.db.run(`
            CREATE TABLE IF NOT EXISTS settings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,   
                key TEXT UNIQUE,
                printerName TEXT,
                printerIp TEXT,
                printerPort INTEGER,
                printerDestinations TEXT
            );
        `);

        // savePrintersToDb();
    }

    public getPrinterSettings() {
        return this.db.query(
            `SELECT * FROM settings`
        ).get();
    }

    public getPrinterSettingsByKey(key: string) {
        return this.db.query(
            `SELECT * FROM settings WHERE key = ?`
        ).get(key);
    }

    public savePrinterSettings(settings: { key:string, printerName: string, printerIp: string, printerPort: number, printerDestinations: string }) {
        this.db.run(
            `INSERT OR REPLACE INTO settings (key, printerName, printerIp, printerPort, printerDestinations)
            VALUES (?, ?, ?, ?, ?)`,
            [settings.key, settings.printerName, settings.printerIp, settings.printerPort, settings.printerDestinations]
        );

        // console.log("[DB] Printer settings saved:", settings);
    }

    public getPrinterById(id: string) {
        return this.db.query(
            `SELECT * FROM settings WHERE key = ${id}`
        ).get();
    }

    public getPrinterByDestination(dest: string) {
        return this.db.query(
            `SELECT * FROM settings WHERE printerDestinations LIKE ${dest}`
        ).get();
    }

    public saveReceipt(log: ReceiptLog) {
        this.db.run(
            `INSERT OR REPLACE INTO receipts (orderId, destination, printData, itemName, status, printedAt, reprintedAt)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [log.orderId, log.destination, log.printData, log.itemName, log.status, log.printedAt.toISOString(), log.reprintedAt ? log.reprintedAt.toISOString() : null]
        );
    }

    public getAllReceipts(limit = 50, status?: "PRINTED" | "FAILED") {
        let query = `SELECT * FROM receipts ORDER BY printedAt DESC LIMIT ?`;
        const params: (string | number)[] = [limit];

        if (status) {
            query = `SELECT * FROM receipts WHERE status = ? ORDER BY printedAt DESC LIMIT ?`;
            params.unshift(status);
        }

        return this.db.query(query).all(...params) as ReceiptLog[];
    }

    public getReceiptById(id: number) {
        return this.db.query(
            `SELECT * FROM receipts WHERE id = ?`
        ).get(id);
    }

    public async updateReceiptStatus(id: number, status: string) {
        this.db.run(
            `UPDATE receipts SET status = ? WHERE id = ?`,
            [status, id]
        );
    }

    public async updateReceiptReprint(id: number, status: string) {
        this.db.run(
            `UPDATE receipts SET status = ?, reprintedAt = ? WHERE id = ?`,
            [status, new Date().toISOString(), id]
        );
    }

    public async deleteReceipt(id: string) {
        this.db.run(
            `DELETE FROM receipts WHERE id = ?`,
            [id]
        );
    }
}

