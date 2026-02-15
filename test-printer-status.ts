/**
 * Script semplificato - Test stampante con solo DLE EOT (4 comandi)
 * Attesa di 500ms tra ogni comando per non sovraccaricare la stampante
 */

async function queryStatus(ip: string, port: number, cmd: Buffer, label: string): Promise<Buffer | null> {
    return new Promise((resolve) => {
        let received = false;
        const timeout = setTimeout(() => {
            if (!received) {
                resolve(null);
            }
        }, 2000);

        try {
            Bun.connect({
                hostname: ip,
                port: port,
                socket: {
                    open(sock) {
                        sock.write(cmd);
                    },
                    data(sock, data) {
                        if (!received) {
                            received = true;
                            clearTimeout(timeout);
                            const buffer = Buffer.from(data);
                            sock.end();
                            resolve(buffer);
                        }
                    },
                    error(_err) {
                        if (!received) {
                            received = true;
                            clearTimeout(timeout);
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
            });
        } catch (err) {
            clearTimeout(timeout);
            resolve(null);
        }
    });
}

function printBits(buffer: Buffer | null, label: string) {
    if (!buffer || buffer.length === 0) {
        console.log(`   ${label}: ⏱️  NO DATA/TIMEOUT`);
        return;
    }
    
    console.log(`\n   ${label}: ✅ ${buffer.length} byte(s)`);
    for (let i = 0; i < buffer.length; i++) {
        const byte = buffer[i];
        const bin = byte.toString(2).padStart(8, '0');
        const hex = '0x' + byte.toString(16).toUpperCase().padStart(2, '0');
        console.log(`      [${i}] ${bin}  (${hex} = ${byte})`);
    }
}

async function monitor(ip: string, port: number) {
    console.clear();
    console.log("═════════════════════════════════════════════════════════════");
    console.log("  TEST STAMPANTE ESC/POS - Solo DLE EOT (4 comandi standard)");
    console.log("═════════════════════════════════════════════════════════════\n");
    console.log(`Stampante: ${ip}:${port}`);
    console.log("Attesa: 500ms tra comandi | Ciclo ogni 4 secondi\n");
    console.log("🔬 Simula FISICAMENTE gli errori e osserva i bit!\n");
    console.log("─────────────────────────────────────────────────────────────\n");
    
    let cycle = 0;
    
    while (true) {
        cycle++;
        const time = new Date().toLocaleTimeString('it-IT');
        
        console.log(`[${time}] ═══════ Ciclo #${cycle} ═══════\n`);
        
        // DLE EOT 1 - Printer Status (0x10, 0x04, 0x01)
        const cmd1 = Buffer.from([0x10, 0x04, 0x01]);
        const resp1 = await queryStatus(ip, port, cmd1, "DLE EOT 1");
        printBits(resp1, "DLE EOT 1 (Printer Status)");
        await Bun.sleep(500);
        
        // DLE EOT 2 - Offline Status (0x10, 0x04, 0x02)
        const cmd2 = Buffer.from([0x10, 0x04, 0x02]);
        const resp2 = await queryStatus(ip, port, cmd2, "DLE EOT 2");
        printBits(resp2, "DLE EOT 2 (Offline Status)");
        await Bun.sleep(500);
        
        // DLE EOT 3 - Error Status (0x10, 0x04, 0x03)
        const cmd3 = Buffer.from([0x10, 0x04, 0x03]);
        const resp3 = await queryStatus(ip, port, cmd3, "DLE EOT 3");
        printBits(resp3, "DLE EOT 3 (Error Status)");
        await Bun.sleep(500);
        
        // DLE EOT 4 - Paper Status (0x10, 0x04, 0x04)
        const cmd4 = Buffer.from([0x10, 0x04, 0x04]);
        const resp4 = await queryStatus(ip, port, cmd4, "DLE EOT 4");
        printBits(resp4, "DLE EOT 4 (Paper Status)");
        
        // Interpretazione rapida
        console.log("\n   ─────────────────────────────────────────────────────────");
        console.log("   📊 INTERPRETAZIONE:");
        
        if (resp1 && resp1.length > 0) {
            const b = resp1[0];
            const bit3 = (b >> 3) & 1;
            const bit5 = (b >> 5) & 1;
            console.log(`      Bit3=${bit3} → Online: ${bit3===0 ? '✅ SÌ' : '❌ NO'}`);
            console.log(`      Bit5=${bit5} → Cover: ${bit5===1 ? '❌ APERTO' : '✅ Chiuso'}`);
        }
        
        if (resp4 && resp4.length > 0) {
            const b = resp4[0];
            const paperBits = (b >> 2) & 0b11;
            const nearBits = (b >> 5) & 0b11;
            console.log(`      Bit2-3=${paperBits.toString(2).padStart(2,'0')} → Carta: ${paperBits===0 ? '✅ OK' : '❌ FINITA'}`);
            console.log(`      Bit5-6=${nearBits.toString(2).padStart(2,'0')} → Near-end: ${nearBits===3 ? '⚠️ SÌ' : '✅ No'}`);
        }
        
        console.log("   ─────────────────────────────────────────────────────────");
        console.log("   ⏳ Attendo 4 secondi prima del prossimo ciclo...\n");
        await Bun.sleep(4000);
    }
}

// Main
const ip = process.argv[2] || "10.10.1.99";
const port = parseInt(process.argv[3] || "9100");

console.log(`Avvio monitor per ${ip}:${port}...\n`);
monitor(ip, port);
