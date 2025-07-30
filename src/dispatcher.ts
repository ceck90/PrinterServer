import type { OrderPayload } from "./types";
import { groupBy } from "./utils";
import { buildKitchenReceipt } from "./receipt";
import { sendToPrinter } from "./print";
import { printerMap } from "./print-routing.config.ts";

type PrinterDest = keyof typeof printerMap;
import { DatabaseController } from "./controllers/db.controller.ts";

export async function handleIncomingData(data: any) {
    console.log("[DISPATCHER] Dati ricevuti:", data);

    if (!data || !data.plateKitchenMenuItem || !data.plateKitchenMenuItem.menuItem) {
        // console.error("Dati non validi ricevuti:", data);
        return;
    }

    switch (data.plateKitchenMenuItem.status) {
        case "TODO":
            // console.log("[DISPATCHER] Nuovo ordine ricevuto:", data.plateKitchenMenuItem);
            return; // Non gestiamo ordini "TODO" qui, ma in un altro punto
        case "PROGRESS":
            // console.log("[DISPATCHER] Ordine in lavorazione:", data.plateKitchenMenuItem);
            if( data.plateKitchenMenuItem.plate != null && data.plateKitchenMenuItem.plate != undefined) {
                break;
            }
            else {
                console.warn("[DISPATCHER] Ordine in lavorazione senza destinazione:", data.plateKitchenMenuItem);
                return;
            }
        case "DONE":
            // console.log("[DISPATCHER] Ordine completato:", data.plateKitchenMenuItem);
            return; // Non gestiamo ordini "DONE" qui, ma in un altro punto
        case "CANCELED":
            console.log("[DISPATCHER] Ordine cancellato:", data.plateKitchenMenuItem);
            return; // Non gestiamo ordini cancellati
    }

    const order: OrderPayload = {
        id: data.plateKitchenMenuItem.id,
        createdAt: data.plateKitchenMenuItem.menuItem.createdDate || new Date().toISOString(),
        timestamp: new Date().toISOString(),
        orderNumber : data.plateKitchenMenuItem.orderNumber || 0,
        items: [{
            dest: data.plateKitchenMenuItem.plate.name,
            name: data.plateKitchenMenuItem.menuItem.name,
            qty: data.plateKitchenMenuItem.quantity || 1,
            tableNumber: data.plateKitchenMenuItem.tableNumber,
            clientName: data.plateKitchenMenuItem.clientName,
            note: data.plateKitchenMenuItem.note || "",
            orderNotes: data.plateKitchenMenuItem.orderNotes || "",
            takeAway: data.plateKitchenMenuItem.takeAway || false,
        }],
    };

    await handleIncomingOrder(order);
}

export async function handleIncomingOrder(order: OrderPayload) {
    console.log("[DISPATCHER] Gestione ordine:", order);
    const grouped = groupBy(order.items, i => i.dest);
    for (const [dest, items] of Object.entries(grouped)) {
        const printer = printerMap[dest as PrinterDest];
        if (!printer){
            console.warn(`Nessuna stampante configurata per la destinazione: ${dest}`);
            continue;
        }

        const id = `${order.id}-${dest}`;
        try {
            const buffer = await buildKitchenReceipt(order, dest, items);
            if(printer.active) {
                await sendToPrinter(printer.destination, printer.ip, printer.port, buffer);
            }

            DatabaseController.instance.saveReceipt({
                id,
                orderNumber: order.id,
                destination: dest,
                itemName: order.items[0].name,
                tableNumber: order.items[0].tableNumber,
                clientName: order.items[0].clientName,
                note: order.items[0].note,
                printData: buffer,
                status: "PRINTED",
                printedAt: new Date(),
            });
        } catch (err) {
            console.error(`Errore stampando ${dest}:`, err);
            DatabaseController.instance.saveReceipt({
                id,
                orderNumber: order.id,
                destination: dest,
                itemName: order.items[0].name,
                tableNumber: order.items[0].tableNumber,
                clientName: order.items[0].clientName,
                note: order.items[0].note,
                printData: Buffer.from(""),
                status: "FAILED",
                printedAt: new Date(),
            });
        }
    }
}

export async function printSpecificOrder(orderNumber: number) {
    const receipt = await DatabaseController.instance.getReceiptById(orderNumber) as { id: number, printData: Buffer, destination: string } | null;
    if (!receipt) {
        console.warn(`[DISPATCHER] Nessuna ticket trovata per ordine ${orderNumber}`);
        return;
    }
    const printer = printerMap[receipt.destination as PrinterDest];
    if (!printer) {
        console.warn(`[DISPATCHER] Nessuna stampante configurata per la destinazione: ${receipt.destination}`);
        return;
    }
    try {
        console.log(`[DISPATCHER] Ristampo ticket per ordine ${receipt.id} su ${receipt.destination}`);
        if(printer.active) {
            await sendToPrinter(printer.destination, printer.ip, printer.port, receipt.printData);
            await DatabaseController.instance.updateReceiptReprint(receipt.id, "PRINTED");
            console.log(`[DISPATCHER] Ricevuta per ordine ${receipt.id} ristampata su ${receipt.destination}`);
        }
    } catch (err) {
        console.error(`[DISPATCHER] Errore nella ristampa del ticket per ordine ${receipt.id}`);
        await DatabaseController.instance.updateReceiptStatus(receipt.id, "FAILED");
    }
}

export async function handleOrderStatusUpdate(orderNumber: number, status: "PRINTED" | "FAILED") {
    console.log(`[DISPATCHER] Aggiornamento stato ordine ${orderNumber} a ${status}`);
    const receipt = await DatabaseController.instance.getReceiptById(orderNumber) as { id: number } | null;
    if (receipt) {
        await DatabaseController.instance.updateReceiptStatus(receipt.id, status);
    } else {
        console.warn(`[DISPATCHER] Ricevuta non trovata per l'ordine ${orderNumber}`);
    }
}

export async function handleReceiptDeletion(receiptId: string) {
    console.log(`[DISPATCHER] Eliminazione ricevuta ${receiptId}`);
    await DatabaseController.instance.deleteReceipt(receiptId);
}

export async function handlePrinterSettingsUpdate(settings: { key: string, printerName: string, printerIp: string, printerPort: number, printerDestinations: string, active: boolean }) {
    console.log(`[DISPATCHER] Aggiornamento impostazioni stampante ${settings.key}`);
    await DatabaseController.instance.savePrinterSettings(settings);
}
export async function handlePrinterSettingsRetrieval(key: string) {
    console.log(`[DISPATCHER] Recupero impostazioni stampante per ${key}`);
    return DatabaseController.instance.getPrinterSettingsByKey(key);
}