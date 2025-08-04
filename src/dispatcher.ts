import type { OrderPayload } from "./types";
import { groupBy } from "./utils";
import { buildKitchenReceipt, buildKitchenReceipt_v2 } from "./receipt";
import { sendToPrinter } from "./print";
import { printers } from "./print-routing.config";
import type { PrinterConfig } from "./print-routing.config";
import { DatabaseController } from "./controllers/db.controller";

export async function handleIncomingData(data: any) {
    console.log("[DISPATCHER] Dati ricevuti:", data);

    if (data.type != "PKMI_UPDATE") {
        console.warn("[DISPATCHER] Tipo di dato non gestito:", data.type);
        return;
    }

    if (!data || !data.plateKitchenMenuItem || !data.plateKitchenMenuItem.menuItem) {
        return;
    }

    switch (data.plateKitchenMenuItem.status) {
        case "TODO":
        case "PROGRESS":
            if (data.plateKitchenMenuItem.plate == null) {
                console.warn("[DISPATCHER] Ordine in lavorazione senza destinazione:", data.plateKitchenMenuItem);
                return;
            }
            break;
        case "DONE":
        case "CANCELLED":
            console.log(`[DISPATCHER] Ordine cancellato: ${data.plateKitchenMenuItem.orderNumber} - ${data.plateKitchenMenuItem.plate.name}/${data.plateKitchenMenuItem.menuItem.name}`);
            return;
    }

    const order: OrderPayload = {
        id: data.plateKitchenMenuItem.id,
        orderId: data.plateKitchenMenuItem.id,
        status: data.plateKitchenMenuItem.status,
        createdAt: data.plateKitchenMenuItem.menuItem.createdDate || new Date().toISOString(),
        timestamp: new Date().toISOString(),
        orderNumber: data.plateKitchenMenuItem.orderNumber || 0,
        items: [{
            dest: data.plateKitchenMenuItem.plate.name,
            name: data.plateKitchenMenuItem.menuItem.name,
            qty: data.plateKitchenMenuItem.quantity || 1,
            tableNumber: data.plateKitchenMenuItem.tableNumber,
            clientName: data.plateKitchenMenuItem.clientName,
            itemNote: data.plateKitchenMenuItem.notes || "",
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
        // Cerca la stampante nell'array
        const printer = printers.find(p => p.destination === dest || p.name === dest);
        if (!printer) {
            console.warn(`Nessuna stampante configurata per la destinazione: ${dest}`);
            continue;
        }

        if (order.status == "TODO" || order.status == "DONE") {
            console.warn(`[DISPATCHER] Ordine ${order.id} con stato ${order.status} non gestito per la destinazione: ${dest}`);
            continue;
        }

        console.log(`[DISPATCHER] Gestione ordine: ${order.id} con stato: ${order.status} su ${dest}`);

        try {
            const buffer = await buildKitchenReceipt(order, dest, items);
            if (printer.active) {
                console.log(`[DISPATCHER] Stampa ordine ${order.id} a ${printer.destination} (${printer.ip}:${printer.port})`);
                await sendToPrinter(printer.destination, printer.ip, printer.port, buffer);
            }

            DatabaseController.instance.saveReceipt({
                id: order.id,
                orderId: order.orderId,
                orderNumber: order.orderNumber,
                orderStatus: order.status,
                destination: dest,
                itemName: order.items[0].name,
                tableNumber: order.items[0].tableNumber,
                clientName: order.items[0].clientName,
                itemNote: order.items[0].itemNote,
                orderNotes: order.items[0].orderNotes || "",
                printData: buffer,
                printStatus: printer.active ? "PRINTED" : "FAILED",
                printedAt: new Date(),
                printed: true,
                takeAway: order.items[0].takeAway
            });
        } catch (err) {
            console.error(`Errore stampando ${dest}:`, err);
            DatabaseController.instance.saveReceipt({
                id: order.id,
                orderId: order.orderId,
                orderNumber: order.orderNumber,
                orderStatus: order.status,
                destination: dest,
                itemName: order.items[0].name,
                tableNumber: order.items[0].tableNumber,
                clientName: order.items[0].clientName,
                itemNote: order.items[0].itemNote,
                orderNotes: order.items[0].orderNotes || "",
                printData: Buffer.from(""),
                printStatus: "FAILED",
                printedAt: new Date(),
                printed: true,
                takeAway: order.items[0].takeAway
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
    const printer = printers.find(p => p.destination === receipt.destination || p.name === receipt.destination);
    if (!printer) {
        console.warn(`[DISPATCHER] Nessuna stampante configurata per la destinazione: ${receipt.destination}`);
        return;
    }
    try {
        console.log(`[DISPATCHER] Ristampo ticket per ordine ${receipt.id} su ${receipt.destination}`);
        if (printer.active) {
            await sendToPrinter(printer.destination, printer.ip, printer.port, receipt.printData);
            await DatabaseController.instance.updateReceiptReprint(receipt.id, "PRINTED");
            console.log(`[DISPATCHER] Ricevuta per ordine ${receipt.id} ristampata su ${receipt.destination}`);
        } else {
            console.warn(`[DISPATCHER] Stampante ${receipt.destination} non attiva, non posso ristampare il ticket per ordine ${receipt.id}`);
            await DatabaseController.instance.updateReceiptReprint(receipt.id, "FAILED");
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

export async function handlePrinterSettingsUpdate(settings: { key: string, printerName: string, printerIp: string, printerPort: number, printerDestinations: string, active: boolean, description: string }) {
    console.log(`[DISPATCHER] Aggiornamento impostazioni stampante ${settings.key}`);
    await DatabaseController.instance.savePrinterSettings(settings);
}
export async function handlePrinterSettingsRetrieval(key: string) {
    console.log(`[DISPATCHER] Recupero impostazioni stampante per ${key}`);
    return DatabaseController.instance.getPrinterSettingsByKey(key);
}