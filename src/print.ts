/**
 * Invia un buffer di dati a una stampante di rete tramite TCP/IP.
 * Usa Bun.connect per aprire una connessione socket verso la stampante.
 * 
 * @param name Nome descrittivo della stampante (per log)
 * @param ip Indirizzo IP della stampante
 * @param port Porta TCP della stampante (tipicamente 9100)
 * @param buffer Dati da inviare (tipicamente ESC/POS o simili)
 * @returns Promise<void> che si risolve al termine dell'invio
 */
export async function sendToPrinter(name: string, ip: string, port: number, buffer: Buffer): Promise<void> {
    return new Promise((resolve, reject) => {
        console.log(`[PRINT] Inviando dati alla stampante [${name}] @ ${ip}:${port}`);
        // console.log(`[PRINT] Dati da inviare:`, buffer.toString('hex'));
        Bun.connect({
            hostname: ip,
            port,
            socket: {
                /**
                 * Evento chiamato all'apertura della connessione.
                 * Scrive il buffer e chiude la connessione.
                 */
                open(sock) {
                    // console.log(`[PRINT] Connessione aperta alla stampante ${ip}:${port}`);
                    sock.write(buffer);
                    // console.log(`[PRINT] Dati inviati alla stampante ${ip}:${port}`);
                    sock.end();
                    resolve();
                },
                /**
                 * Evento chiamato in caso di errore sulla connessione.
                 */
                error(err) {
                    console.error(`[PRINT] Errore durante l'invio alla stampante ${ip}:${port}:`, err);
                    reject(err);
                },
                /**
                 * Evento chiamato alla chiusura della connessione.
                 */
                close() {
                    // console.log(`[PRINT] Connessione chiusa con la stampante ${ip}:${port}`);
                },
                /**
                 * Evento chiamato alla ricezione di dati dalla stampante.
                 * (Non usato, ma necessario per Bun.connect)
                 */
                data(_data) {
                    // Necessario per Bun.connect, anche se non usato
                }
            }
        }).catch(err => {
            // Gestione errori di connessione TCP
            console.error(`[PRINT] Errore di connessione alla stampante ${ip}:${port}:`, err);
            reject(err);
        });
    });
    
}