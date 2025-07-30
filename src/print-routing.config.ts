import { DatabaseController } from './controllers/db.controller.ts';

export const printerMap = {
    PIADINE: { key: "piadine",ip: "10.10.1.95", port: 9100, destination: "PIADINE", active: false },
    FORNO: { key: "forno", ip: "10.10.1.95", port: 9100, destination: "FORNO", active: false },
    PANINI: { key: "panini", ip: "10.10.1.95", port: 9100, destination: "PANINI", active: false },
    TOAST: { key: "toast", ip: "10.10.1.95", port: 9100, destination: "TOAST", active: false },
    "PIATTI UNICI": { key: "piattiu", ip: "10.10.1.95", port: 9100, destination: "PIATTI UNICI", active: false },
};

export type PrinterDest = keyof typeof printerMap;

export function getPrinterDestination(dest: string): PrinterDest | null {
    if (dest in printerMap) {
        return dest as PrinterDest;
    }
    console.warn(`[PRINT] Destinazione sconosciuta: ${dest}`);
    return null;
}

export async function savePrintersToDb() {
    const printers = Object.entries(printerMap).map(([name, config]) => ({
        key: config.key,
        printerName: name,
        printerIp: config.ip,
        printerPort: config.port,
        printerDestinations: config.destination,
        active: config.active,
    }));
    // console.log("[PRINT] Salvataggio stampanti nel database:", printers);
    if (printers.length === 0) {    
        console.warn("[PRINT] Nessuna stampante da salvare nel database.");
        return;
    }
    // Salva le stampanti nel database
    for (const printer of printers) {
        // console.log(`[PRINT] Salvataggio stampante: ${printer.printerName} (${printer.printerIp}:${printer.printerPort})`);
        DatabaseController.instance.savePrinterSettings(printer);
    }
}

export async function loadPrintersFromDb() {
    const printers = await DatabaseController.instance.getPrinterSettings() as Array<{ name: string; ip: string; port: number; destination?: string; active: boolean }>;
    const loadedMap: typeof printerMap = {} as any;
    for (const printer of printers) {
        loadedMap[printer.name as PrinterDest] = {
            key: printer.name,
            ip: printer.ip,
            port: printer.port,
            destination: printer.destination ?? printer.name,
            active: printer.active, // Assuming all loaded printers are active by default
        };
    }
    return loadedMap;
}