export interface OrderItem {
    name: string;
    qty: number;
    price: number;
    dest: string;
}

export interface OrderPayload {
    id: string;
    timestamp: string;
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