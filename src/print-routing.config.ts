import { DatabaseController } from './controllers/db.controller.ts';

/**
 * Tipo che rappresenta la configurazione di una stampante.
 */
export type PrinterConfig = {
    key: string;           // Chiave univoca della stampante
    name: string;          // Nome descrittivo (usato come riferimento logico)
    ip: string;            // Indirizzo IP della stampante
    port: number;          // Porta TCP della stampante (tipicamente 9100)
    destination: string;   // Destinazione logica (es: "CUCINA", "BAR", ecc.)
    active: boolean;       // Se la stampante è attiva o meno
    upsideDown: boolean;   // Se la stampa deve essere capovolta
    description?: string;  // Descrizione opzionale
};

/**
 * Array globale che contiene tutte le stampanti caricate dal database.
 * Questo array viene popolato all'avvio tramite loadPrintersFromDb()
 * e usato in tutto il sistema per routing e stampa.
 */
export let printers: PrinterConfig[] = [];

/**
 * Mappa di configurazione stampanti usata SOLO per il seed iniziale del database.
 * Le chiavi sono i nomi logici delle stampanti.
 * Questo oggetto NON viene usato a runtime, ma solo se la tabella printers è vuota.
 */
const printerMapSeed: Record<string, Omit<PrinterConfig, "name">> = {
    "PIADINE":     { key: "piadine",     ip: "10.10.1.95", port: 9100, destination: "PIADINE",     active: true, upsideDown: false, description: "" },
    "FORNO":       { key: "forno",       ip: "10.10.1.95", port: 9100, destination: "FORNO",       active: true, upsideDown: false, description: "" },
    "PANINI":      { key: "panini",      ip: "10.10.1.95", port: 9100, destination: "PANINI",      active: true, upsideDown: false, description: "" },
    "TOAST":       { key: "toast",       ip: "10.10.1.95", port: 9100, destination: "TOAST",       active: true, upsideDown: false, description: "" },
    "PIATTI UNICI":{ key: "piattiunici", ip: "10.10.1.95", port: 9100, destination: "PIATTI UNICI",active: true, upsideDown: false, description: "" }
};

/**
 * Popola la tabella printers nel database se è vuota, usando la mappa seed.
 * Da chiamare una sola volta all'avvio, prima di caricare le stampanti dal DB.
 */
export function seedPrintersIfDbEmpty() {
    const existing = DatabaseController.getInstance().getPrinterSettings();
    if (!existing || existing.length === 0) {
        for (const [name, config] of Object.entries(printerMapSeed)) {
            DatabaseController.getInstance().savePrinterSettings({
                key: config.key,
                printerName: name, // nome logico come chiave primaria
                printerIp: config.ip,
                printerPort: config.port,
                printerDestinations: config.destination,
                active: config.active,
                upsideDown: config.upsideDown ?? false, // Aggiunto upsideDown con valore di default
                description: config.description ?? ""
            });
        }
        console.log("[PRINT] Tabella printers popolata dal seed iniziale.");
    }
}

/**
 * Carica tutte le stampanti dal database e aggiorna l'array globale printers.
 * Da chiamare dopo il seed e ogni volta che si aggiornano le stampanti.
 * Ogni stampante viene loggata in console.
 */
export function loadPrintersFromDb() {
    const dbPrinters = DatabaseController.getInstance().getPrinterSettings() as Array<any> || [];
    printers = dbPrinters.map(printer => ({
        key: printer.name, // 'name' corrisponde a 'key' nel DB
        name: printer.name,
        ip: printer.ip,
        port: printer.port,
        destination: printer.destination ?? printer.name,
        active: printer.active,
        upsideDown: printer.upsideDown ?? false,
        description: printer.description ?? ""
    }));
    for (const printer of printers) {
        console.log(`[PRINT] Stampante caricata: ${printer.name} (${printer.ip}:${printer.port} --> ${printer.destination}) - ${printer.active ? 'Attiva' : 'Inattiva'} - ${printer.upsideDown ? 'Capovolta' : 'Normale'}`);
    }
}