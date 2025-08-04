import { DatabaseController } from './controllers/db.controller.ts';

export const printerMap = {
    "PIADINE": { key: "piadine",ip: "10.10.1.95", port: 9100, destination: "PIADINE", active: true, description: "" },
    "FORNO": { key: "forno", ip: "10.10.1.95", port: 9100, destination: "FORNO", active: true, description: "" },
    "PANINI": { key: "panini", ip: "10.10.1.95", port: 9100, destination: "PANINI", active: true, description: "" },
    "TOAST": { key: "toast", ip: "10.10.1.95", port: 9100, destination: "TOAST", active: true, description: "" },
    "PIATTI UNICI": { key: "piattiunici", ip: "10.10.1.95", port: 9100, destination: "PIATTI UNICI", active: true, description: "" },
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
        description: config.description
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

export function loadPrintersFromDb() {
    const printers = DatabaseController.instance.getPrinterSettings() as Array<{ name: string; ip: string; port: number; destination?: string; active: boolean; description?: string }> || [];
    const loadedMap: typeof printerMap = {} as any;
    for (const printer of printers) {
        loadedMap[printer.name as PrinterDest] = {
            key: printer.name,
            ip: printer.ip,
            port: printer.port,
            destination: printer.destination ?? printer.name,
            active: printer.active,
            description: printer.description ?? "",
        };
        console.log(`[PRINT] Stampante caricata: ${printer.name} (${printer.ip}:${printer.port})`);
    }
    return loadedMap;
}