import type { OrderPayload } from "./types";
import { groupBy } from "./utils";
import { buildKitchenReceipt } from "./receipt";
import { sendToPrinter } from "./print";
import { printerMap } from "./print-routing.config.ts";

type PrinterDest = keyof typeof printerMap;
import { DatabaseController } from "./controllers/db.controller.ts";

export async function handleIncomingData(data: any) {
    // console.log("[DISPATCHER] Dati ricevuti:", data);

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
        id: data.plateKitchenMenuItem.menuItem.externalId,
        createdAt: data.plateKitchenMenuItem.menuItem.createdDate || new Date().toISOString(),
        timestamp: new Date().toISOString(),
        orderNumber : data.plateKitchenMenuItem.orderNumber || 0,
        items: [{
            dest: data.plateKitchenMenuItem.plate.name,
            name: data.plateKitchenMenuItem.menuItem.name,
            qty: data.plateKitchenMenuItem.quantity || 1,
            tableNumber: data.plateKitchenMenuItem.tableNumber,
            clientname: data.plateKitchenMenuItem.clientName,
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
            await sendToPrinter(printer.ip, printer.port, buffer);

            DatabaseController.instance.saveReceipt({
                id,
                orderId: order.id,
                destination: dest,
                content: buffer,
                status: "PRINTED",
                printedAt: new Date(),
            });
        } catch (err) {
            console.error(`Errore stampando ${dest}:`, err);
            DatabaseController.instance.saveReceipt({
                id,
                orderId: order.id,
                destination: dest,
                content: Buffer.from(""),
                status: "FAILED",
                printedAt: new Date(),
            });
        }
    }
}