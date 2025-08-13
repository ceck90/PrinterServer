import type { OrderPayload } from "./types";
import { groupBy } from "./utils";
import { buildKitchenReceipt, buildKitchenReceipt_v2 } from "./receipt";
import { sendToPrinter } from "./print";
import { printers } from "./print-routing.config";
import type { PrinterConfig } from "./print-routing.config";
import { DatabaseController } from "./controllers/db.controller";
import { sleep } from "bun";

export async function handleSingleOrderData(data: any) {
    // console.log("[DISPATCHER] Dati ricevuti:", data);
    if (Array.isArray(data)) {
        for (const item of data) {
            // console.log("[DISPATCHER] Gestisco il sync di:", item.id);
            const order: OrderPayload = {
                id: item.id,
                orderId: item.id,
                status: item.status,
                createdAt: item.menuItem.createdDate || new Date().toISOString(),
                timestamp: new Date().toISOString(),
                orderNumber: item.orderNumber || 0,
                items: [{
                    dest: item.plate?.name || "",
                    name: item.menuItem.name,
                    qty: item.quantity || 1,
                    tableNumber: item.tableNumber,
                    clientName: item.clientName,
                    itemNote: item.notes || "",
                    orderNotes: item.orderNotes || "",
                    takeAway: item.takeAway || false,
                }],
            };
            await handleIncomingOrder(order);
        }
    } 
}


/**
 * Gestisce i dati in ingresso dal WebSocket o da altre fonti.
 * Filtra solo i messaggi di tipo PKMI_UPDATE e costruisce l'oggetto ordine.
 */
export async function handleIncomingData(data: any) {
    // console.log("[DISPATCHER] Dati ricevuti:", data);

    // Ignora tipi di messaggio non gestiti
    if (data.type != "PKMI_UPDATE") {
        console.warn("[DISPATCHER] Tipo di dato non gestito:", data.type);
        return;
    }

    // Controlla la presenza dei dati minimi necessari
    if (!data || !data.plateKitchenMenuItem || !data.plateKitchenMenuItem.menuItem) {
        return;
    }

    // console.log(`[DISPATCHER] Ricevuto PKMI_UPDATE per ordine ${data.plateKitchenMenuItem.orderNumber} - ${data.plateKitchenMenuItem.plate.name}/${data.plateKitchenMenuItem.menuItem.name}`);

    // Gestione degli stati dell'ordine
    switch (data.plateKitchenMenuItem.status) {
        case "TODO":
        case "PROGRESS":
            // Se manca la destinazione, ignora l'ordine
            if (data.plateKitchenMenuItem.plate == null) {
                console.warn("[DISPATCHER] Ordine in lavorazione senza destinazione:", data.plateKitchenMenuItem);
                return;
            }
            break;
        case "DONE":
            console.log(`[DISPATCHER] Ordine completato: ${data.plateKitchenMenuItem.orderNumber} - ${data.plateKitchenMenuItem.plate.name}/${data.plateKitchenMenuItem.menuItem.name}`);
            return;
        case "CANCELLED":
            // Logga gli ordini completati o cancellati e ignora
            console.log(`[DISPATCHER] Ordine cancellato: ${data.plateKitchenMenuItem.orderNumber} - ${data.plateKitchenMenuItem.plate.name}/${data.plateKitchenMenuItem.menuItem.name}`);
            return;
    }

    console.log(`[DISPATCHER] Gestisco ordine ${data.plateKitchenMenuItem.orderNumber} - ${data.plateKitchenMenuItem.plate.name}/${data.plateKitchenMenuItem.menuItem.name} con stato: ${data.plateKitchenMenuItem.status}`);

    // Costruisce l'oggetto ordine da processare
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

    // Passa l'ordine alla funzione di gestione principale
    await handleIncomingOrder(order);
}

/**
 * Gestisce la logica di stampa e salvataggio per ogni ordine ricevuto.
 * Raggruppa gli item per destinazione e invia i dati alla stampante corretta.
 */
export async function handleIncomingOrder(order: OrderPayload) {
    // console.log("[DISPATCHER] Gestione ordine:", order);

    // Raggruppa gli item per destinazione (es: CUCINA, BAR, ecc.)
    const grouped = groupBy(order.items, i => i.dest);

    // Cicla su ogni gruppo/destinazione
    for (const [dest, items] of Object.entries(grouped)) {
        // Cerca la stampante nell'array globale printers
        const printer = printers.find(p => p.destination === dest || p.name === dest);
        if (!printer) {
            // console.warn(`[DISPATCHER] Nessuna stampante configurata per la destinazione: ${dest}`);
            continue;
        }

        // Gestisce solo stati specifici
        if (order.status == "TODO" || order.status == "DONE") {
            // console.warn(`[DISPATCHER] Ordine ${order.id} con stato ${order.statuss} non gestito per la destinazione: ${dest}`);
            continue;
        }

        // console.log(`[DISPATCHER] Gestione ordine: ${order.id} con stato: ${order.status} su ${dest}`);

        // Verifica se l'ordine è già registrato nel DB per questa destinazione
        const existingReceipt = await DatabaseController.getInstance().getReceiptByIdAndStatus(order.orderId, order.status);
        if (existingReceipt) {
            // console.log(`[DISPATCHER] Ordine ${order.id} già registrato per la destinazione ${dest}, salto la stampa.`);
            continue;
        }

        console.log(`[DISPATCHER] Gestisco ordine ${order.id} per la destinazione ${dest} con stampante ${printer.name}`);

        try {
            // Costruisce il buffer di stampa (es. ESC/POS)
            const buffer = await buildKitchenReceipt(order, dest, items);

            // Se la stampante è attiva, invia i dati
            if (printer.active) {
                console.log(`[DISPATCHER] Stampa ordine ${order.id} a ${printer.destination} (${printer.ip}:${printer.port})`);
                await sendToPrinter(printer.destination, printer.ip, printer.port, buffer);
            }

            // Salva la ricevuta nel database (stato PRINTED o FAILED)
            DatabaseController.getInstance().saveReceipt({
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
            // In caso di errore di stampa, salva comunque la ricevuta come FAILED
            console.error(`Errore stampando ${dest}:`, err);
            DatabaseController.getInstance().saveReceipt({
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

/**
 * Ristampa una ricevuta specifica dato il numero d'ordine.
 * Cerca la ricevuta e la stampante, invia i dati e aggiorna lo stato nel DB.
 */
export async function printSpecificOrder(orderNumber: number) {
    const receipt = await DatabaseController.getInstance().getReceiptById(orderNumber) as { id: number, printData: Buffer, destination: string } | null;
    if (!receipt) {
        console.warn(`[DISPATCHER] Nessuna ticket trovato per ordine ${orderNumber}`);
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
            await DatabaseController.getInstance().updateReceiptReprint(receipt.id, "PRINTED");
            console.log(`[DISPATCHER] Ricevuta per ordine ${receipt.id} ristampata su ${receipt.destination}`);
        } else {
            console.warn(`[DISPATCHER] Stampante ${receipt.destination} non attiva, non posso ristampare il ticket per ordine ${receipt.id}`);
            await DatabaseController.getInstance().updateReceiptReprint(receipt.id, "FAILED");
        }
    } catch (err) {
        console.error(`[DISPATCHER] Errore nella ristampa del ticket per ordine ${receipt.id}`);
        await DatabaseController.getInstance().updateReceiptStatus(receipt.id, "FAILED");
    }
}

export async function regenerateSpecificReceipt(orderNumber: number) {
    const receipt = await DatabaseController.getInstance().getReceiptById(orderNumber) as {
        id: number; 
        orderId: string;
        tableNumber: string;
        orderNumber: number;
        orderStatus: string;
        clientName: string;
        itemName: string;
        itemNote: string;
        orderNotes: string;
        takeAway: boolean; 
        printData: Buffer;
        destination: string;
} | null;

    console.log(`[DISPATCHER] Rigenerazione ricevuta per ordine`, receipt);
    if (!receipt) {
        console.warn(`[DISPATCHER] Nessuna ricevuta trovata per ordine ${orderNumber}`);
        return;
    }
    const printer = printers.find(p => p.destination === receipt.destination || p.name === receipt.destination);
    if (!printer) {
        console.warn(`[DISPATCHER] Nessuna stampante configurata per la destinazione: ${receipt.destination}`);
        return;
    }
    try {
        console.log(`[DISPATCHER] Rigenero ricevuta per ordine ${receipt.id} su ${receipt.destination}`);
        if (printer.active) {
            // Rigenera il buffer di stampa
            const order: OrderPayload = {
                id: receipt.id.toString(),
                orderId: receipt.orderId,
                status: receipt.orderStatus as "TODO" | "PROGRESS" | "DONE" | "CANCELLED",
                createdAt: new Date().toISOString(),
                timestamp: new Date().toISOString(),
                orderNumber: receipt.orderNumber,
                items: [{
                    dest: receipt.destination,
                    name: receipt.itemName,
                    qty: 1,
                    tableNumber: receipt.tableNumber,
                    clientName: receipt.clientName,
                    itemNote: receipt.itemNote,
                    orderNotes: receipt.orderNotes,
                    takeAway: receipt.takeAway
                }]
            };
            const buffer = await buildKitchenReceipt(order, receipt.destination, order.items);
            await sendToPrinter(printer.destination, printer.ip, printer.port, buffer);
            console.log(`[DISPATCHER] Ricevuta per ordine ${receipt.id} rigenerata e stampata su ${receipt.destination}`);
        } else {
            console.warn(`[DISPATCHER] Stampante ${receipt.destination} non attiva, non posso rigenerare il ticket per ordine ${receipt.id}`);
        }
    } catch (err) {
        console.error(`[DISPATCHER] Errore nella rigenerazione del ticket per ordine ${receipt.id}`);
    }
    // Attendi un breve periodo per evitare sovraccarichi
    // await sleep(1000);
    // Aggiorna lo stato della ricevuta nel database
    await DatabaseController.getInstance().updateReceiptStatus(receipt.id, "PRINTED");
}

/**
 * Aggiorna lo stato di stampa di una ricevuta dato il numero d'ordine.
 * Utile per segnare come PRINTED o FAILED dopo una ristampa.
 */
export async function handleOrderStatusUpdate(orderNumber: number, status: "PRINTED" | "FAILED") {
    console.log(`[DISPATCHER] Aggiornamento stato ordine ${orderNumber} a ${status}`);
    const receipt = await DatabaseController.getInstance().getReceiptById(orderNumber) as { id: number } | null;
    if (receipt) {
        await DatabaseController.getInstance().updateReceiptStatus(receipt.id, status);
    } else {
        console.warn(`[DISPATCHER] Ricevuta non trovata per l'ordine ${orderNumber}`);
    }
}

/**
 * Elimina una ricevuta dal database dato il suo ID.
 */
export async function handleReceiptDeletion(receiptId: string) {
    console.log(`[DISPATCHER] Eliminazione ricevuta ${receiptId}`);
    await DatabaseController.getInstance().deleteReceipt(receiptId);
}

/**
 * Aggiorna le impostazioni di una stampante nel database.
 */
export async function handlePrinterSettingsUpdate(settings: { key: string, printerName: string, printerIp: string, printerPort: number, printerDestinations: string, active: boolean, description: string }) {
    console.log(`[DISPATCHER] Aggiornamento impostazioni stampante ${settings.key}`);
    await DatabaseController.getInstance().savePrinterSettings(settings);
}

/**
 * Recupera le impostazioni di una stampante tramite la sua chiave.
 */
export async function handlePrinterSettingsRetrieval(key: string) {
    console.log(`[DISPATCHER] Recupero impostazioni stampante per ${key}`);
    return DatabaseController.getInstance().getPrinterSettingsByKey(key);
}

export async function handleSyncOrders(syncData: any) {
    console.log("[DISPATCHER] Sincronizzazione ordini in corso...");
    if (!syncData || typeof syncData !== "object") {
        console.warn("[DISPATCHER] Dati di sincronizzazione non validi.");
        return;
    }
    // Esempio: syncData.orders dovrebbe essere un array di ordini
    const orders = syncData;
    if (!Array.isArray(orders) || orders.length === 0) {
        console.log("[DISPATCHER] Nessun ordine da sincronizzare.");
        return;
    }
    console.log(`[DISPATCHER] Trovati ${orders.length} ordini da sincronizzare.`);
    for (const order of orders) {
        // console.log(order)
        console.log(`[DISPATCHER] Sincronizzo ordine ${order.id} con stato ${order.status}`);
        // Logica di sincronizzazione, ad esempio invio a un server esterno
        try {
            // console.log(`[DISPATCHER] Gestisco ordine`, order);
            await handleIncomingData(order);
        } catch (err) {
            console.error(`[DISPATCHER] Errore durante la sincronizzazione dell'ordine ${order.id}:`, err);
        }
    }
    console.log("[DISPATCHER] Sincronizzazione completata.");
}