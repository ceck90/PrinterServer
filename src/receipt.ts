import { Align, Cut, Drawer, InMemory, Printer, Style } from "escpos-buffer";
import type { OrderItem, OrderPayload } from "./types";

export async function buildKitchenReceipt(order: OrderPayload, dest: string, items: OrderItem[]): Promise<Buffer> {
    const connection = new InMemory();
    const printer = await Printer.CONNECT('POS-80', connection);

    // await printer.cutter(Cut.Full)
    // await printer.setColumns(56)
    await printer.setAlignment(Align.Center);
    
    if(order.status === "CANCELLED") {
        await printer.withStyle({
            width: 4,
            height: 8,
            bold: true,
            italic: false,
            underline: true,
            align: Align.Center,
            }, async () => {
                await printer.writeln(`!!!! ANNULLATO !!!!`);
        })
    }

    await printer.withStyle({
        width: 4,
        height: 10,
        bold: true,
        italic: false,
        underline: false,
        align: Align.Center,
        }, async () => {
            await printer.writeln(`----- ${dest} -----`);
            if( items[0].takeAway) {
                await printer.writeln(`---- ASPORTO ----`, Style.Bold);
            }
            await printer.writeln(`TIPO: ${items[0].name}`);
    })

    await printer.withStyle({
        width: 4,
        height: 8,
        bold: false,
        italic: false,
        underline: false,
        align: Align.Center,
        }, async () => {
            await printer.writeln(`ORDINE: ${order.orderNumber}`);
            await printer.writeln(`TAVOLO: ${items[0].tableNumber}`);
            await printer.writeln(`CLIENTE: ${items[0].clientName}`);
            if( items[0].itemNote ) {
                await printer.writeln(`NOTE PIATTO: ${items[0].itemNote}`);
            }
            if( items[0].orderNotes ) {
                await printer.writeln(`NOTE ORDINE: ${items[0].orderNotes}`);
            }
    })
    // await printer.writeln(new Date(order.timestamp).toLocaleString());
    // await printer.drawer(Drawer.Second)
    await printer.withStyle({
        width: 4,
        height: 8,
        bold: true,
        italic: false,
        underline: false,
        align: Align.Center,
        }, async () => {
            await printer.writeln(`___________________`);
    })
    await printer.feed(5)
    await printer.buzzer()
    await printer.cutter(Cut.Full)

    return connection.buffer();
}