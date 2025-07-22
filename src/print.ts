export async function sendToPrinter(ip: string, port: number, buffer: Buffer): Promise<void> {
    return new Promise((resolve, reject) => {
        Bun.connect({
            hostname: ip,
            port,
            socket: {
                open(sock) {
                    sock.write(buffer);
                    sock.end();
                    resolve();
                },
                error(err) {
                    reject(err);
                },
                close() {
                    // optional log
                }
            }
        });
    });
}