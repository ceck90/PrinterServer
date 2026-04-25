/**
 * Gestione stato stampanti termiche ESC/POS
 * 
 * TESTATO E OTTIMIZZATO PER: Stampanti termiche cinesi 80-VI-UL (80mm)
 * 
 * Mappatura bit verificata con test reali (15/02/2026):
 * 
 * IMPORTANTE - Limitazioni hardware 80-VI-UL:
 * - Cover aperto: NON rilevabile via ESC/POS (LED si accende ma nessun bit cambia)
 * - Offline vero: Solo quando NON risponde alle query TCP (timeout)
 * - Bit3 di DLE EOT 1: Indica "errore carta" non offline reale
 * - Carta quasi finita: DLE EOT 4, Bit5-6 (11=near-end)
 * 
 * NOTA: Queste stampanti cinesi hanno segnalazione limitata rispetto allo standard Epson.
 * Il LED errore è puramente locale e non comunicato via rete.
 */

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
    // DLE EOT n - Real-time status transmission (standard ESC/POS)
    DLE: 0x10,          // Data Link Escape
    EOT: 0x04,          // End of Transmission
    
    // Parametri per il comando DLE EOT n
    PRINTER_STATUS: 0x01,    // n = 1: Stato generale stampante
    OFFLINE_STATUS: 0x02,    // n = 2: Stato offline
    ERROR_STATUS: 0x03,      // n = 3: Stato errori
    PAPER_STATUS: 0x04,      // n = 4: Stato sensore carta
    
    // GS a n - Alternative status command (molte stampanti cinesi lo supportano meglio)
    GS: 0x1D,                // Group Separator
    STATUS_CMD: 0x61,        // 'a' per status automatico
    FULL_STATUS: 0x00,       // n = 0: stato completo
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
 * Costruisce il comando alternativo GS a per stampanti cinesi
 * @returns Buffer con il comando GS a
 */
export function buildAlternativeStatusCommand(): Buffer {
    return Buffer.from([
        ESC_POS_STATUS_COMMANDS.GS,
        ESC_POS_STATUS_COMMANDS.STATUS_CMD,
        ESC_POS_STATUS_COMMANDS.FULL_STATUS
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
        logger.debug(`[PRINTER-STATUS] ============================================================`);
        logger.debug(`[PRINTER-STATUS] Checking status for printer: ${printer.name} (${printer.ip}:${printer.port})`);
        
        // Prova prima con comandi DLE EOT standard
        let printerStatusByte = await sendStatusQuery(printer, ESC_POS_STATUS_COMMANDS.PRINTER_STATUS);
        let offlineStatusByte = await sendStatusQuery(printer, ESC_POS_STATUS_COMMANDS.OFFLINE_STATUS);
        let errorStatusByte = await sendStatusQuery(printer, ESC_POS_STATUS_COMMANDS.ERROR_STATUS);
        let paperStatusByte = await sendStatusQuery(printer, ESC_POS_STATUS_COMMANDS.PAPER_STATUS);
        
        // Se tutti i comandi standard falliscono, prova comando alternativo GS a (per stampanti cinesi)
        const allResponsesNull = printerStatusByte === null && offlineStatusByte === null && 
                                 errorStatusByte === null && paperStatusByte === null;
        
        if (allResponsesNull) {
            logger.warn(`[PRINTER-STATUS] ${printer.name} - Nessuna risposta ai comandi DLE EOT standard, provo comandi alternativi GS a`);
            const alternativeStatus = await sendAlternativeStatusQuery(printer);
            if (alternativeStatus !== null) {
                // Interpreta la risposta alternativa (formato diverso, dipende dal produttore)
                printerStatusByte = alternativeStatus;
                logger.info(`[PRINTER-STATUS] ${printer.name} - Risposta ricevuta da comando alternativo GS a`);
            }
        }
        
        // logStatusByte("PRINTER_STATUS (DLE EOT 1)", printerStatusByte, printer.name);
        // logStatusByte("OFFLINE_STATUS (DLE EOT 2)", offlineStatusByte, printer.name);
        // logStatusByte("ERROR_STATUS (DLE EOT 3)", errorStatusByte, printer.name);
        // logStatusByte("PAPER_STATUS (DLE EOT 4)", paperStatusByte, printer.name);

        // Se non abbiamo ricevuto alcuna risposta, la stampante è VERAMENTE offline (timeout TCP)
        // Questo è l'UNICO modo affidabile per rilevare offline su 80-VI-UL
        if (allResponsesNull && printerStatusByte === null) {
            logger.warn(`[PRINTER-STATUS] ${printer.name} - TIMEOUT: Nessuna risposta TCP, stampante offline o spenta`);
            status.online = false;
            status.error = true;
            status.errorMessage = "Stampante non risponde (timeout connessione)";
            return status;
        }

        // Analizza i byte di risposta basandosi su test reali con stampanti cinesi 80-VI-UL
        // I bit possono variare rispetto allo standard Epson ESC/POS
        
        // Se arriviamo qui, la stampante HA RISPOSTO via TCP quindi è online dal punto di vista rete
        status.online = true;
        
        // Printer Status (DLE EOT 1)
        // Bit 3: Su 80-VI-UL NON indica offline TCP, ma "errore carta mancante"
        // Se Bit3=1 con risposta TCP valida = carta finita/problema carta
        if (printerStatusByte !== null) {
            const bit3 = (printerStatusByte & 0b00001000) !== 0;
            if (bit3) {
                // Bit3=1 indica problema carta (verificato: succede quando togli carta)
                logger.debug(`[PRINTER-STATUS] ${printer.name} - Bit3=1: Probabile carta finita`);
            }
            // logger.debug(`[PRINTER-STATUS] ${printer.name} - PRINTER_STATUS: byte=0x${printerStatusByte.toString(16).toUpperCase()}, bit3=${bit3}`);
        }

        // Offline Status (DLE EOT 2)
        // NOTA 80-VI-UL: Questo byte NON è affidabile per rilevare cover/errori
        // Test reali mostrano che il LED errore si accende ma i bit non cambiano
        // Lo leggiamo solo per debug/log
        if (offlineStatusByte !== null) {
            // logger.debug(`[PRINTER-STATUS] ${printer.name} - OFFLINE_STATUS: byte=0x${offlineStatusByte.toString(16).toUpperCase()}`);
        }
        
        // Cover open: NON RILEVABILE via ESC/POS su 80-VI-UL
        // Il LED si accende ma nessun bit cambia nelle risposte ESC/POS
        status.coverOpen = false; // Non possiamo saperlo via software

        // Error Status (DLE EOT 3)
        // Su 80-VI-UL questo byte è sempre 0x12 (00010010) in tutti i test
        // Non sembra riportare errori reali, lo leggiamo solo per completezza
        if (errorStatusByte !== null) {
            const cutterError = (errorStatusByte & 0b00001000) !== 0;
            const unrecoverableError = (errorStatusByte & 0b00100000) !== 0;
            const autoRecoverableError = (errorStatusByte & 0b01000000) !== 0;
            
            if (cutterError || unrecoverableError || autoRecoverableError) {
                status.cutterError = cutterError;
                status.error = true;
                // logger.warn(`[PRINTER-STATUS] ${printer.name} - ERROR_STATUS riporta errori (raro su 80-VI-UL)`);
            }
            
            // logger.debug(`[PRINTER-STATUS] ${printer.name} - ERROR_STATUS: byte=0x${errorStatusByte.toString(16).toUpperCase()}`);
        }

        // Paper Status (DLE EOT 4)
        // Per stampanti cinesi 80-VI-UL (verificato con test reali):
        // Tutto OK: 0x12 (00010010) - Bit2-3=00, Bit5-6=00
        // Problemi: 0x72 (01110010) - Bit5-6=11 (near-end)
        // Bit 5,6: Paper near-end sensor - 11=carta quasi finita (AFFIDABILE)
        // Bit 2,3: Paper roll sensor - Su 80-VI-UL non cambia in modo affidabile
        if (paperStatusByte !== null) {
            // Check bit 5 e 6 per paper near end (QUESTO FUNZIONA)
            const nearEndBits = (paperStatusByte >> 5) & 0b11;
            status.paperNearEnd = nearEndBits === 0b11; // 11 = carta quasi finita
            
            // Paper end: usa Bit3 di DLE EOT 1 come indicatore principale
            // Quando la carta finisce, Bit3=1 (verificato nei test)
            if (printerStatusByte !== null) {
                const bit3 = (printerStatusByte & 0b00001000) !== 0;
                if (bit3) {
                    status.paperEnd = true;
                    logger.debug(`[PRINTER-STATUS] ${printer.name} - Carta finita rilevata (Bit3=1 in DLE EOT 1)`);
                }
            }
            
            // logger.debug(`[PRINTER-STATUS] ${printer.name} - PAPER_STATUS: byte=0x${paperStatusByte.toString(16).toUpperCase()}, nearEndBits=${nearEndBits.toString(2).padStart(2,'0')}, paperEnd=${status.paperEnd}, paperNearEnd=${status.paperNearEnd}`);
        }

        // logger.debug(`[PRINTER-STATUS] ${printer.name} - FINAL STATUS: online=${status.online}, paperEnd=${status.paperEnd}, paperNearEnd=${status.paperNearEnd}`);

        // Costruisce messaggio di errore se necessario
        const errors: string[] = [];
        if (!status.online) errors.push("Stampante offline (timeout TCP)");
        if (status.paperEnd) errors.push("Carta finita");
        if (status.paperNearEnd) errors.push("Carta quasi finita");
        if (status.cutterError) errors.push("Errore taglierina");
        // Cover open NON è rilevabile su 80-VI-UL
        
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

        // logger.debug(`[PRINTER-STATUS] Invio comando a ${printer.name} - Tipo: ${statusType}, Comando: [${Array.from(command).map(b => '0x' + b.toString(16).toUpperCase().padStart(2, '0')).join(', ')}]`);

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
                        // logger.debug(`[PRINTER-STATUS] Comando inviato a ${printer.name}`);
                    },
                    data(sock, data) {
                        // Riceve risposta dalla stampante
                        if (!received) {
                            received = true;
                            responseData = Buffer.from(data);
                            clearTimeout(timeout);
                            
                            // Log dettagliato dei dati ricevuti
                            // logger.debug(`[PRINTER-STATUS] Risposta ricevuta da ${printer.name}:`);
                            // logger.debug(`  Lunghezza: ${responseData.length} byte(s)`);
                            // logger.debug(`  Hex dump: ${Array.from(responseData).map(b => '0x' + b.toString(16).toUpperCase().padStart(2, '0')).join(' ')}`);
                            // logger.debug(`  Decimal: ${Array.from(responseData).join(' ')}`);
                            // logger.debug(`  Binary: ${Array.from(responseData).map(b => b.toString(2).padStart(8, '0')).join(' ')}`);
                            
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
 * Invia un comando alternativo GS a per stampanti che non supportano DLE EOT
 * @param printer Configurazione stampante
 * @returns Promise<number | null> Byte di stato ricevuto o null in caso di errore
 */
async function sendAlternativeStatusQuery(printer: PrinterConfig): Promise<number | null> {
    return new Promise((resolve) => {
        const command = buildAlternativeStatusCommand();
        let received = false;
        let responseData: Buffer | null = null;

        logger.debug(`[PRINTER-STATUS] Invio comando alternativo GS a a ${printer.name} - Comando: [${Array.from(command).map(b => '0x' + b.toString(16).toUpperCase().padStart(2, '0')).join(', ')}]`);

        const timeout = setTimeout(() => {
            if (!received) {
                logger.warn(`[PRINTER-STATUS] Timeout comando alternativo ${printer.name}`);
                resolve(null);
            }
        }, 3000); // Timeout più lungo per comandi alternativi

        try {
            Bun.connect({
                hostname: printer.ip,
                port: printer.port,
                socket: {
                    open(sock) {
                        sock.write(command);
                        logger.debug(`[PRINTER-STATUS] Comando alternativo inviato a ${printer.name}`);
                    },
                    data(sock, data) {
                        if (!received) {
                            received = true;
                            responseData = Buffer.from(data);
                            clearTimeout(timeout);
                            
                            logger.debug(`[PRINTER-STATUS] Risposta alternativa ricevuta da ${printer.name}:`);
                            logger.debug(`  Lunghezza: ${responseData.length} byte(s)`);
                            logger.debug(`  Hex dump: ${Array.from(responseData).map(b => '0x' + b.toString(16).toUpperCase().padStart(2, '0')).join(' ')}`);
                            logger.debug(`  Decimal: ${Array.from(responseData).join(' ')}`);
                            logger.debug(`  Binary: ${Array.from(responseData).map(b => b.toString(2).padStart(8, '0')).join(' ')}`);
                            
                            sock.end();
                            
                            if (responseData && responseData.length > 0) {
                                resolve(responseData[0]);
                            } else {
                                resolve(null);
                            }
                        }
                    },
                    error(err) {
                        if (!received) {
                            received = true;
                            clearTimeout(timeout);
                            logger.error(`[PRINTER-STATUS] Errore comando alternativo per ${printer.name}:`, err);
                            resolve(null);
                        }
                    },
                    close() {
                        if (!received) {
                            received = true;
                            clearTimeout(timeout);
                            resolve(null);
                        }
                    }
                }
            }).catch(err => {
                if (!received) {
                    received = true;
                    clearTimeout(timeout);
                    logger.error(`[PRINTER-STATUS] Errore connessione comando alternativo per ${printer.name}:`, err);
                    resolve(null);
                }
            });
        } catch (err) {
            clearTimeout(timeout);
            logger.error(`[PRINTER-STATUS] Eccezione comando alternativo ${printer.name}:`, err);
            resolve(null);
        }
    });
}

/**
 *                      if (!received) {
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
