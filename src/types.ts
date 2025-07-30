export interface OrderItem {
    status?: "NEW" | "IN_PROGRESS" | "DONE";
    name: string;
    tableNumber: string;
    clientName: string;
    note: string;
    orderNotes?: string;
    takeAway: boolean;
    qty?: number;
    dest: string;
}

export interface OrderPayload {
    id: string;
    createdAt?: string;
    timestamp: string;
    orderNumber: number;
    items: OrderItem[];
}

export interface ReceiptLog {
    id: string;
    orderNumber: string;
    destination: string;
    itemName: string;
    printData: Buffer;
    clientName: string;
    tableNumber: string;
    note: string;
    status: "PRINTED" | "FAILED";
    printedAt: Date;
    reprintedAt?: Date;
}