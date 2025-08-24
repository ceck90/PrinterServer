export interface OrderItem {
    status?: "NEW" | "IN_PROGRESS" | "DONE";
    name: string;
    tableNumber: string;
    clientName: string;
    itemNote: string;
    orderNotes?: string;
    takeAway: boolean;
    qty?: number;
    dest: string;
}

export interface OrderPayload {
    orderId: string;
    id: string;
    createdAt?: string;
    timestamp: string;
    orderNumber: number;
    status: "TODO" | "PROGRESS" | "DONE" | "CANCELLED";
    items: OrderItem[];
}

export interface ReceiptLog {
    id: string;
    orderId: string;
    orderNumber: number;
    orderStatus: "TODO" | "PROGRESS" | "DONE" | "CANCELLED";
    destination: string;
    itemName: string;
    printData: Buffer;
    clientName: string;
    tableNumber: string;
    itemNote: string;
    orderNotes: string;
    printStatus: "PRINTED" | "FAILED";
    printedAt: Date;
    printed: boolean
    reprintedAt?: Date;
    reprinted?: boolean;
    takeAway: boolean;
}

// import type { ScheduledTask } from "node-cron";

export type JobId = string;

export interface JobDefinition {
  id: JobId;
  name: string;
  cron: string;               // es: "*/5 * * * * *" (con seconds) o "*/1 * * * *"
  timezone?: string;          // es: "Europe/Rome"
  startNow?: boolean;         // opzionale: run immediata
  enabled?: boolean;          // default: true
  meta?: Record<string, unknown>;
  task: () => Promise<void> | void;
}

export interface JobInfo {
  id: JobId;
  name: string;
  cron: string;
  timezone?: string;
  enabled: boolean;
  running: boolean;
  lastRunAt?: Date;
  nextRuns?: Date[];          // opzionale: preview prossime esecuzioni
  meta?: Record<string, unknown>;
}

export interface UpdateJobInput {
  cron?: string;
  timezone?: string;
  enabled?: boolean;
  meta?: Record<string, unknown>;
  task?: () => Promise<void> | void;
}
