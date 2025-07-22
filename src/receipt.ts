import { Align, Drawer, InMemory, Printer, Style } from "escpos-buffer";
import type { OrderItem, OrderPayload } from "./types";

export async function buildKitchenReceipt(order: OrderPayload, dest: string, items: OrderItem[]): Promise<Buffer> {
    const connection = new InMemory();
    const printer = await Printer.CONNECT('MP-4200 TH', connection);

    await printer.setColumns(56)
    await printer.setAlignment(Align.Center);
    await printer.writeln(`Comanda: ${order.id}`);
    await printer.writeln(`Stazione: ${dest}`);
    await printer.writeln(new Date(order.timestamp).toLocaleString());


    await printer.feed(6)
    await printer.buzzer()
    await printer.cutter()
    await printer.drawer(Drawer.First)

    return connection.buffer();
}