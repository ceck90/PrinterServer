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