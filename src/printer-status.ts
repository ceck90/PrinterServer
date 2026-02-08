import type { PrinterStatus, PrinterStatusChangeEvent } from "./types";
import type { PrinterConfig } from "./print-routing.config";
import { HttpServerController } from "./controllers/httpserver.controller";
import * as logger from "./logger";

/**
 * Mappa che mantiene l'ultimo stato conosciuto di ogni stampante
 */
const printerStatusMap = new Map<string, PrinterStatus>();

/**
 * Mappa che traccia se una stampante è attualmente in stampa
 */
const printingMap = new Map<string, boolean>();

/**
 * Comandi ESC/POS per richiedere lo stato in tempo reale
 */
export const ESC_POS_STATUS_COMMANDS = {
    // DLE EOT n - Real-time status transmission
    DLE: 0x10,          // Data Link Escape
    EOT: 0x04,          // End of Transmission
    
    // Parametri per il comando DLE EOT n
    PRINTER_STATUS: 0x01,    // n = 1: Stato generale stampante
    OFFLINE_STATUS: 0x02,    // n = 2: Stato offline
    ERROR_STATUS: 0x03,      // n = 3: Stato errori
    PAPER_STATUS: 0x04,      // n = 4: Stato sensore carta
};

/**
 * Costruisce il comando ESC/POS per richiedere lo stato della stampante
 * @param statusType Tipo di stato da richiedere
 * @returns Buffer con il comando ESC/POS
 */
export function buildStatusCommand(statusType: number): Buffer {
    return Buffer.from([
        ESC_POS_STATUS_COMMANDS.DLE,
        ESC_POS_STATUS_COMMANDS.EOT,
        statusType
    ]);
}

/**
 * Analizza e logga un byte di stato bit per bit
 * @param label Etichetta per il tipo di stato
 * @param statusByte Byte di stato ricevuto
 * @param printerName Nome della stampante per il log
 */
function logStatusByte(label: string, statusByte: number | null, printerName: string): void {
    if (statusByte === null) {
        logger.debug(`[PRINTER-STATUS] ${printerName} - ${label}: NO RESPONSE`);
        return;
    }

    const binary = statusByte.toString(2).padStart(8, '0');
    const hex = '0x' + statusByte.toString(16).toUpperCase().padStart(2, '0');
    
    logger.debug(`[PRINTER-STATUS] ${printerName} - ${label}:`);
    logger.debug(`  Raw: ${statusByte} | Hex: ${hex} | Binary: ${binary}`);
    logger.debug(`  Bit Analysis:`);
    for (let i = 7; i >= 0; i--) {
        const bit = (statusByte >> i) & 1;
        logger.debug(`    Bit ${i}: ${bit}`);
    }
}

/**
 * Interroga lo stato di una stampante ESC/POS
 * @param printer Configurazione della stampante
 * @returns Promise<PrinterStatus> Stato della stampante
 */
export async function queryPrinterStatus(printer: PrinterConfig): Promise<PrinterStatus> {
    const status: PrinterStatus = {
        online: false,
        paperEnd: false,
        paperNearEnd: false,
        coverOpen: false,
        cutterError: false,
        error: false,
        lastCheck: new Date(),
        printing: printingMap.get(printer.name) || false
    };

    try {
        logger.debug(`[PRINTER-STATUS] ==================== Interrogazione ${printer.name} ====================`);
        
        // Interroga tutti i tipi di stato
        const printerStatusByte = await sendStatusQuery(printer, ESC_POS_STATUS_COMMANDS.PRINTER_STATUS);
        logStatusByte("PRINTER_STATUS (DLE EOT 1)", printerStatusByte, printer.name);
        
        const offlineStatusByte = await sendStatusQuery(printer, ESC_POS_STATUS_COMMANDS.OFFLINE_STATUS);
        logStatusByte("OFFLINE_STATUS (DLE EOT 2)", offlineStatusByte, printer.name);
        
        const errorStatusByte = await sendStatusQuery(printer, ESC_POS_STATUS_COMMANDS.ERROR_STATUS);
        logStatusByte("ERROR_STATUS (DLE EOT 3)", errorStatusByte, printer.name);
        
        const paperStatusByte = await sendStatusQuery(printer, ESC_POS_STATUS_COMMANDS.PAPER_STATUS);
        logStatusByte("PAPER_STATUS (DLE EOT 4)", paperStatusByte, printer.name);

        // Analizza i byte di risposta secondo lo standard ESC/POS
        
        // Printer Status (DLE EOT 1)
        // Bit 3: 0=online, 1=offline
        // Bit 5: 1=cover open, 0=cover closed (standard ESC/POS)
        // Bit 6: 1=paper feed button pressed
        if (printerStatusByte !== null) {
            status.online = (printerStatusByte & 0b00001000) === 0; // Bit 3: 0 = online
            const coverOpenBit5 = (printerStatusByte & 0b00100000) !== 0; // Bit 5
            const coverOpenBit6 = (printerStatusByte & 0b01000000) !== 0; // Bit 6 (alcune stampanti)
            status.coverOpen = coverOpenBit5 || coverOpenBit6;
            logger.debug(`[PRINTER-STATUS] ${printer.name} - Decoded PRINTER_STATUS: online=${status.online}, bit5_coverOpen=${coverOpenBit5}, bit6=${coverOpenBit6}`);
        }

        // Offline Status (DLE EOT 2)
        // Bit 2: 1=cover open (standard)
        // Bit 3: 1=paper feed/offline cause
        // Bit 5: 1=cover open (alcune varianti)
        // Bit 6: 1=error occurred
        if (offlineStatusByte !== null) {
            const offlineCause = (offlineStatusByte & 0b00001000) !== 0; // Bit 3
            const coverOpenBit2 = (offlineStatusByte & 0b00000100) !== 0; // Bit 2
            const coverOpenBit5 = (offlineStatusByte & 0b00100000) !== 0; // Bit 5 (alternative)
            const errorOccurred = (offlineStatusByte & 0b01000000) !== 0; // Bit 6
            
            status.online = status.online && !offlineCause && !errorOccurred;
            status.coverOpen = status.coverOpen || coverOpenBit2 || coverOpenBit5;
            
            logger.debug(`[PRINTER-STATUS] ${printer.name} - Decoded OFFLINE_STATUS: offlineCause=${offlineCause}, bit2_coverOpen=${coverOpenBit2}, bit5_coverOpen=${coverOpenBit5}, errorOccurred=${errorOccurred}`);
        }

        // Error Status (DLE EOT 3)
        // Bit 3: 1=cutter error
        // Bit 5: 1=unrecoverable error
        // Bit 6: 1=auto-recoverable error
        if (errorStatusByte !== null) {
            status.cutterError = (errorStatusByte & 0b00001000) !== 0; // Bit 3: errore taglierina
            const unrecoverableError = (errorStatusByte & 0b00100000) !== 0; // Bit 5: errore non recuperabile
            const autoRecoverableError = (errorStatusByte & 0b01000000) !== 0; // Bit 6: errore auto-recuperabile
            status.error = autoRecoverableError || unrecoverableError || status.cutterError;
            logger.debug(`[PRINTER-STATUS] ${printer.name} - Decoded ERROR_STATUS: cutterError=${status.cutterError}, autoRecoverableError=${autoRecoverableError}, unrecoverableError=${unrecoverableError}`);
        }

        // Paper Status (DLE EOT 4)
        // Bit 2,3: Paper roll sensor - 00=present, 01 o 11=paper end
        // Bit 5,6: Paper near-end sensor - 00=not near end, 01 o 11=near end
        // NOTA: Molte stampanti non implementano il sensore near-end o ritornano sempre 0
        if (paperStatusByte !== null) {
            // Check bit 2 e 3 per paper end (se almeno uno è 1, carta finita)
            const paperBits = (paperStatusByte >> 2) & 0b11; // Estrai bit 2-3
            status.paperEnd = paperBits !== 0; // Se 01, 10 o 11 = carta finita
            
            // Check bit 5 e 6 per paper near end (più conservativo)
            // Solo se ENTRAMBI i bit sono 1, consideriamo near end
            const nearEndBits = (paperStatusByte >> 5) & 0b11; // Estrai bit 5-6
            status.paperNearEnd = nearEndBits === 0b11; // Solo se 11 = carta quasi finita
            
            logger.debug(`[PRINTER-STATUS] ${printer.name} - Decoded PAPER_STATUS: paperBits=${paperBits.toString(2).padStart(2,'0')}, nearEndBits=${nearEndBits.toString(2).padStart(2,'0')}, paperEnd=${status.paperEnd}, paperNearEnd=${status.paperNearEnd}`);
        }

        logger.debug(`[PRINTER-STATUS] ${printer.name} - FINAL STATUS: coverOpen=${status.coverOpen}, online=${status.online}, paperEnd=${status.paperEnd}, paperNearEnd=${status.paperNearEnd}`);

        // Costruisce messaggio di errore se necessario
        const errors: string[] = [];
        if (!status.online) errors.push("Stampante offline");
        if (status.paperEnd) errors.push("Carta finita");
        if (status.paperNearEnd) errors.push("Carta quasi finita");
        if (status.coverOpen) errors.push("Coperchio aperto");
        if (status.cutterError) errors.push("Errore taglierina");
        
        if (errors.length > 0) {
            status.errorMessage = errors.join(", ");
        }

        logger.debug(`[PRINTER-STATUS] ${printer.name} - SUMMARY: ${status.online ? 'Online' : 'Offline'}, ${status.error ? 'Errori: ' + status.errorMessage : 'OK'}`);
        logger.debug(`[PRINTER-STATUS] ============================================================`);

    } catch (err) {
        logger.error(`[PRINTER-STATUS] Errore durante l'interrogazione di ${printer.name}:`, err);
        status.online = false;
        status.error = true;
        status.errorMessage = `Errore di connessione: ${err instanceof Error ? err.message : String(err)}`;
    }

    return status;
}

/**
 * Invia una query di stato alla stampante e attende la risposta
 * @param printer Configurazione stampante
 * @param statusType Tipo di stato da richiedere
 * @returns Promise<number | null> Byte di stato ricevuto o null in caso di errore
 */
async function sendStatusQuery(printer: PrinterConfig, statusType: number): Promise<number | null> {
    return new Promise((resolve) => {
        const command = buildStatusCommand(statusType);
        let received = false;
        let responseData: Buffer | null = null;

        logger.debug(`[PRINTER-STATUS] Invio comando a ${printer.name} - Tipo: ${statusType}, Comando: [${Array.from(command).map(b => '0x' + b.toString(16).toUpperCase().padStart(2, '0')).join(', ')}]`);

        const timeout = setTimeout(() => {
            if (!received) {
                logger.warn(`[PRINTER-STATUS] Timeout query stato ${printer.name} (tipo ${statusType})`);
                resolve(null);
            }
        }, 2000); // Timeout di 2 secondi

        try {
            Bun.connect({
                hostname: printer.ip,
                port: printer.port,
                socket: {
                    open(sock) {
                        // Invia comando di richiesta stato
                        sock.write(command);
                        logger.debug(`[PRINTER-STATUS] Comando inviato a ${printer.name}`);
                    },
                    data(sock, data) {
                        // Riceve risposta dalla stampante
                        if (!received) {
                            received = true;
                            responseData = Buffer.from(data);
                            clearTimeout(timeout);
                            
                            // Log dettagliato dei dati ricevuti
                            logger.debug(`[PRINTER-STATUS] Risposta ricevuta da ${printer.name}:`);
                            logger.debug(`  Lunghezza: ${responseData.length} byte(s)`);
                            logger.debug(`  Hex dump: ${Array.from(responseData).map(b => '0x' + b.toString(16).toUpperCase().padStart(2, '0')).join(' ')}`);
                            logger.debug(`  Decimal: ${Array.from(responseData).join(' ')}`);
                            logger.debug(`  Binary: ${Array.from(responseData).map(b => b.toString(2).padStart(8, '0')).join(' ')}`);
                            
                            sock.end();
                            
                            // La risposta è tipicamente un singolo byte
                            if (responseData && responseData.length > 0) {
                                resolve(responseData[0]);
                            } else {
                                logger.warn(`[PRINTER-STATUS] Risposta vuota da ${printer.name}`);
                                resolve(null);
                            }
                        }
                    },
                    error(err) {
                        if (!received) {
                            received = true;
                            clearTimeout(timeout);
                            logger.error(`[PRINTER-STATUS] Errore socket per ${printer.name}:`, err);
                            resolve(null);
                        }
                    },
                    close() {
                        if (!received) {
                            received = true;
                            clearTimeout(timeout);
                            logger.debug(`[PRINTER-STATUS] Connessione chiusa con ${printer.name} (nessun dato ricevuto)`);
                            resolve(null);
                        }
                    }
                }
            }).catch(err => {
                if (!received) {
                    received = true;
                    clearTimeout(timeout);
                    logger.error(`[PRINTER-STATUS] Errore connessione per ${printer.name}:`, err);
                    resolve(null);
                }
            });
        } catch (err) {
            clearTimeout(timeout);
            logger.error(`[PRINTER-STATUS] Eccezione durante query ${printer.name}:`, err);
            resolve(null);
        }
    });
}

/**
 * Controlla lo stato di tutte le stampanti abilitate
 * @param printers Array di configurazioni stampanti
 */
export async function checkAllPrintersStatus(printers: PrinterConfig[]): Promise<void> {
    logger.info("[PRINTER-STATUS] Inizio controllo stato stampanti");
    
    const activePrinters = printers.filter(p => p.active);
    logger.debug(`[PRINTER-STATUS] Stampanti attive da controllare: ${activePrinters.length}`);

    for (const printer of activePrinters) {
        // Salta il controllo se la stampante sta stampando
        const isPrinting = printingMap.get(printer.name);
        if (isPrinting) {
            logger.debug(`[PRINTER-STATUS] ${printer.name} sta stampando, controllo saltato`);
            continue;
        }

        try {
            // Interroga lo stato
            const currentStatus = await queryPrinterStatus(printer);
            
            // Recupera lo stato precedente
            const previousStatus = printerStatusMap.get(printer.name);
            
            // Aggiorna lo stato nella mappa
            printerStatusMap.set(printer.name, currentStatus);

            // Verifica se lo stato è cambiato
            if (hasStatusChanged(previousStatus, currentStatus)) {
                logger.info(`[PRINTER-STATUS] Cambio stato per ${printer.name}`);
                
                // Crea evento di cambio stato
                const event: PrinterStatusChangeEvent = {
                    printerName: printer.name,
                    previousStatus,
                    currentStatus,
                    timestamp: new Date()
                };

                // Invia notifica WebSocket ai client
                await notifyStatusChange(event);
            }

        } catch (err) {
            logger.error(`[PRINTER-STATUS] Errore durante controllo ${printer.name}:`, err);
        }
    }

    logger.info("[PRINTER-STATUS] Controllo completato");
}

/**
 * Verifica se lo stato della stampante è cambiato in modo significativo
 * @param previous Stato precedente
 * @param current Stato corrente
 * @returns true se lo stato è cambiato
 */
function hasStatusChanged(previous: PrinterStatus | undefined, current: PrinterStatus): boolean {
    if (!previous) return true; // Prima volta, consideriamo come cambio

    // Confronta i campi rilevanti
    return previous.online !== current.online ||
           previous.paperEnd !== current.paperEnd ||
           previous.paperNearEnd !== current.paperNearEnd ||
           previous.coverOpen !== current.coverOpen ||
           previous.cutterError !== current.cutterError ||
           previous.error !== current.error;
}

/**
 * Invia notifica WebSocket ai client sul cambio di stato
 * @param event Evento di cambio stato
 */
async function notifyStatusChange(event: PrinterStatusChangeEvent): Promise<void> {
    try {
        const httpServer = HttpServerController.instance;
        
        // Determina il livello di severità
        let severity: 'info' | 'warning' | 'error' = 'info';
        if (event.currentStatus.error || !event.currentStatus.online || event.currentStatus.paperEnd) {
            severity = 'error';
        } else if (event.currentStatus.paperNearEnd || event.currentStatus.coverOpen) {
            severity = 'warning';
        } else if (event.previousStatus?.error && !event.currentStatus.error) {
            severity = 'info'; // Ritorno alla normalità
        }

        // Invia notifica
        httpServer.sendNotification(
            'PRINTER_STATUS_CHANGE',
            {
                printer: event.printerName,
                status: event.currentStatus,
                previousStatus: event.previousStatus,
                message: event.currentStatus.errorMessage || 'Stampante operativa'
            },
            severity
        );

        logger.info(`[PRINTER-STATUS] Notifica inviata per ${event.printerName}: ${severity}`);

    } catch (err) {
        logger.error(`[PRINTER-STATUS] Errore invio notifica:`, err);
    }
}

/**
 * Segna una stampante come "in stampa"
 * @param printerName Nome della stampante
 * @param isPrinting true se sta stampando, false altrimenti
 */
export function setPrinterPrinting(printerName: string, isPrinting: boolean): void {
    printingMap.set(printerName, isPrinting);
    logger.debug(`[PRINTER-STATUS] ${printerName} printing status: ${isPrinting}`);
}

/**
 * Ottiene lo stato corrente di una stampante
 * @param printerName Nome della stampante
 * @returns PrinterStatus | undefined
 */
export function getPrinterStatus(printerName: string): PrinterStatus | undefined {
    return printerStatusMap.get(printerName);
}

/**
 * Ottiene lo stato di tutte le stampanti monitorate
 * @returns Map<string, PrinterStatus>
 */
export function getAllPrinterStatuses(): Map<string, PrinterStatus> {
    return new Map(printerStatusMap);
}
