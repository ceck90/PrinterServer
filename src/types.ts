export interface OrderItem {
    status?: "NEW" | "IN_PROGRESS" | "DONE";
    name: string;
    tableNumber: string;
    clientname: string;
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
    orderId: string;
    destination: string;
    content: Buffer;
    status: "PRINTED" | "FAILED";
    printedAt: Date;
}