import type { OrderPayload } from "./types";
import { groupBy } from "./utils";
import { buildKitchenReceipt } from "./receipt";
import { sendToPrinter } from "./print";
import { printerMap } from "./print-routing.config.ts";

type PrinterDest = keyof typeof printerMap;
import { DatabaseController } from "./controllers/db.controller.ts";

export async function handleIncomingOrder(order: OrderPayload) {
    const grouped = groupBy(order.items, i => i.dest);
    for (const [dest, items] of Object.entries(grouped)) {
        const printer = printerMap[dest as PrinterDest];
        if (!printer) continue;

        const id = `${order.id}-${dest}`;
        try {
            const buffer = await buildKitchenReceipt(order, dest, items);
            await sendToPrinter(printer.ip, printer.port, buffer);

            DatabaseController.instance.saveReceipt({
                id,
                orderId: order.id,
                destination: dest,
                content: buffer,
                status: "PRINTED",
                printedAt: new Date(),
            });
        } catch (err) {
            console.error(`Errore stampando ${dest}:`, err);
            DatabaseController.instance.saveReceipt({
                id,
                orderId: order.id,
                destination: dest,
                content: Buffer.from(""),
                status: "FAILED",
                printedAt: new Date(),
            });
        }
    }
}