# WhatsApp Messaging System — WPPConnect

Production-ready WhatsApp bulk messaging API built with Node.js, Express, and WPPConnect.

---

## Folder Structure

```
.
├── src/
│   ├── config/
│   │   └── index.js          # Centralised config (port, delays, session path, etc.)
│   ├── controllers/
│   │   ├── messageController.js   # Request handlers for messaging endpoints
│   │   └── webhookController.js   # Incoming message listener & endpoint
│   ├── routes/
│   │   └── index.js          # Express router (rate limiter, multer, all routes)
│   ├── services/
│   │   ├── messageQueue.js   # In-memory queue with dedup, retry, sequential send
│   │   └── messagingService.js    # Thin service layer over queue + client
│   ├── utils/
│   │   ├── csvParser.js      # CSV → phone number array parser
│   │   ├── helpers.js        # randomDelay, toChatId, validators
│   │   └── logger.js         # Winston logger (console + file)
│   ├── whatsapp/
│   │   └── client.js         # WPPConnect session wrapper + multi-session registry
│   └── server.js             # Bootstrap: init session → start HTTP server
├── logs/                     # Auto-created log files
├── sessions/                 # WPPConnect session tokens (persisted)
├── index.js                  # Entry point (delegates to src/server.js)
└── package.json
```

---

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. (Optional) Configure via environment variables

| Variable      | Default           | Description                        |
|---------------|-------------------|------------------------------------|
| `PORT`        | `3000`            | HTTP server port                   |
| `WA_SESSION`  | `default-session` | WPPConnect session name            |
| `LOG_LEVEL`   | `info`            | Winston log level                  |

### 3. Start the server

```bash
npm start
```

On first run, a QR code is printed to the terminal. Scan it with WhatsApp on your phone.  
The session token is saved in `./sessions/` — subsequent starts will not require a QR scan.

---

## API Reference

### Health check

```
GET /health
```

---

### Send a single message

```
POST /send
Content-Type: application/json

{
  "number": "919800000000",
  "message": "Hello from the API!",
  "session": "default-session"   // optional
}
```

**Response**
```json
{
  "success": true,
  "result": { "number": "919800000000", "status": "sent" }
}
```

---

### Bulk send (JSON)

```
POST /bulk-send
Content-Type: application/json

{
  "numbers": ["919800000000", "917000000000"],
  "message": "Hello message",
  "session": "default-session"   // optional
}
```

Messages are queued and sent **sequentially** with a 5–10 s random delay between each.  
The endpoint returns immediately with job IDs.

**Response**
```json
{
  "success": true,
  "queued": 2,
  "duplicates": 0,
  "jobs": [
    { "number": "919800000000", "jobId": "uuid-1", "status": "queued" },
    { "number": "917000000000", "jobId": "uuid-2", "status": "queued" }
  ]
}
```

---

### Bulk send (CSV upload)

```
POST /bulk-send/csv
Content-Type: multipart/form-data

file=<numbers.csv>
message=Hello message
session=default-session   (optional)
```

CSV format — any of these work:

```csv
number
919800000000
917000000000
```

```csv
phone,name
919800000000,Alice
917000000000,Bob
```

---

### Queue status

```
GET /queue                  # all jobs
GET /queue?status=pending   # filter: pending | sent | failed
GET /queue/:jobId           # single job
```

---

### Incoming messages (webhook)

```
GET /webhook/messages?limit=50
```

Returns the last N messages received on the WhatsApp session.

---

## Key Design Decisions

| Concern | Approach |
|---|---|
| Anti-ban | Sequential send + 5–10 s random delay between messages |
| Retry | Max 2 retries per message with 3 s delay between attempts |
| Deduplication | Pending jobs with same (session + chatId + message) are skipped |
| Rate limiting | 30 requests / minute per IP via `express-rate-limit` |
| Multi-session | `getSession(name)` registry in `whatsapp/client.js` — add sessions by name |
| Logging | Winston: coloured console + rotating file logs in `./logs/` |
| CSV | `multer` memory storage + `csv-parse` — no temp files written to disk |

---

## Postman Examples

Import the following as a Postman collection or use the curl equivalents.

```bash
# Single send
curl -X POST http://localhost:3000/send \
  -H "Content-Type: application/json" \
  -d '{"number":"919800000000","message":"Hi there!"}'

# Bulk send
curl -X POST http://localhost:3000/bulk-send \
  -H "Content-Type: application/json" \
  -d '{"numbers":["919800000000","917000000000"],"message":"Hello everyone!"}'

# CSV bulk send
curl -X POST http://localhost:3000/bulk-send/csv \
  -F "file=@numbers.csv" \
  -F "message=Hello from CSV!"

# Queue status
curl http://localhost:3000/queue
curl http://localhost:3000/queue?status=failed
curl http://localhost:3000/queue/<jobId>

# Incoming messages
curl http://localhost:3000/webhook/messages?limit=20
```
