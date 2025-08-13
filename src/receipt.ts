import { Align, Cut, Drawer, InMemory, Printer, Style, Image } from "escpos-buffer";
import { ImageManager } from "escpos-buffer-image";
import type { OrderItem, OrderPayload } from "./types";

const path = require('path');

import { ThermalPrinter, PrinterTypes, CharacterSet, BreakLine  } from "node-thermal-printer";

export async function buildKitchenReceipt(order: OrderPayload, dest: string, items: OrderItem[]): Promise<Buffer> {
    const connection = new InMemory();
    const imageManager = new ImageManager();
    const printer = await Printer.CONNECT('POS-80', connection, imageManager);

    // await printer.cutter(Cut.Full)
    // await printer.setColumns(56)
    await printer.setAlignment(Align.Center);

    const imageData = await imageManager.loadImage(path.join(__dirname, 'www/assets/img/mfo-logo-bw.png'));
    const image = new Image(imageData);
    await printer.draw(image);
    
    if(order.status === "CANCELLED") {
        await printer.withStyle({
            width: 1,
            height: 1,
            bold: true,
            italic: false,
            underline: true,
            align: Align.Center,
            }, async () => {
                await printer.writeln(`!!!! ANNULLATO !!!!`);
        })
    }

    await printer.withStyle({
        width: 2,
        height: 2,
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
        width: 1,
        height: 1,
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
            width: 1,
            height: 1,
            bold: true,
            italic: false,
            underline: false,
            align: Align.Center,
        }, async () => {
            await printer.writeln(`___________________`);
        })

    await printer.qrcode("MFO" + order.orderId.toString(), 4);
    await printer.feed(5)
    await printer.buzzer()
    await printer.cutter(Cut.Full)

    return connection.buffer();
}

export async function buildKitchenReceipt_v2(order: OrderPayload, dest: string, items: OrderItem[]): Promise<Buffer> {
    const printer = new ThermalPrinter({
        type: PrinterTypes.EPSON,                                 // Printer type: 'star' or 'epson'
        width: 48,                                                // Number of characters in one line
        interface: 'tcp://127.0.0.1:9100',                       // Printer interface
        characterSet: CharacterSet.PC850_MULTILINGUAL,                    // Printer character set
        removeSpecialCharacters: true, 
        lineCharacter: "=",                                       // Set character for lines - default: "-"
        breakLine: BreakLine.WORD,                                // Break line after WORD or CHARACTERS. Disabled with NONE - default: WORD
        options:{                                                 // Additional options
            timeout: 5000                                         // Connection timeout (ms) [applicable only for network printers] - default: 3000
        }
    });

    await printer.printImage(path.join(__dirname, 'www/assets/img/mfo-logo-bw.png'));

    // Prints table with custom settings (text, align, width, cols, bold)
    printer.tableCustom([                                       
        { text: "Left", align: "LEFT", width: 0.5 },
        { text: "Center", align: "CENTER", width: 0.5, bold: true },
        { text: "Right", align: "RIGHT", width: 0.5 }
    ]);

    printer.printQR(order.orderId.toString());

    printer.partialCut();
    // printer.beep(3, 1);


    var buffer = printer.getBuffer();

    // console.log("Buffer size:", buffer.length);
    // console.log("Buffer content:", buffer.toString('hex'));

    return buffer;

    // try {
    //     const connected = await printer.isPrinterConnected();
    //     console.log('Printer connected:', connected);
    //     const status = await printer.execute();
    //     console.log('Printer status:', status);
    // } catch (e) {
    //     console.error('Print failed:', e);
    // }
}