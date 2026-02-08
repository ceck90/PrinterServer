// logger.ts
// Sistema di logging centralizzato con livelli di verbosity

const DEBUG_MODE = process.env.DEBUG === 'true' || process.env.NODE_ENV === 'development';

/**
 * Log di debug - mostrato solo se DEBUG=true
 */
export function debug(message: string, ...args: any[]) {
  if (DEBUG_MODE) {
    console.log(`[DEBUG] ${message}`, ...args);
  }
}

/**
 * Log informativo - sempre mostrato
 */
export function info(message: string, ...args: any[]) {
  console.log(message, ...args);
}

/**
 * Warning - sempre mostrato
 */
export function warn(message: string, ...args: any[]) {
  console.warn(message, ...args);
}

/**
 * Errore - sempre mostrato
 */
export function error(message: string, ...args: any[]) {
  console.error(message, ...args);
}

/**
 * Verifica se il debug è attivo
 */
export function isDebug(): boolean {
  return DEBUG_MODE;
}
