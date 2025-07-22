import { Database } from "bun:sqlite";
import type { ReceiptLog } from "../types";

export class DatabaseController {
    static #instance: DatabaseController;
    private db: Database;

    private constructor() {
        this.db = new Database("receipts.sqlite");
        this.initializeDatabase();
    }

    public static get instance(): DatabaseController {
        if (!DatabaseController.#instance) {
            DatabaseController.#instance = new DatabaseController();
        }
        return DatabaseController.#instance;
    }

    private initializeDatabase() {
        this.db.run(`
            CREATE TABLE IF NOT EXISTS receipts (
                id TEXT PRIMARY KEY,
                orderId TEXT,
                destination TEXT,
                content BLOB,
                status TEXT CHECK(status IN ('PRINTED', 'FAILED')),
                printedAt TEXT
            );
        `);
    }

    public saveReceipt(log: ReceiptLog) {
        this.db.run(
            `INSERT OR REPLACE INTO receipts (id, orderId, destination, content, status, printedAt)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [log.id, log.orderId, log.destination, log.content, log.status, log.printedAt.toISOString()]
        );
    }

    public getAllReceipts(limit = 50) {
        return this.db.query(
            `SELECT * FROM receipts ORDER BY printedAt DESC LIMIT ?`
        ).all(limit);
    }

    public getReceiptById(id: string) {
        return this.db.query(
            `SELECT * FROM receipts WHERE id = ?`
        ).get(id);
    }

    public updateReceiptStatus(id: string, status: string) {
        this.db.run(
            `UPDATE receipts SET status = ? WHERE id = ?`,
            [status, id]
        );
    }

    public deleteReceipt(id: string) {
        this.db.run(
            `DELETE FROM receipts WHERE id = ?`,
            [id]
        );
    }
}

