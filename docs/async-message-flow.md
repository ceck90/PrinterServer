# Flusso dei messaggi asincroni — PrinterServer

> Documento di riferimento per l'analisi di potenziali perdite di eventi asincroni.

---

## 1. Schema generale del flusso

```
[Kitchen-management-server]
        │
        │  WebSocket STOMP (SockJS)
        ▼
[WSClientController.connect()]          ← kitchenmgmt.controller.ts
        │
        ├─ /topic/greetings   →  log soltanto
        │
        └─ /topic/pkmi        →  JSON.parse(event.body)
                                         │
                                         ▼
                              [handleIncomingData(data)]   ← dispatcher.ts
```

---

## 2. Dettaglio fase di connessione e sync iniziale

```
WSClientController.connect()
  │
  ├─ [SockJS WebSocket creato]
  │
  ├─ stompClient.connect() callback (successo)
  │     │
  │     ├─ KitchenManagementController.fetchItems()   ← REST GET /plate-item?statuses=TODO,PROGRESS
  │     │     └─ paginazione automatica (Promise.all sulle pagine N>0)
  │     │           │
  │     │           ▼
  │     │     handleSingleOrderData(items[])           ← dispatcher.ts
  │     │           └─ per ogni item → handleIncomingOrder(order)
  │     │
  │     ├─ setResyncCallback(async () => {             ← registra callback debounced
  │     │     fetchItems() → handleSingleOrderData()
  │     │   })
  │     │
  │     ├─ subscribe(/topic/greetings)  → log
  │     │
  │     └─ subscribe(/topic/pkmi)       → handleIncomingData(data)
  │
  └─ stompClient.connect() callback (errore)
        └─ tryReconnect()  → setTimeout(connect, reconnectDelayMs)
```

---

## 3. handleIncomingData(data) — dispatcher.ts

```
handleIncomingData(data)
  │
  ├─ GUARD: tipo non in {PKMI_UPDATE, PKMI_ADD_ALL, PKMI_ADD}  → return (silenzioso)
  │
  ├─ GUARD: !data.plateKitchenMenuItem || !menuItem            → return (silenzioso)
  │
  ├─ if (PKMI_UPDATE && status in {PROGRESS, DONE})
  │     └─ scheduleResync()   ← debounce 1500ms
  │           └─ dopo 1500ms: fetchItems() → handleSingleOrderData()
  │
  ├─ switch(status):
  │     TODO / PROGRESS:  se plate == null → return (warn)
  │     DONE:             → return (log + ignorato)
  │     CANCELLED:        → return (log + ignorato)
  │
  ├─ Costruisce OrderPayload
  │
  └─ await handleIncomingOrder(order)
```

---

## 4. handleIncomingOrder(order) — dispatcher.ts

```
handleIncomingOrder(order)
  │
  ├─ HttpServerController.sendNotification('NEW_TICKETS', ...)   ← fire-and-forget (non awaited)
  │
  ├─ groupBy(order.items, i => i.dest)
  │
  └─ for each [dest, items]:
        │
        ├─ GUARD: printer non trovato per dest  → continue
        │
        ├─ GUARD: status == TODO || DONE        → continue (warn)
        │
        └─ await enqueuePrinterJob(dest, async () => {
                │
                ├─ getReceiptByIdAndStatus(orderId, status)
                │     └─ se già esistente → return (idempotency check)
                │
                ├─ buildKitchenTicket_v2(order, dest, items, ...)
                │
                ├─ if printer.active → await sendToPrinter(ip, port, buffer)
                │
                ├─ DatabaseController.saveReceipt(...)        ← NON awaited (fire-and-forget)
                │
                ├─ if printer.active → sendNotification('RECEIPT_PRINTED', ...)
                │
                └─ catch(err):
                      ├─ DatabaseController.saveReceipt({ printStatus: "FAILED" })  ← NON awaited
                      └─ sendNotification('RECEIPT_PRINT_FAILED', ...)
           })
```

---

## 5. enqueuePrinterJob — coda per stampante

```
_printerQueues: Map<dest, Promise<void>>

enqueuePrinterJob(dest, job):
  prev = _printerQueues.get(dest) ?? Promise.resolve()
  next = prev.then(async () => {
    await job()
    await sleep(INTER_PRINT_DELAY_MS)   // 100ms
  })
  _printerQueues.set(dest, next.catch(() => sleep(100)))
  return next
```

> **Nota**: `next.catch()` sostituisce la chain in mappa senza await. Un errore
> non catturato nel `job()` fa sì che `next` rigetti, ma la map viene aggiornata
> con `next.catch(...)` che risolve sempre → la coda non si interrompe.

---

## 6. handleSingleOrderData (sync/resync) — dispatcher.ts

```
handleSingleOrderData(data[])
  │
  └─ for each item (sequenziale, for-of con await):
        └─ await handleIncomingOrder(order)
```

> Usato sia per il sync iniziale che per ogni ciclo di resync debounced.
> Poiché è un `for...of` con `await`, gli ordini vengono processati **in serie**.

---

## 7. Punti critici identificati (potenziali perdite di eventi)

### 7.1 — `handleIncomingData` non è awaited dal subscriber STOMP

```ts
// kitchenmgmt.controller.ts
_this.stompClient.subscribe(_this.pkmiTopic, (event: any) => {
    const data = JSON.parse(event.body);
    handleIncomingData(data);   // ← Promise NON awaited
});
```
Il callback STOMP è **sincrono**. `handleIncomingData` restituisce una Promise
che **non viene né awaited né `.catch()`-ata**. Se arriva un secondo messaggio
prima che il primo sia completato, **entrambi entrano in pipeline senza
coordinazione**. Un errore non catturato produce un Unhandled Promise Rejection.

---

### 7.2 — `DatabaseController.saveReceipt` non è awaited

```ts
// dispatcher.ts — dentro enqueuePrinterJob
DatabaseController.getInstance().saveReceipt({...});   // fire-and-forget
```
Il salvataggio avviene **dopo** `sendToPrinter` ma **non è awaited**. Se il
processo termina o il DB lancia un'eccezione, la receipt non viene registrata
anche se la stampa è avvenuta fisicamente. Questo può causare **ristampe** al
prossimo resync (l'idempotency check in `getReceiptByIdAndStatus` restituirebbe
`null`).

---

### 7.3 — Race condition tra PKMI_UPDATE e resync debounced

```
t=0   PKMI_UPDATE arriva  → scheduleResync (timer 1500ms)
t=1   PKMI_UPDATE arriva  → timer resettato (debounce)
t=1500ms  resync: fetchItems() → handleSingleOrderData()
          (potenzialmente processa lo stesso ordine già in coda)
```
Se un `handleIncomingOrder` per l'ordine X è ancora nella coda di
`enqueuePrinterJob` quando parte il resync, il resync processerà lo stesso
ordine → l'idempotency check nel DB lo blocca **solo se il primo job ha già
completato `saveReceipt`**. Poiché `saveReceipt` non è awaited (7.2), il check
potrebbe trovare `null` e stampare due volte.

---

### 7.4 — `enqueuePrinterJob` è awaited in `handleIncomingOrder`, ma i messaggi STOMP concorrenti non lo sono

Ogni chiamata a `handleIncomingOrder` fa `await enqueuePrinterJob(...)` per
**ogni dest nell'ordine**, ma poiché il subscriber STOMP non awaita
`handleIncomingData`, due messaggi possono avviare due `handleIncomingOrder`
in parallelo → due job diversi possono essere accodati sulla stessa stampante
quasi contemporaneamente. La coda serializza correttamente i job, ma
l'idempotency check vive **dentro** la coda, quindi è protetto da race condition
**solo se la coda è la stessa destinazione**. Ordini multi-destinazione possono
ancora avere race condition cross-dest per lo stesso `orderId`.

---

### 7.5 — Sync iniziale vs primo messaggio STOMP

```
connect()
  └─ onConnect:
       ├─ fetchItems()          → handleSingleOrderData()  [async, non awaited]
       ├─ setResyncCallback()
       └─ subscribe /topic/pkmi  [attivo subito]
```
La subscribe è registrata **prima** che `fetchItems` completi. Se arriva un
`PKMI_UPDATE` durante il fetch iniziale, `handleIncomingData` viene chiamato
**in parallelo** con `handleSingleOrderData`. Non c'è coordinazione: il
controllo idempotency sul DB è l'unica barriera, che richiede a sua volta
che `saveReceipt` sia completato (cfr. 7.2).

---

## 8. Legenda stati ordine

| Status    | handleIncomingData | handleIncomingOrder |
|-----------|-------------------|---------------------|
| TODO      | entra nel flusso  | **ignorato** (warn) |
| PROGRESS  | entra nel flusso  | processato + stampa |
| DONE      | **ignorato**      | **ignorato** (warn) |
| CANCELLED | **ignorato**      | **ignorato** (warn) |

> Solo gli ordini in stato **PROGRESS** vengono effettivamente stampati.
> TODO è accettato da `handleIncomingData` ma scartato da `handleIncomingOrder`.

---

## 9. Componenti coinvolti

| Componente | File | Ruolo |
|---|---|---|
| `WSClientController` | `kitchenmgmt.controller.ts` | Connessione STOMP, retry, subscribe |
| `KitchenManagementController` | `kitchenmgmt.controller.ts` | REST fetch items (paginato) |
| `handleIncomingData` | `dispatcher.ts` | Filtro e normalizzazione messaggi STOMP |
| `handleSingleOrderData` | `dispatcher.ts` | Normalizzazione array (sync/resync) |
| `handleIncomingOrder` | `dispatcher.ts` | Routing su stampante, idempotency, stampa |
| `enqueuePrinterJob` | `dispatcher.ts` | Coda sequenziale per-stampante (Promise chain) |
| `scheduleResync` | `dispatcher.ts` | Debounce 1500ms su PKMI_UPDATE |
| `sendToPrinter` | `print.ts` | Invio buffer ESC/POS via TCP |
| `DatabaseController.saveReceipt` | `db.controller.ts` | Persistenza receipt (idempotency source) |
| `HttpServerController.sendNotification` | `httpserver.controller.ts` | WebSocket push ai client |
