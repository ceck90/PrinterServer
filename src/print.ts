export async function sendToPrinter(name: string, ip: string, port: number, buffer: Buffer): Promise<void> {
    return new Promise((resolve, reject) => {
        console.log(`[PRINT] Inviando dati alla stampante [${name}] @ ${ip}:${port}`);
        // console.log(`[PRINT] Dati da inviare:`, buffer.toString('hex'));
        Bun.connect({
            hostname: ip,
            port,
            socket: {
                open(sock) {
                    // console.log(`[PRINT] Connessione aperta alla stampante ${ip}:${port}`);
                    sock.write(buffer);
                    // console.log(`[PRINT] Dati inviati alla stampante ${ip}:${port}`);
                    sock.end();
                    resolve();
                },
                error(err) {
                    console.error(`[PRINT] Errore durante l'invio alla stampante ${ip}:${port}:`, err);
                    reject(err);
                },
                close() {
                    // console.log(`[PRINT] Connessione chiusa con la stampante ${ip}:${port}`);
                },
                data(_data) {
                    // Necessario per Bun.connect, anche se non usato
                }
            }
        }).catch(err => {
            console.error(`[PRINT] Errore di connessione alla stampante ${ip}:${port}:`, err);
            reject(err);
        });
    });
    
}