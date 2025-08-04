import { DatabaseController } from './controllers/db.controller.ts';

// Tipo stampante
export type PrinterConfig = {
    key: string;
    name: string;
    ip: string;
    port: number;
    destination: string;
    active: boolean;
    description?: string;
};

// Array popolato dal DB
export let printers: PrinterConfig[] = [];

// Mappa legacy SOLO per seed iniziale
const printerMapSeed: Record<string, Omit<PrinterConfig, "name">> = {
    "PIADINE": { key: "piadine", ip: "10.10.1.95", port: 9100, destination: "PIADINE", active: true, description: "" },
    "FORNO": { key: "forno", ip: "10.10.1.95", port: 9100, destination: "FORNO", active: true, description: "" },
    "PANINI": { key: "panini", ip: "10.10.1.95", port: 9100, destination: "PANINI", active: true, description: "" },
    "TOAST": { key: "toast", ip: "10.10.1.95", port: 9100, destination: "TOAST", active: true, description: "" },
    "PIATTI UNICI": { key: "piattiunici", ip: "10.10.1.95", port: 9100, destination: "PIATTI UNICI", active: true, description: "" }
};

// Popola la tabella printers se vuota
export function seedPrintersIfDbEmpty() {
    const existing = DatabaseController.instance.getPrinterSettings();
    if (!existing || existing.length === 0) {
        for (const [name, config] of Object.entries(printerMapSeed)) {
            DatabaseController.instance.savePrinterSettings({
                key: config.key,
                printerName: name,
                printerIp: config.ip,
                printerPort: config.port,
                printerDestinations: config.destination,
                active: config.active,
                description: config.description ?? ""
            });
        }
        console.log("[PRINT] Tabella printers popolata dal seed iniziale.");
    }
}

// Carica le stampanti dal DB nell'array printers
export function loadPrintersFromDb() {
    const dbPrinters = DatabaseController.instance.getPrinterSettings() as Array<any> || [];
    printers = dbPrinters.map(printer => ({
        key: printer.name,
        name: printer.name,
        ip: printer.ip,
        port: printer.port,
        destination: printer.destination ?? printer.name,
        active: printer.active,
        description: printer.description ?? ""
    }));
    for (const printer of printers) {
        console.log(`[PRINT] Stampante caricata: ${printer.name} (${printer.ip}:${printer.port})`);
    }
}