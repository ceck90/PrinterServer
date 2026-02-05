# WebSocket Notifications Documentation

## Panoramica

Il sistema utilizza WebSocket per inviare notifiche in tempo reale ai client connessi. Tutte le notifiche seguono un formato standard e vengono inviate tramite il metodo `sendNotification()` del `HttpServerController`.

## Formato Messaggio Standard

Ogni notifica WebSocket ha la seguente struttura:

```json
{
  "type": "NOTIFICATION",
  "timestamp": "2025-12-12T10:30:00.000Z",
  "data": {
    "notificationType": "TIPO_NOTIFICA",
    "severity": "info|success|warning|error",
    "payload": {
      // Dati specifici della notifica
    }
  }
}
```

### Campi Standard

- **type**: Sempre `"NOTIFICATION"` per identificare il tipo di messaggio WebSocket
- **timestamp**: Data/ora ISO 8601 di quando la notifica è stata generata
- **data.notificationType**: Identificatore specifico del tipo di notifica (vedi sezione Tipi di Notifica)
- **data.severity**: Livello di gravità della notifica
  - `info`: Informazione generale
  - `success`: Operazione completata con successo
  - `warning`: Attenzione, possibile problema
  - `error`: Errore critico
- **data.payload**: Oggetto contenente i dati specifici della notifica

---

## Tipi di Notifica

### 🔔 Connessione WebSocket

#### `WS_CONNECTED`
Inviato dal server quando un client si connette con successo.

**Severity**: `info`

**Payload**:
```typescript
{
  clientId: string;  // ID univoco assegnato al client
}
```

**Esempio**:
```json
{
  "type": "NOTIFICATION",
  "timestamp": "2025-12-12T10:30:00.000Z",
  "data": {
    "notificationType": "WS_CONNECTED",
    "severity": "info",
    "payload": {
      "clientId": "550e8400-e29b-41d4-a716-446655440000"
    }
  }
}
```

---

### 📋 Ordini e Ricevute

#### `ORDER_RECEIVED`
Notifica quando un nuovo ordine viene ricevuto dal sistema GSG.

**Severity**: `info`

**Payload**:
```typescript
{
  orderId: number;       // ID dell'ordine
  numeroTavolo?: string; // Numero tavolo (se presente)
  canale: string;        // PIAZZA | ASPORTO
  totalePagato: number;  // Importo totale
}
```

#### `RECEIPT_PRINTED`
Notifica quando una ricevuta viene stampata con successo.

**Severity**: `success`

**Payload**:
```typescript
{
  receiptId: number;     // ID della ricevuta
  printerName: string;   // Nome della stampante
  orderId: number;       // ID dell'ordine associato
  destination?: string;  // Destinazione (CUCINA, BAR, etc.)
}
```

#### `RECEIPT_PRINT_FAILED`
Notifica quando la stampa di una ricevuta fallisce.

**Severity**: `error`

**Payload**:
```typescript
{
  receiptId: number;     // ID della ricevuta
  printerName: string;   // Nome della stampante
  orderId: number;       // ID dell'ordine associato
  error: string;         // Messaggio di errore
  destination?: string;  // Destinazione prevista
}
```

---

### 🖨️ Stampanti

#### `PRINTER_STATUS_CHANGE`
Notifica quando lo stato di una stampante cambia.

**Severity**: `info` | `warning` | `error`

**Payload**:
```typescript
{
  printerName: string;   // Nome della stampante
  printerIp: string;     // IP della stampante
  status: string;        // ONLINE | OFFLINE | ERROR
  previousStatus?: string; // Stato precedente
  message?: string;      // Messaggio descrittivo
}
```

#### `PRINTER_ADDED`
Notifica quando una nuova stampante viene aggiunta.

**Severity**: `success`

**Payload**:
```typescript
{
  printerKey: string;    // Chiave univoca stampante
  printerName: string;   // Nome della stampante
  printerIp: string;     // IP della stampante
  printerPort: number;   // Porta della stampante
}
```

#### `PRINTER_DELETED`
Notifica quando una stampante viene rimossa.

**Severity**: `info`

**Payload**:
```typescript
{
  printerKey: string;    // Chiave univoca stampante
  printerName: string;   // Nome della stampante
}
```

#### `PRINTER_UPDATED`
Notifica quando la configurazione di una stampante viene aggiornata.

**Severity**: `info`

**Payload**:
```typescript
{
  printerKey: string;    // Chiave univoca stampante
  printerName: string;   // Nome della stampante
  changes: string[];     // Lista campi modificati
}
```

---

### 🍕 Gestione Cucina/Kitchen

#### `ORDER_STATUS_CHANGED`
Notifica quando lo stato di un ordine in cucina cambia.

**Severity**: `info`

**Payload**:
```typescript
{
  itemId: string;        // ID dell'item
  orderId: number;       // ID dell'ordine
  oldStatus: string;     // Stato precedente
  newStatus: string;     // Nuovo stato (PENDING, IN_PROGRESS, DONE, etc.)
  plate?: string;        // Reparto (CUCINA, PIZZERIA, BAR, etc.)
}
```

#### `ORDER_PLATE_CHANGED`
Notifica quando un ordine viene spostato da un reparto all'altro.

**Severity**: `info`

**Payload**:
```typescript
{
  itemId: string;        // ID dell'item
  orderId: number;       // ID dell'ordine
  oldPlate: string;      // Reparto precedente
  newPlate: string;      // Nuovo reparto
}
```

---

### 📊 Statistiche e Sistema

#### `STATISTICS_UPDATED`
Notifica quando le statistiche vengono ricalcolate.

**Severity**: `info`

**Payload**:
```typescript
{
  dateRange: {
    startDate: string;   // Data inizio
    endDate: string;     // Data fine
  };
  statsType: string;     // Tipo di statistica aggiornata
}
```

#### `SYSTEM_ERROR`
Notifica di errore generale del sistema.

**Severity**: `error`

**Payload**:
```typescript
{
  component: string;     // Componente che ha generato l'errore
  error: string;         // Messaggio di errore
  details?: any;         // Dettagli aggiuntivi
}
```

#### `SYSTEM_WARNING`
Notifica di warning generale del sistema.

**Severity**: `warning`

**Payload**:
```typescript
{
  component: string;     // Componente che ha generato il warning
  message: string;       // Messaggio di warning
  details?: any;         // Dettagli aggiuntivi
}
```

---

## Utilizzo nel Backend

### Inviare una Notifica

```typescript
import { HttpServerController } from './controllers/httpserver.controller';

// Ottieni l'istanza del controller
const httpController = HttpServerController.instance;

// Invia notifica di successo stampa
httpController.sendNotification(
  'RECEIPT_PRINTED',
  {
    receiptId: 123,
    printerName: 'CUCINA-01',
    orderId: 456,
    destination: 'CUCINA'
  },
  'success'
);

// Invia notifica di errore
httpController.sendNotification(
  'PRINTER_STATUS_CHANGE',
  {
    printerName: 'BAR-01',
    printerIp: '192.168.1.100',
    status: 'OFFLINE',
    previousStatus: 'ONLINE',
    message: 'Stampante non raggiungibile'
  },
  'error'
);
```

---

## Client-Side Implementation

### Connessione WebSocket con Autenticazione

Il WebSocket richiede un token JWT valido per connettersi. Il token può essere passato in due modi:

#### Opzione 1: Token come Query Parameter
```typescript
const token = 'YOUR_JWT_TOKEN'; // Ottenuto dal login
const ws = new WebSocket(`ws://localhost:4000/api/ws?token=${token}`);

ws.onopen = () => {
  console.log('WebSocket connesso e autenticato');
};

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  
  if (message.type === 'hello') {
    console.log(`Connesso con ID: ${message.id}`);
    console.log(`Autenticato: ${message.authenticated}`);
  } else if (message.type === 'error') {
    console.error('Errore:', message.message);
  } else if (message.type === 'NOTIFICATION') {
    handleNotification(message.data);
  }
};

ws.onerror = (error) => {
  console.error('WebSocket error:', error);
};

ws.onclose = (event) => {
  if (event.code === 1008) {
    console.error('Connessione chiusa: Non autorizzato');
  }
};
```

#### Opzione 2: Token nell'Header (Browser moderni)
```typescript
const token = 'YOUR_JWT_TOKEN';

// Nota: alcuni browser non supportano header custom nei WebSocket
// In tal caso, usa l'opzione 1 (query parameter)
const ws = new WebSocket('ws://localhost:4000/api/ws', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});
```

### Gestione Autenticazione

**Token non valido o mancante:**
```json
{
  "type": "error",
  "message": "Unauthorized - Invalid or missing token"
}
```
La connessione verrà chiusa automaticamente con codice `1008` (Policy Violation).

**Autenticazione riuscita:**
```json
{
  "type": "hello",
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "authenticated": true
}
```

### Esempio Completo con Angular Service

```typescript
import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class WebSocketService {
  private ws?: WebSocket;
  private notifications$ = new BehaviorSubject<any>(null);
  
  connect(token: string) {
    this.ws = new WebSocket(`ws://localhost:4000/api/ws?token=${token}`);
    
    this.ws.onopen = () => console.log('WebSocket connected');
    
    this.ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.type === 'NOTIFICATION') {
        this.notifications$.next(message.data);
      }
    };
    
    this.ws.onerror = (error) => console.error('WS error:', error);
    
    this.ws.onclose = (event) => {
      if (event.code === 1008) {
        console.error('Unauthorized - reconnecting...');
        // Implementa logica di riconnessione
      }
    };
  }
  
  getNotifications() {
    return this.notifications$.asObservable();
  }
  
  disconnect() {
    this.ws?.close();
  }
}
```

### Handler Notifiche

```typescript
function handleNotification(data: any) {
  const { notificationType, severity, payload } = data;
  
  switch (notificationType) {
    case 'RECEIPT_PRINTED':
      console.log(`✅ Ricevuta #${payload.receiptId} stampata su ${payload.printerName}`);
      break;
      
    case 'RECEIPT_PRINT_FAILED':
      console.error(`❌ Errore stampa ricevuta #${payload.receiptId}: ${payload.error}`);
      break;
      
    case 'ORDER_STATUS_CHANGED':
      console.log(`📋 Ordine #${payload.orderId} cambiato da ${payload.oldStatus} a ${payload.newStatus}`);
      break;
      
    // ... altri casi
  }
  
  // Mostra notifica UI in base alla severity
  showToast(notificationType, payload, severity);
}
```

---

## Note Implementazione

### TODO: Da Analizzare

Le seguenti notifiche devono ancora essere implementate nei rispettivi moduli:

- [x] `RECEIPT_PRINTED` / `RECEIPT_PRINT_FAILED` - **IMPLEMENTATO** in `dispatcher.ts` → `handleIncomingOrder()`
- [ ] `ORDER_RECEIVED` - da implementare in `gsg.controller.ts`
- [ ] `PRINTER_STATUS_CHANGE` - da implementare nel monitoring delle stampanti
- [ ] `ORDER_STATUS_CHANGED` / `ORDER_PLATE_CHANGED` - da implementare in `kitchenmgmt.controller.ts`
- [ ] `PRINTER_ADDED` / `PRINTER_DELETED` / `PRINTER_UPDATED` - da aggiungere alle API stampanti

### Prossimi Passi

1. Analizzare `dispatcher.ts` per identificare punti di invio notifiche stampa
2. Analizzare `gsg.controller.ts` per notifiche ricezione ordini
3. Analizzare `kitchenmgmt.controller.ts` per notifiche cambio stato ordini
4. Implementare monitoring stato stampanti
5. Aggiornare frontend Angular per ricevere e gestire notifiche

---

## Changelog

- **v1.0** (2025-12-12): Documentazione iniziale con struttura base e tipi principali
