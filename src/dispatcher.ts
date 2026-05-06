import type { OrderPayload } from "./types";
import { groupBy } from "./utils";
import { buildKitchenTicket, buildKitchenTicket_v2, buildSittingPlaceTicket, buildTestTicket } from "./tickets";
import { sendToPrinter } from "./print";
import { printers } from "./print-routing.config";
import type { PrinterConfig } from "./print-routing.config";
import { DatabaseController } from "./controllers/db.controller";
import { HttpServerController } from "./controllers/httpserver.controller";
import { sleep } from "bun";
import * as logger from "./logger.ts";

// ==================
// Resync su PKMI_UPDATE (debounced)
// ==================

/**
 * Callback registrata dall'esterno (kitchenmgmt.controller) per evitare
 * una dipendenza circolare. Viene invocata con debounce ad ogni PKMI_UPDATE
 * per sincronizzare gli ordini in PROGRESS che potrebbero essere stati persi.
 */
let _resyncCallback: (() => Promise<void>) | null = null;
let _resyncTimer: ReturnType<typeof setTimeout> | null = null;
const RESYNC_DEBOUNCE_MS = 3000; // 3 secondi di debounce per evitare resync troppo frequenti in caso di molti PKMI_UPDATE ravvicinati

/**
 * Registra la funzione di resync chiamata con debounce ad ogni PKMI_UPDATE.
 * Da invocare dopo la connessione WebSocket per evitare dipendenze circolari.
 */
export function setResyncCallback(fn: () => Promise<void>): void {
    _resyncCallback = fn;
}

/**
 * Schedula il resync con debounce: se arrivano più PKMI_UPDATE ravvicinati,
 * il timer viene resettato e il resync viene eseguito una sola volta.
 */
function scheduleResync(): void {
    if (!_resyncCallback) return;
    if (_resyncTimer) clearTimeout(_resyncTimer);
    _resyncTimer = setTimeout(async () => {
        _resyncTimer = null;
        logger.info("[DISPATCHER] Resync debounced su PKMI_UPDATE in corso...");
        try {
            await _resyncCallback!();
        } catch (err) {
            logger.error("[DISPATCHER] Errore durante il resync su PKMI_UPDATE:", err);
        }
    }, RESYNC_DEBOUNCE_MS);
}

// ==================
// Per-printer burst limiter (coda sequenziale)
// ==================

/**
 * Ritardo minimo tra stampe consecutive sulla stessa stampante (ms).
 * Evita di saturare la memoria interna delle stampanti termiche.
 */
const INTER_PRINT_DELAY_MS = 100;

/**
 * Code per stampante: ogni destinazione ha una Promise chain sequenziale,
 * così i job vengono eseguiti uno alla volta e in ordine per ciascuna stampante.
 */
const _printerQueues = new Map<string, Promise<void>>();

/**
 * Accoda un job per la stampante indicata.
 * Il job parte solo quando tutti i job precedenti per quella destinazione
 * sono completati; al termine attende INTER_PRINT_DELAY_MS prima di
 * sbloccare il prossimo, lasciando tempo alla stampante di svuotare il buffer.
 * La coda non si interrompe mai: un eventuale errore nel job viene gestito
 * internamente e la chain prosegue normalmente.
 */
function enqueuePrinterJob(destination: string, job: () => Promise<void>): Promise<void> {
    const prev = _printerQueues.get(destination) ?? Promise.resolve();
    // Il job gestisce i propri errori internamente, quindi next non rigetta mai.
    const next = prev.then(async () => {
        await job();
        await sleep(INTER_PRINT_DELAY_MS);
    });
    // Salva la chain senza il .catch in modo che eventuali errori imprevisti
    // non rompano la coda delle chiamate successive.
    _printerQueues.set(destination, next.catch(() => sleep(INTER_PRINT_DELAY_MS)));
    return next;
}

export async function handleSingleOrderData(data: any) {
    // console.log("[DISPATCHER] Dati ricevuti:", data);
    if (Array.isArray(data)) {
        for (const item of data) {
            // console.log("[DISPATCHER] Gestisco il sync di:", item.id);
            const _itemId = String(item.id);

            // Persiste la plate originale degli ordini TODO nel DB al primo avvistamento
            // (sync iniziale o PKMI_ADD). Il DB sopravvive a crash e reboot: anche dopo
            // un riavvio il resync troverà la plate corretta e stamperà sulla stampante giusta.
            if (item.status === "TODO" && item.plate?.name) {
                DatabaseController.getInstance().saveTodoPlate(_itemId, item.plate.name);
            }

            // Per ordini PROGRESS: se la plate è cambiata rispetto a quella originale
            // (memorizzata nel DB al momento della creazione TODO), usa la plate originale
            // per garantire la stampa sulla stampante corretta anche dopo un reboot.
            let _dest = item.plate?.name || "";
            if (item.status === "PROGRESS") {
                const _originalPlate = DatabaseController.getInstance().getTodoPlate(_itemId);
                if (_originalPlate && _originalPlate !== _dest) {
                    logger.info(`[DISPATCHER] Resync ordine ${_itemId}: plate variata da "${_originalPlate}" a "${_dest}", stampo su plate originale`);
                    _dest = _originalPlate;
                }
            }

            const order: OrderPayload = {
                id: item.id,
                orderId: item.id,
                status: item.status,
                createdAt: item.menuItem.createdDate || new Date().toISOString(),
                timestamp: new Date().toISOString(),
                orderNumber: item.orderNumber || 0,
                items: [{
                    dest: _dest,
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
    // Ignora tipi di messaggio non gestiti
    if (data.type != "PKMI_UPDATE" && data.type != "PKMI_ADD_ALL" && data.type != "PKMI_ADD") {
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

    // Schedula un resync per catturare eventuali ordini PROGRESS mancati
    if (data.type === "PKMI_UPDATE" && (data.plateKitchenMenuItem.status === "PROGRESS" || data.plateKitchenMenuItem.status === "DONE")) {
        scheduleResync();
    }

    // Gestione degli stati dell'ordine
    switch (data.plateKitchenMenuItem.status) {
        case "TODO":
        case "PROGRESS":
            // Se manca la destinazione, ignora l'ordine
            if (data.plateKitchenMenuItem.plate == null) {
                console.warn("[DISPATCHER] Ordine in lavorazione senza destinazione:", data.plateKitchenMenuItem);
                return;
            }
            // Persiste la plate originale degli ordini TODO nel DB: se successivamente
            // la plate cambia durante la transizione TODO → PROGRESS, il DB
            // garantisce la stampa sulla stampante corretta anche dopo un reboot.
            if (data.plateKitchenMenuItem.status === "TODO") {
                DatabaseController.getInstance().saveTodoPlate(
                    String(data.plateKitchenMenuItem.id),
                    data.plateKitchenMenuItem.plate.name
                );
            }
            break;
        case "DONE":
            console.log(`[DISPATCHER] Ordine completato: ${data.plateKitchenMenuItem.orderNumber} - ${data.plateKitchenMenuItem.plate?.name}/${data.plateKitchenMenuItem.menuItem.name}`);
            return;
        case "CANCELLED":
            // Logga gli ordini completati o cancellati e ignora
            console.log(`[DISPATCHER] Ordine cancellato: ${data.plateKitchenMenuItem.orderNumber} - ${data.plateKitchenMenuItem.plate?.name}/${data.plateKitchenMenuItem.menuItem.name}`);
            return;
    }

    // Risolve la plate considerando possibili variazioni durante la transizione TODO → PROGRESS.
    // Se la plate è cambiata rispetto a quella memorizzata in cache (avvistamento TODO),
    // usa la plate originale per stampare sulla stampante corretta.
    const _resolvedPlateName = (() => {
        if (data.plateKitchenMenuItem.status !== "PROGRESS") {
            return data.plateKitchenMenuItem.plate.name;
        }
        const _originalPlate = DatabaseController.getInstance().getTodoPlate(String(data.plateKitchenMenuItem.id));
        if (_originalPlate && _originalPlate !== data.plateKitchenMenuItem.plate.name) {
            logger.info(`[DISPATCHER] Ordine ${data.plateKitchenMenuItem.id}: plate variata da "${_originalPlate}" a "${data.plateKitchenMenuItem.plate.name}", stampo su plate originale`);
            return _originalPlate;
        }
        return data.plateKitchenMenuItem.plate.name;
    })();

    console.log(`[DISPATCHER] Gestisco ordine ${data.plateKitchenMenuItem.orderNumber} - ${_resolvedPlateName}/${data.plateKitchenMenuItem.menuItem.name} con stato: ${data.plateKitchenMenuItem.status}`);

    // Costruisce l'oggetto ordine da processare
    const order: OrderPayload = {
        id: data.plateKitchenMenuItem.id,
        orderId: data.plateKitchenMenuItem.id,
        status: data.plateKitchenMenuItem.status,
        createdAt: data.plateKitchenMenuItem.menuItem.createdDate || new Date().toISOString(),
        timestamp: new Date().toISOString(),
        orderNumber: data.plateKitchenMenuItem.orderNumber || 0,
        items: [{
            dest: _resolvedPlateName,
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
    // Invia notifica WebSocket ai client connessi per aggiornare la lista dei ticket
    HttpServerController.instance.sendNotification(
        'NEW_TICKETS',
        {
            orderId: order.orderId,
            orderNumber: order.orderNumber,
            orderStatus: order.status,
            timestamp: order.timestamp
        },
        'info'
    );

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
            console.warn(`[DISPATCHER] Ordine ${order.id} con stato ${order.status} non gestito per la destinazione: ${dest}`);
            continue;
        }

        // console.log(`[DISPATCHER] Gestione ordine: ${order.id} con stato: ${order.status} su ${dest}`);

        // Accoda il job per questa stampante: esecuzione sequenziale con delay
        // tra stampe consecutive per evitare saturazione della memoria della stampante.
        await enqueuePrinterJob(dest, async () => {
            // Verifica se l'ordine è già registrato nel DB (dentro la coda per evitare race condition)
            const existingReceipt = await DatabaseController.getInstance().getReceiptByIdAndStatus(order.orderId, order.status);
            if (existingReceipt) {
                logger.debug(`[DISPATCHER] Ordine ${order.id} già registrato per la destinazione ${dest}, salto la stampa.`);
                return;
            }

            logger.info(`[DISPATCHER] Stampa ordine ${order.id} su ${dest} (${printer.name})`);

            try {
                // Costruisce il buffer di stampa (es. ESC/POS)
                const buffer = await buildKitchenTicket_v2(order, dest, items, printer.upsideDown, printer.beepEnable);

                // Se la stampante è attiva, invia i dati
                if (printer.active) {
                    logger.info(`[DISPATCHER] Invio a stampante ${printer.destination} (${printer.ip}:${printer.port})`);
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

                // Invia notifica WebSocket ai client connessi
                if (printer.active) {
                    HttpServerController.instance.sendNotification(
                        'RECEIPT_PRINTED',
                        {
                            receiptId: order.id,
                            orderId: order.orderId,
                            orderNumber: order.orderNumber,
                            printerName: printer.name,
                            destination: dest,
                            itemName: order.items[0].name,
                            tableNumber: order.items[0].tableNumber,
                            clientName: order.items[0].clientName,
                            takeAway: order.items[0].takeAway
                        },
                        'success'
                    );
                }
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

                // Invia notifica WebSocket di errore
                HttpServerController.instance.sendNotification(
                    'RECEIPT_PRINT_FAILED',
                    {
                        receiptId: order.id,
                        orderId: order.orderId,
                        orderNumber: order.orderNumber,
                        printerName: printer.name,
                        destination: dest,
                        error: err instanceof Error ? err.message : String(err),
                        itemName: order.items[0].name,
                        tableNumber: order.items[0].tableNumber,
                        clientName: order.items[0].clientName
                    },
                    'error'
                );
            }
        });
    }

    // Rimuove dal DB la plate originale: l'ordine è stato processato
    // (stampato o scartato per idempotency). Pulizia necessaria per evitare
    // che la tabella cresca indefinitamente a ogni evento di festival.
    DatabaseController.getInstance().deleteTodoPlate(order.orderId);
}

export async function handleIncomingOrderFromGSG(order: any) {
    const printer = printers.find(p => p.destination === "COPERTI" || p.name === "COPERTI");
    if (!printer) {
        logger.warn(`[DISPATCHER] Nessuna stampante configurata per la destinazione: COPERTI`);
        return;
    }

    if (order != null && order != undefined) {

        // Invia notifica WebSocket ai client connessi per aggiornare la lista dei ticket
        HttpServerController.instance.sendNotification(
            'NEW_TICKETS',
            {
                orderId: order.id,
                orderNumber: order.numeroOrdine || order.id,
                tableNumber: order.numeroTavolo,
                clientName: order.cliente,
                timestamp: new Date().toISOString()
            },
            'info'
        );

        // Se la stampante è attiva, invia i dati
        if (printer.active) {
            const buffer = await buildSittingPlaceTicket(order.id, order.numeroTavolo, order.cliente, order.coperti, order.cassiere, false, false);
            logger.info(`[DISPATCHER] Stampa coperti GSG ordine ${order.id} su ${printer.destination}`);
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
        logger.warn(`[DISPATCHER] Nessuna ticket trovato per ordine ${orderNumber}`);
        return;
    }
    const printer = printers.find(p => p.destination === receipt.destination || p.name === receipt.destination);
    if (!printer) {
        logger.warn(`[DISPATCHER] Nessuna stampante configurata per la destinazione: ${receipt.destination}`);
        return;
    }
    try {
        logger.info(`[DISPATCHER] Ristampa ticket ordine ${receipt.id} su ${receipt.destination}`);
        if (printer.active) {
            await sendToPrinter(printer.destination, printer.ip, printer.port, receipt.printData);
            await DatabaseController.getInstance().updateReceiptReprint(receipt.id, "PRINTED");
            logger.info(`[DISPATCHER] Ticket ordine ${receipt.id} ristampata`);
        } else {
            logger.warn(`[DISPATCHER] Stampante ${receipt.destination} non attiva`);
            await DatabaseController.getInstance().updateReceiptReprint(receipt.id, "FAILED");
        }
    } catch (err) {
        logger.error(`[DISPATCHER] Errore nella ristampa del ticket per ordine ${receipt.id}`);
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
        logger.warn(`[DISPATCHER] Nessuna ticket trovata per ordine ${orderNumber}`);
        return;
    }
    
    // Usa la destinazione specificata o quella originale del receipt
    const targetDestination = destination || receipt.destination;
    const printer = printers.find(p => p.destination === targetDestination || p.name === targetDestination);
    if (!printer) {
        logger.warn(`[DISPATCHER] Nessuna stampante configurata per la destinazione: ${targetDestination}`);
        return;
    }
    try {
        logger.info(`[DISPATCHER] Rigenero ticket ordine ${receipt.id} su ${targetDestination}`);
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
                    dest: targetDestination,
                    name: receipt.itemName,
                    qty: 1,
                    tableNumber: receipt.tableNumber,
                    clientName: receipt.clientName,
                    itemNote: receipt.itemNote,
                    orderNotes: receipt.orderNotes,
                    takeAway: receipt.takeAway
                }]
            };
            const buffer = await buildKitchenTicket_v2(order, targetDestination, order.items, printer.upsideDown, printer.beepEnable);
            await sendToPrinter(targetDestination, printer.ip, printer.port, buffer);
            logger.info(`[DISPATCHER] Ticket ordine ${receipt.id} rigenerata e stampata`);
        } else {
            logger.warn(`[DISPATCHER] Stampante ${targetDestination} non attiva`);
        }
    } catch (err) {
        logger.error(`[DISPATCHER] Errore nella rigenerazione del ticket per ordine ${receipt.id}`);
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
        logger.warn(`[DISPATCHER] Nessuna stampante configurata per la destinazione: ${printerName}`);
        return;
    }
    try {
        logger.info(`[DISPATCHER] Stampo ticket di test su ${printer.destination}`);
        if (printer.active) {
            const buffer = await buildTestTicket(printer.name, printer.ip, printer.upsideDown, printer.beepEnable);
            await sendToPrinter(printer.destination, printer.ip, printer.port, buffer);
            logger.info(`[DISPATCHER] Ticket di test stampata`);
        } else {
            logger.warn(`[DISPATCHER] Stampante ${printer.destination} non attiva`);
        }
    } catch (err) {
        logger.error(`[DISPATCHER] Errore nella stampa del ticket di test:`, err);
    }
}

/**
 * Aggiorna lo stato di stampa di una ticket dato il numero d'ordine.
 * Utile per segnare come PRINTED o FAILED dopo una ristampa.
 * @param orderNumber Numero d'ordine della ticket
 * @param status Nuovo stato di stampa ("PRINTED" | "FAILED")
 */
export async function handleOrderStatusUpdate(orderNumber: number, status: "PRINTED" | "FAILED") {
    logger.debug(`[DISPATCHER] Aggiornamento stato ordine ${orderNumber} a ${status}`);
    const receipt = await DatabaseController.getInstance().getReceiptById(orderNumber) as { id: number } | null;
    if (receipt) {
        await DatabaseController.getInstance().updateReceiptStatus(receipt.id, status);
    } else {
        logger.warn(`[DISPATCHER] Ticket non trovata per l'ordine ${orderNumber}`);
    }
}

/**
 * Elimina una ticket dal database dato il suo ID.
 * @param receiptId ID della ticket da eliminare
 */
export async function handleReceiptDeletion(receiptId: string) {
    logger.debug(`[DISPATCHER] Eliminazione ticket ${receiptId}`);
    await DatabaseController.getInstance().deleteReceipt(receiptId);
}

/**
 * Aggiorna le impostazioni di una stampante nel database.
 * @param settings Oggetto con le nuove impostazioni della stampante
 */
export async function handlePrinterSettingsUpdate(settings: { key: string, printerName: string, printerIp: string, printerPort: number, printerDestinations: string, active: boolean, upsideDown: boolean, beepEnable: boolean, description: string }) {
    logger.debug(`[DISPATCHER] Aggiornamento impostazioni stampante ${settings.key}`);
    await DatabaseController.getInstance().savePrinterSettings(settings);
}

/**
 * Recupera le impostazioni di una stampante tramite la sua chiave.
 * @param key Chiave identificativa della stampante
 * @returns Impostazioni della stampante
 */
export async function handlePrinterSettingsRetrieval(key: string) {
    logger.debug(`[DISPATCHER] Recupero impostazioni stampante per ${key}`);
    return DatabaseController.getInstance().getPrinterSettingsByKey(key);
}

/**
 * Gestisce la sincronizzazione di ordini ricevuti da una fonte esterna.
 * Esegue la logica di sincronizzazione per ogni ordine presente nei dati.
 * @param syncData Dati di sincronizzazione (array di ordini)
 */
export async function handleSyncOrders(syncData: any) {
    logger.info("[DISPATCHER] Sincronizzazione ordini in corso...");
    if (!syncData || typeof syncData !== "object") {
        logger.warn("[DISPATCHER] Dati di sincronizzazione non validi.");
        return;
    }
    // Esempio: syncData.orders dovrebbe essere un array di ordini
    const orders = syncData;
    if (!Array.isArray(orders) || orders.length === 0) {
        logger.info("[DISPATCHER] Nessun ordine da sincronizzare.");
        return;
    }
    logger.info(`[DISPATCHER] Trovati ${orders.length} ordini da sincronizzare.`);
    for (const order of orders) {
        logger.debug(`[DISPATCHER] Sincronizzo ordine ${order.id} con stato ${order.status}`);
        // Logica di sincronizzazione, ad esempio invio a un server esterno
        try {
            await handleIncomingData(order);
        } catch (err) {
            logger.error(`[DISPATCHER] Errore durante la sincronizzazione dell'ordine ${order.id}:`, err);
        }
    }
    logger.info("[DISPATCHER] Sincronizzazione completata.");
}