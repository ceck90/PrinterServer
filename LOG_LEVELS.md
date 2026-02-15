# Sistema di Logging

## Configurazione

Il progetto utilizza un sistema di logging centralizzato con diversi livelli di verbosity.

### Variabile di Ambiente

Per controllare il livello di logging, impostare la variabile d'ambiente:

```bash
# Modalità DEBUG (mostra tutti i log)
export DEBUG=true

# Modalità PRODUZIONE (mostra solo INFO, WARN, ERROR)
export DEBUG=false
# oppure
unset DEBUG
```

## Livelli di Log

### DEBUG (`logger.debug()`)
**Mostra solo se `DEBUG=true`**

Informazioni dettagliate per il debugging:
- Strutture dati complete (JSON stringify)
- Log di heartbeat
- Log di ogni singolo step di processing
- Dettagli WebSocket (connessioni, messaggi inviati)
- Event structure complete

**Esempi:**
```typescript
logger.debug("[GSG] Event structure:", JSON.stringify(event, null, 2));
logger.debug("[WS] Message sent to client 123");
logger.debug("[GSG] heartbeat OK");
```

### INFO (`logger.info()`)
**Sempre mostrato**

Operazioni importanti completate con successo:
- Avvio/stop di servizi
- Ordini processati
- Stampe effettuate
- Connessioni WebSocket stabilite

**Esempi:**
```typescript
logger.info("[DISPATCHER] Stampa ordine 123 su CUCINA");
logger.info("[GSG] Stampa coperti per ordine 456");
logger.info("[WS] Client connected: abc-123");
```

### WARN (`logger.warn()`)
**Sempre mostrato**

Situazioni anomale ma non critiche:
- Stampante non configurata
- Stampante non attiva
- Dati mancanti o non validi
- Connessioni fallite (con retry)

**Esempi:**
```typescript
logger.warn("[DISPATCHER] Nessuna stampante configurata per COPERTI");
logger.warn("[DISPATCHER] Stampante CUCINA non attiva");
```

### ERROR (`logger.error()`)
**Sempre mostrato**

Errori che richiedono attenzione:
- Errori di stampa
- Errori di database
- Errori di connessione critici
- Eccezioni non gestite

**Esempi:**
```typescript
logger.error("[DISPATCHER] Errore nella stampa:", err);
logger.error("[GSG] query error:", err);
```

## Uso nei File

### Import
```typescript
import * as logger from "./logger.ts";
```

### Sostituzione
```typescript
// ❌ Prima (sempre visibile)
console.log("[DEBUG] Struttura evento:", JSON.stringify(event));

// ✅ Dopo (solo se DEBUG=true)
logger.debug("[DEBUG] Struttura evento:", JSON.stringify(event));

// ✅ Log importante (sempre visibile)
logger.info("[INFO] Ordine stampato con successo");
```

## Linee Guida

### Usare DEBUG per:
- Log ripetitivi (heartbeat, queue processing)
- Dump completi di strutture dati
- Tracciamento dettagliato del flusso
- Informazioni utili solo durante lo sviluppo

### Usare INFO per:
- Operazioni completate con successo
- Eventi business importanti
- Milestone del processing

### Usare WARN per:
- Condizioni non ottimali ma gestibili
- Configurazioni mancanti
- Tentativi falliti con fallback

### Usare ERROR per:
- Errori che interrompono il flusso
- Eccezioni non previste
- Situazioni che richiedono intervento

## Esempio Completo

```typescript
export async function processOrder(order: Order) {
    logger.debug("[ORDER] Processing started", JSON.stringify(order));
    
    try {
        logger.info(`[ORDER] Processing order ${order.id}`);
        
        if (!order.destination) {
            logger.warn(`[ORDER] Missing destination for order ${order.id}`);
            return;
        }
        
        await printOrder(order);
        logger.info(`[ORDER] Order ${order.id} printed successfully`);
        
        logger.debug("[ORDER] Processing completed");
        
    } catch (err) {
        logger.error(`[ORDER] Failed to process order ${order.id}:`, err);
    }
}
```

## File Modificati

I seguenti file sono stati aggiornati per usare il sistema di logging:

- ✅ `src/logger.ts` (nuovo file)
- ✅ `src/controllers/gsg.controller.ts`
- ✅ `src/dispatcher.ts`
- ✅ `src/controllers/httpserver.controller.ts`

## Avvio con DEBUG

```bash
# Sviluppo (tutti i log)
DEBUG=true bun run src/main.ts

# Produzione (solo info/warn/error)
DEBUG=false bun run src/main.ts
# oppure
bun run src/main.ts
```
