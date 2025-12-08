import type { OrderPayload } from "./types";
import { groupBy } from "./utils";
import { buildKitchenTicket, buildKitchenTicket_v2, buildSittingPlaceTicket, buildTestTicket } from "./tickets";
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
    if (data.type != "PKMI_UPDATE" && data.type != "PKMI_ADD_ALL") {
        console.warn("[DISPATCHER] Tipo di dato non gestito:", data.type);
        return;
    }

    // console.log(data);

    // Controlla la presenza dei dati minimi necessari
    if (!data || !data.plateKitchenMenuItem || !data.plateKitchenMenuItem.menuItem) {
        return;
    }

    // console.log(data);

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
            const buffer = await buildKitchenTicket_v2(order, dest, items, printer.upsideDown, printer.beepEnable);

            // Se la stampante è attiva, invia i dati
            if (printer.active) {
                console.log(`[DISPATCHER] Stampa ordine ${order.id} a ${printer.destination} (${printer.ip}:${printer.port})`);
                await sendToPrinter(printer.destination, printer.ip, printer.port, buffer);
            }

            // Salva la ticket nel database (stato PRINTED o FAILED)
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
            // In caso di errore di stampa, salva comunque la ticket come FAILED
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

export async function handleIncomingOrderFromGSG(order: any) {
    const printer = printers.find(p => p.destination === "COPERTI" || p.name === "COPERTI");
    if (!printer) {
        console.warn(`[DISPATCHER] Nessuna stampante configurata per la destinazione: COPERTI`);
        return;
    }

    if (order != null && order != undefined) {
        //console.log("[DISPATCHER] Nuovo ordine GSG ricevuto:", order);
        //console.log("[DISPATCHER] Nuovo ordine ID:", order.id);
        //console.log("[DISPATCHER] Coperti:", order.coperti);
        //console.log("[DISPATCHER] Numero Tavolo:", order.numeroTavolo);
        //console.log("[DISPATCHER] Cliente:", order.cliente);
        //console.log("[DISPATCHER] Timestamp:", order.ora);
        //console.log("[DISPATCHER] Cassiere:", order.cassiere);

        // Costruisce il ticket di coperti

        // Se la stampante è attiva, invia i dati
        if (printer.active) {
            const buffer = await buildSittingPlaceTicket(order.id, order.numeroTavolo, order.cliente, order.coperti, order.cassiere, false, false);
            console.log(`[DISPATCHER] Stampa ordine GSG ${order.id} a ${printer.destination} (${printer.ip}:${printer.port})`);
            await sendToPrinter(printer.destination, printer.ip, printer.port, buffer);
        }
    }
}

/**
 * Ristampa una ticket specifica dato il numero d'ordine.
 * Cerca la ticket e la stampante, invia i dati e aggiorna lo stato nel DB.
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
            console.log(`[DISPATCHER] ticket per ordine ${receipt.id} ristampata su ${receipt.destination}`);
        } else {
            console.warn(`[DISPATCHER] Stampante ${receipt.destination} non attiva, non posso ristampare il ticket per ordine ${receipt.id}`);
            await DatabaseController.getInstance().updateReceiptReprint(receipt.id, "FAILED");
        }
    } catch (err) {
        console.error(`[DISPATCHER] Errore nella ristampa del ticket per ordine ${receipt.id}`);
        await DatabaseController.getInstance().updateReceiptStatus(receipt.id, "FAILED");
    }
}

export async function regenerateSpecificReceipt(orderNumber: number, destination?: string) {
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

    // console.log(`[DISPATCHER] Rigenerazione ticket per ordine`, receipt);
    if (!receipt) {
        console.warn(`[DISPATCHER] Nessuna ticket trovata per ordine ${orderNumber}`);
        return;
    }
    const printer = printers.find(p => p.destination === receipt.destination || p.name === receipt.destination);
    if (!printer) {
        console.warn(`[DISPATCHER] Nessuna stampante configurata per la destinazione: ${destination ? destination : receipt.destination}`);
        return;
    }
    try {
        console.log(`[DISPATCHER] Rigenero ticket per ordine ${receipt.id} su ${destination ? destination : receipt.destination}`);
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
                    dest: destination ? destination : receipt.destination,
                    name: receipt.itemName,
                    qty: 1,
                    tableNumber: receipt.tableNumber,
                    clientName: receipt.clientName,
                    itemNote: receipt.itemNote,
                    orderNotes: receipt.orderNotes,
                    takeAway: receipt.takeAway
                }]
            };
            // console.log(`[DISPATCHER] Rigenero il ticket per ordine ${receipt.id} con dati:`, order);
            const buffer = await buildKitchenTicket_v2(order, destination ? destination : receipt.destination, order.items, printer.upsideDown, printer.beepEnable);
            await sendToPrinter(destination ? destination : receipt.destination, printer.ip, printer.port, buffer);
            console.log(`[DISPATCHER] ticket per ordine ${receipt.id} rigenerata e stampata su ${destination ? destination : receipt.destination}`);
        } else {
            console.warn(`[DISPATCHER] Stampante ${destination ? destination : receipt.destination} non attiva, non posso rigenerare il ticket per ordine ${receipt.id}`);
        }
    } catch (err) {
        console.error(`[DISPATCHER] Errore nella rigenerazione del ticket per ordine ${receipt.id}`);
    }
    // Attendi un breve periodo per evitare sovraccarichi
    // await sleep(1000);
    // Aggiorna lo stato della ticket nel database
    await DatabaseController.getInstance().updateReceiptStatus(receipt.id, "PRINTED");
}

/**
 * Gestisce la stampa di un ticket di test su una stampante specifica.
 * Cerca la stampante per nome/destinazione, costruisce il buffer di test e lo invia.
 * @param printerName Nome o destinazione della stampante
 */
export async function printTestTicket(printerName: string) {

    const printer = printers.find(p => p.destination === printerName || p.name === printerName);
    if (!printer) {
        console.warn(`[DISPATCHER] Nessuna stampante configurata per la destinazione: ${printerName}`);
        return;
    }
    try {
        console.log(`[DISPATCHER] Stampo ticket di test su ${printer.destination}`);
        if (printer.active) {
            const buffer = await buildTestTicket(printer.name, printer.ip, printer.upsideDown, printer.beepEnable);
            await sendToPrinter(printer.destination, printer.ip, printer.port, buffer);
            console.log(`[DISPATCHER] ticket di test stampata su ${printer.destination}`);
        } else {
            console.warn(`[DISPATCHER] Stampante ${printer.destination} non attiva, non posso stampare il ticket di test`);
        }
    } catch (err) {
        console.error(`[DISPATCHER] Errore nella stampa del ticket di test:`, err);
    }
}

/**
 * Aggiorna lo stato di stampa di una ticket dato il numero d'ordine.
 * Utile per segnare come PRINTED o FAILED dopo una ristampa.
 * @param orderNumber Numero d'ordine della ticket
 * @param status Nuovo stato di stampa ("PRINTED" | "FAILED")
 */
export async function handleOrderStatusUpdate(orderNumber: number, status: "PRINTED" | "FAILED") {
    console.log(`[DISPATCHER] Aggiornamento stato ordine ${orderNumber} a ${status}`);
    const receipt = await DatabaseController.getInstance().getReceiptById(orderNumber) as { id: number } | null;
    if (receipt) {
        await DatabaseController.getInstance().updateReceiptStatus(receipt.id, status);
    } else {
        console.warn(`[DISPATCHER] ticket non trovata per l'ordine ${orderNumber}`);
    }
}

/**
 * Elimina una ticket dal database dato il suo ID.
 * @param receiptId ID della ticket da eliminare
 */
export async function handleReceiptDeletion(receiptId: string) {
    console.log(`[DISPATCHER] Eliminazione ticket ${receiptId}`);
    await DatabaseController.getInstance().deleteReceipt(receiptId);
}

/**
 * Aggiorna le impostazioni di una stampante nel database.
 * @param settings Oggetto con le nuove impostazioni della stampante
 */
export async function handlePrinterSettingsUpdate(settings: { key: string, printerName: string, printerIp: string, printerPort: number, printerDestinations: string, active: boolean, upsideDown: boolean, beepEnable: boolean, description: string }) {
    console.log(`[DISPATCHER] Aggiornamento impostazioni stampante ${settings.key}`);
    await DatabaseController.getInstance().savePrinterSettings(settings);
}

/**
 * Recupera le impostazioni di una stampante tramite la sua chiave.
 * @param key Chiave identificativa della stampante
 * @returns Impostazioni della stampante
 */
export async function handlePrinterSettingsRetrieval(key: string) {
    console.log(`[DISPATCHER] Recupero impostazioni stampante per ${key}`);
    return DatabaseController.getInstance().getPrinterSettingsByKey(key);
}

/**
 * Gestisce la sincronizzazione di ordini ricevuti da una fonte esterna.
 * Esegue la logica di sincronizzazione per ogni ordine presente nei dati.
 * @param syncData Dati di sincronizzazione (array di ordini)
 */
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