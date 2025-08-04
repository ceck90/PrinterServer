import { Align, Cut, Drawer, InMemory, Printer, Style } from "escpos-buffer";
import type { OrderItem, OrderPayload } from "./types";

import { ThermalPrinter, PrinterTypes, CharacterSet, BreakLine  } from "node-thermal-printer";

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

export async function printTest() {
    const printer = new ThermalPrinter({
        type: PrinterTypes.EPSON,                                  // Printer type: 'star' or 'epson'
        width: 48,                                                // Number of characters in one line
        interface: 'tcp://10.10.1.95:9100',                       // Printer interface
        characterSet: CharacterSet.PC858_EURO,                  // Printer character set
        removeSpecialCharacters: false,                           // Removes special characters - default: false
        lineCharacter: "=",                                       // Set character for lines - default: "-"
        breakLine: BreakLine.WORD,                                // Break line after WORD or CHARACTERS. Disabled with NONE - default: WORD
        options:{                                                 // Additional options
            timeout: 5000                                           // Connection timeout (ms) [applicable only for network printers] - default: 3000
        }
    });

    // printer.beep();

    await printer.printImage('src/www/assets/img/mfo-logo.png');

    printer.partialCut();
    printer.beep(3, 1);

    try {
        const connected = await printer.isPrinterConnected();
        console.log('Printer connected:', connected);
        const status = await printer.execute();
        console.log('Printer status:', status);
    } catch (e) {
        console.error('Print failed:', e);
    }
}