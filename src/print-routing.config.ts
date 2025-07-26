import { DatabaseController } from './controllers/db.controller.ts';

export const printerMap = {
    PIADINE: { ip: "10.10.1.95", port: 9100, destination: "PIADINE" },
    FORNO: { ip: "192.168.1.11", port: 9100, destination: "FORNO" },
    TOAST: { ip: "192.168.1.12", port: 9100, destination: "TOAST" },
    PIATTIUNICI: { ip: "192.168.1.13", port: 9100, destination: "PIATTIUNICI" },
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
        printerName: name,
        printerIp: config.ip,
        printerPort: config.port,
        printerDestinations: config.destination,
    }));
    for (const printer of printers) {
        DatabaseController.instance.savePrinterSettings(printer);
    }
}

export async function loadPrintersFromDb() {
    const printers = await DatabaseController.instance.getPrinterSettings() as Array<{ name: string; ip: string; port: number; destination?: string }>;
    const loadedMap: typeof printerMap = {} as any;
    for (const printer of printers) {
        loadedMap[printer.name as PrinterDest] = {
            ip: printer.ip,
            port: printer.port,
            destination: printer.destination ?? printer.name,
        };
    }
    return loadedMap;
}