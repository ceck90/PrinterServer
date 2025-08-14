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

export async function buildKitchenReceipt_v2(order: OrderPayload, dest: string, items: OrderItem[], upsideDown: boolean = false, beepEnable: boolean = false): Promise<Buffer> {
    const printer = new ThermalPrinter({
        type: PrinterTypes.EPSON,                                 // Printer type: 'star' or 'epson'
        width: 80,                                                // Number of characters in one line
        interface: 'tcp://127.0.0.1:9100',                       // Printer interface
        characterSet: CharacterSet.PC850_MULTILINGUAL,                    // Printer character set
        removeSpecialCharacters: true, 
        lineCharacter: "=",                                       // Set character for lines - default: "-"
        breakLine: BreakLine.WORD,                                // Break line after WORD or CHARACTERS. Disabled with NONE - default: WORD
        options:{                                                 // Additional options
            timeout: 5000                                         // Connection timeout (ms) [applicable only for network printers] - default: 3000
        }
    });

    console.log("[PRINT] Building ticket...");
    if(upsideDown) console.log("[PRINT] Stampa capovolta");

    await printer.upsideDown(upsideDown);

    // await printer.printImage(path.join(__dirname, 'www/assets/img/mfo-logo-bw.png'));

    // Prints table with custom settings (text, align, width, cols, bold)
    // printer.tableCustom([                                       
    //     { text: "Left", align: "LEFT", width: 0.5 },
    //     { text: "Center", align: "CENTER", width: 0.5, bold: true },
    //     { text: "Right", align: "RIGHT", width: 0.5 }
    // ]);

    // console.log(items);

    printer.alignCenter();

    printer.setTextNormal();
    printer.setTextSize(0, 0);
    printer.bold(true);
    printer.underline(false);

    // INTESTAZIONE
    const currentYear = new Date().getFullYear();
    printer.setTextSize(1, 0);
    printer.underlineThick(true);
    printer.println(` -- Music FestOn ${currentYear} --`);
    printer.underlineThick(false);
    printer.setTextSize(0, 0);
    // printer.drawLine("_");
    
    printer.newLine();

    // ASPORTO
    // if( items[0].takeAway ) {
    //     printer.alignCenter();
    //     printer.bold(true);
    //     printer.invert(true);
    //     printer.setTextSize(2, 0);
    //     printer.println(` -- ASPORTO -- `);
    //     printer.setTextSize(0, 0);
    //     printer.invert(false);

    //     printer.setTextNormal();
    //     printer.alignLeft();
    // }

    // TIPO DI PIATTO E CATEGORIA
    // printer.invert(false);
    printer.alignCenter();
    printer.setTextSize(1, 1);
    printer.underlineThick(true);
    printer.println(`${dest} - ${order.items[0].name}`);
    printer.setTextSize(0, 0);
    printer.underlineThick(false);
    // printer.drawLine("_");
    // printer.invert(false);

    // INFORMAZIONI ORDINE
    printer.alignLeft();
    printer.setTextSize(1, 0);
    printer.println(`ORDINE: ${order.orderNumber} TAVOLO: ${items[0].tableNumber}`);
    printer.println(`CLIENTE: ${items[0].clientName}`);

    //SEZIONE NOTE
    printer.setTextSize(0, 0);
    if( items[0].itemNote ) {
        printer.println(`NOTE PIATTO: ${items[0].itemNote}`);
    }
    if( items[0].orderNotes ) {
        
        printer.alignCenter();
        printer.println(`- ${items[0].orderNotes} -`);
    }
    printer.setTextSize(0, 0);

    printer.newLine();

    // ASPORTO
    if( items[0].takeAway ) {
        printer.alignCenter();
        printer.bold(true);
        printer.invert(true);
        printer.setTextSize(2, 0);
        printer.println(` -- ASPORTO -- `);
        printer.setTextSize(0, 0);
        printer.invert(false);

        printer.setTextNormal();
        printer.alignLeft();
    }

    printer.alignCenter();
    // printer.printQR("MFO" + order.orderId.toString(), 
    //     { 
    //         cellSize: 6, 
    //         correction: "H",
    //     }
    // );

    // printer.printBarcode(`MFO${order.orderId.toString()}`, 8, {

    //     hriFont: 1,
    //     hriPos: 2
    // });

    // printer.code128(`MFO${order.orderId.toString()}`, {
    //     height:50,
    //     text: 1
    // });

    printer.pdf417(`MFO${order.orderId.toString()}`, {
        rowHeight: 3,            // 2 - 8
        width: 3,                // 2 - 8
        correction: 1,           // Ratio: 1 - 40
        truncated: false,        // boolean
        columns: 0               // 1 - 30, 0 auto
    });

    printer.newLine();

    printer.partialCut({ verticalTabAmount: 1 });
    
    if(beepEnable) {
        printer.beep(3, 1);
    }

    var buffer = printer.getBuffer();


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