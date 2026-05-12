# WPPConnect WhatsApp Messaging API

Multi-device WhatsApp bulk messaging system built with Node.js, Express, and WPPConnect.

---

## Table of Contents

- [Architecture](#architecture)
- [Setup](#setup)
- [Environment Variables](#environment-variables)
- [Authentication](#authentication)
- [Complete API Reference](#complete-api-reference)
  - [Health](#health)
  - [Device Management](#device-management)
  - [QR Code & Session](#qr-code--session)
  - [Send Messages](#send-messages)
  - [Bulk Send](#bulk-send)
  - [CSV Bulk Send](#csv-bulk-send)
  - [Queue Status](#queue-status)
  - [Incoming Messages](#incoming-messages)
- [Full Workflow](#full-workflow)
- [Postman Setup](#postman-setup)
- [Folder Structure](#folder-structure)

---

## Architecture

```
One server → unlimited WhatsApp devices
Each device gets a unique SECRET TOKEN
Token = identity + auth for all device operations
```

**Two levels of auth:**

| Level | Used for | How |
|---|---|---|
| Master API Key | Create / list / delete devices | `x-api-key` header |
| Device Token | QR scan, send messages, queue | URL path `/:token/` |

---

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Copy env file
cp .env.example .env

# 3. Edit .env — set API_KEY and SESSION_PATH
nano .env

# 4. Start server
npm start          # production
npm run dev        # development (nodemon)
```

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `NODE_ENV` | `development` | Set to `production` on server |
| `PORT` | `8086` | HTTP server port |
| `API_KEY` | — | Master API key (required in production) |
| `SESSION_PATH` | `./sessions` | Where session tokens are stored |
| `MSG_MIN_DELAY` | `5000` | Min delay between bulk messages (ms) |
| `MSG_MAX_DELAY` | `10000` | Max delay between bulk messages (ms) |
| `MSG_MAX_RETRIES` | `2` | Max retries per failed message |
| `MSG_RETRY_DELAY` | `3000` | Delay between retries (ms) |
| `RATE_LIMIT_MAX` | `30` | Max requests per minute per IP |
| `CHROMIUM_PATH` | auto | Path to Chromium binary (Linux servers) |

---

## Authentication

### Master API Key
Required for device management endpoints. Send in header:
```
x-api-key: YOUR_API_KEY
```
Or as query param: `?api_key=YOUR_API_KEY`

### Device Token
A UUID generated when you create a device. Used directly in the URL path — no extra header needed. Keep it secret — anyone with the token can send messages from that WhatsApp account.

---

## Complete API Reference

Base URL: `http://YOUR_SERVER:8086`

---

### Health

#### `GET /health`
Check if the server is running. No auth required.

**Response:**
```json
{
  "status": "ok",
  "env": "production",
  "uptime": 3600.5
}
```

---

### Device Management

All device management endpoints require the master `x-api-key` header.

---

#### `POST /devices` — Create a new device

Creates a new WhatsApp device slot and returns a secret token. Immediately starts the WhatsApp session in the background.

**Headers:**
```
x-api-key: YOUR_API_KEY
Content-Type: application/json
```

**Body:**
```json
{
  "label": "My iPhone"
}
```
`label` is optional. If omitted, the session name is used.

**Response `201`:**
```json
{
  "success": true,
  "message": "Device created. Open the qrcode_url in your browser to scan.",
  "device": {
    "token": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "label": "My iPhone",
    "session": "device-a1b2c3d4",
    "createdAt": "2026-05-11T10:00:00.000Z",
    "qrcode_url": "/devices/a1b2c3d4-e5f6-7890-abcd-ef1234567890/qrcode",
    "status_url": "/devices/a1b2c3d4-e5f6-7890-abcd-ef1234567890/qrcode/status"
  }
}
```

> **Save the `token`** — you need it for all subsequent operations on this device.

---

#### `GET /devices` — List all devices

Returns all registered devices with their live connection status.

**Headers:**
```
x-api-key: YOUR_API_KEY
```

**Response:**
```json
{
  "success": true,
  "count": 2,
  "devices": [
    {
      "token": "a1b2c3d4-...",
      "label": "My iPhone",
      "session": "device-a1b2c3d4",
      "createdAt": "2026-05-11T10:00:00.000Z",
      "status": "connected",
      "isReady": true,
      "qrcode_url": "/devices/a1b2c3d4-.../qrcode"
    },
    {
      "token": "b2c3d4e5-...",
      "label": "Office Phone",
      "session": "device-b2c3d4e5",
      "createdAt": "2026-05-11T11:00:00.000Z",
      "status": "qr_ready",
      "isReady": false,
      "qrcode_url": "/devices/b2c3d4e5-.../qrcode"
    }
  ]
}
```

**Status values:**
| Status | Meaning |
|---|---|
| `launching` | Chromium is starting |
| `loading (50%)` | WhatsApp Web is loading |
| `qr_ready` | QR generated, waiting for scan |
| `connected` | Authenticated and ready |
| `retrying` | Previous attempt failed, retrying |
| `disconnected` | Session dropped |

---

#### `GET /devices/:token` — Get single device

**Headers:**
```
x-api-key: YOUR_API_KEY
```

**Response:**
```json
{
  "success": true,
  "device": {
    "token": "a1b2c3d4-...",
    "label": "My iPhone",
    "session": "device-a1b2c3d4",
    "createdAt": "2026-05-11T10:00:00.000Z",
    "status": "connected",
    "isReady": true
  }
}
```

---

#### `DELETE /devices/:token` — Remove a device

Closes the WhatsApp session and removes the device from the registry.

**Headers:**
```
x-api-key: YOUR_API_KEY
```

**Response:**
```json
{
  "success": true,
  "message": "Device \"My iPhone\" removed."
}
```

---

### QR Code & Session

No master API key needed — the token in the URL is the auth.

---

#### `GET /devices/:token/qrcode` — QR browser page

Open this URL in a browser to scan the QR code and link your WhatsApp account. The page auto-updates via Server-Sent Events — no manual refresh needed.

```
http://YOUR_SERVER:8086/devices/a1b2c3d4-.../qrcode
```

**States shown:**
- Spinner → Chromium is starting
- QR image → Scan with WhatsApp now
- ✅ Connected → Successfully linked

---

#### `GET /devices/:token/qrcode/events` — SSE stream

Server-Sent Events stream for real-time QR updates. Used internally by the QR page. You can also consume it programmatically.

**Event types:**
```
data: {"type":"waiting","status":"launching"}
data: {"type":"qr","qr":"data:image/png;base64,..."}
data: {"type":"connected"}
```

---

#### `GET /devices/:token/qrcode/status` — JSON status

Poll this to check connection state programmatically.

**Response:**
```json
{
  "token": "a1b2c3d4-...",
  "session": "device-a1b2c3d4",
  "status": "connected",
  "isReady": true,
  "hasQR": false
}
```

---

### Send Messages

All messaging endpoints use the device token in the URL. No extra header needed.

---

#### `POST /devices/:token/send` — Send single message

**Headers:**
```
Content-Type: application/json
```

**Body:**
```json
{
  "number": "919800000000",
  "message": "Hello from the API!"
}
```

- `number` — phone number with country code, no `+` or spaces
- `message` — text message to send

**Response:**
```json
{
  "success": true,
  "result": {
    "number": "919800000000",
    "status": "sent"
  }
}
```

**Error (session not ready):**
```json
{
  "success": false,
  "error": "Session \"device-a1b2c3d4\" is not ready. Scan QR at /devices/{token}/qrcode"
}
```

---

### Bulk Send

#### `POST /devices/:token/bulk-send` — Bulk send via JSON

Messages are queued and sent **sequentially** with a 5–10 second random delay between each (anti-ban). Returns immediately with job IDs.

**Headers:**
```
Content-Type: application/json
```

**Body:**
```json
{
  "numbers": ["919800000000", "917000000000", "916000000000"],
  "message": "Hello everyone!"
}
```

**Response:**
```json
{
  "success": true,
  "session": "device-a1b2c3d4",
  "queued": 3,
  "duplicates": 0,
  "jobs": [
    { "number": "919800000000", "jobId": "uuid-1", "status": "queued" },
    { "number": "917000000000", "jobId": "uuid-2", "status": "queued" },
    { "number": "916000000000", "jobId": "uuid-3", "status": "queued" }
  ]
}
```

If a number+message combination is already in the pending queue, it is skipped as a duplicate:
```json
{ "number": "919800000000", "jobId": null, "status": "duplicate" }
```

---

### CSV Bulk Send

#### `POST /devices/:token/bulk-send/csv` — Bulk send via CSV upload

Upload a CSV file containing phone numbers.

**Request:** `multipart/form-data`

| Field | Type | Description |
|---|---|---|
| `file` | File | CSV file (max 2MB) |
| `message` | Text | Message to send |

**CSV format — any of these work:**

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

```csv
919800000000
917000000000
```

**Response:**
```json
{
  "success": true,
  "session": "device-a1b2c3d4",
  "parsed": 2,
  "queued": 2,
  "duplicates": 0,
  "jobs": [...]
}
```

**curl example:**
```bash
curl -X POST http://YOUR_SERVER:8086/devices/TOKEN/bulk-send/csv \
  -F "file=@numbers.csv" \
  -F "message=Hello from CSV!"
```

---

### Queue Status

#### `GET /devices/:token/queue` — List all jobs for this device

**Query params (optional):**
- `?status=pending` — filter by status
- `?status=sent`
- `?status=failed`

**Response:**
```json
{
  "success": true,
  "session": "device-a1b2c3d4",
  "count": 3,
  "jobs": [
    {
      "id": "uuid-1",
      "number": "919800000000",
      "chatId": "919800000000@c.us",
      "message": "Hello!",
      "status": "sent",
      "attempts": 1,
      "error": null,
      "enqueuedAt": "2026-05-11T10:05:00.000Z",
      "processedAt": "2026-05-11T10:05:07.000Z"
    }
  ]
}
```

**Job status values:**
| Status | Meaning |
|---|---|
| `pending` | Waiting in queue |
| `sending` | Currently being sent |
| `sent` | Successfully delivered |
| `failed` | All retries exhausted |
| `duplicate` | Skipped — same message already queued |

---

#### `GET /devices/:token/queue/:jobId` — Get single job

**Response:**
```json
{
  "success": true,
  "job": {
    "id": "uuid-1",
    "number": "919800000000",
    "status": "sent",
    "attempts": 1,
    "error": null,
    "enqueuedAt": "2026-05-11T10:05:00.000Z",
    "processedAt": "2026-05-11T10:05:07.000Z"
  }
}
```

---

### Incoming Messages

#### `GET /devices/:token/messages` — Get received messages

Returns the last N messages received on this WhatsApp account (in-memory, max 200).

**Query params:**
- `?limit=50` — number of messages to return (default 50, max 200)

**Response:**
```json
{
  "success": true,
  "session": "device-a1b2c3d4",
  "count": 2,
  "messages": [
    {
      "from": "919800000000@c.us",
      "body": "Hey, got your message!",
      "type": "chat",
      "timestamp": "2026-05-11T10:10:00.000Z",
      "receivedAt": "2026-05-11T10:10:01.000Z"
    }
  ]
}
```

---

## Full Workflow

### Step 1 — Start the server
```bash
npm start
```

### Step 2 — Create a device
```bash
curl -X POST http://localhost:8086/devices \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -d '{"label": "My iPhone"}'
```

Save the `token` from the response.

### Step 3 — Scan QR code
Open in your browser:
```
http://localhost:8086/devices/YOUR_TOKEN/qrcode
```

On your phone: **WhatsApp → Linked Devices → Link a Device → Scan QR**

Wait for the page to show ✅ Connected.

### Step 4 — Send a message
```bash
curl -X POST http://localhost:8086/devices/YOUR_TOKEN/send \
  -H "Content-Type: application/json" \
  -d '{"number":"919800000000","message":"Hello!"}'
```

### Step 5 — Send bulk messages
```bash
curl -X POST http://localhost:8086/devices/YOUR_TOKEN/bulk-send \
  -H "Content-Type: application/json" \
  -d '{"numbers":["919800000000","917000000000"],"message":"Hello everyone!"}'
```

### Step 6 — Check delivery status
```bash
curl http://localhost:8086/devices/YOUR_TOKEN/queue
curl http://localhost:8086/devices/YOUR_TOKEN/queue?status=failed
```

---

## Postman Setup

1. Create a new **Environment** in Postman:

| Variable | Value |
|---|---|
| `BaseUrl` | `http://localhost:8086` |
| `ApiKey` | `your-api-key-from-env` |
| `Token` | *(paste token after creating device)* |

2. Add header to device management requests:
```
x-api-key : {{ApiKey}}
```

3. Example URLs:
```
GET  {{BaseUrl}}/health
POST {{BaseUrl}}/devices
GET  {{BaseUrl}}/devices
GET  {{BaseUrl}}/devices/{{Token}}/qrcode/status
POST {{BaseUrl}}/devices/{{Token}}/send
POST {{BaseUrl}}/devices/{{Token}}/bulk-send
POST {{BaseUrl}}/devices/{{Token}}/bulk-send/csv
GET  {{BaseUrl}}/devices/{{Token}}/queue
GET  {{BaseUrl}}/devices/{{Token}}/queue/{{jobId}}
GET  {{BaseUrl}}/devices/{{Token}}/messages
```

---

## Folder Structure

```
src/
├── config/
│   └── index.js                  # All config from env vars
├── controllers/
│   ├── deviceController.js       # Create/list/delete devices
│   ├── messageController.js      # Send/bulk-send handlers
│   ├── qrController.js           # QR page + SSE stream
│   └── webhookController.js      # Incoming message store
├── routes/
│   └── index.js                  # All Express routes
├── services/
│   ├── deviceRegistry.js         # Token → session mapping (persisted to JSON)
│   ├── messageQueue.js           # Sequential queue with dedup + retry
│   ├── messagingService.js       # Service layer over queue
│   └── sessionManager.js        # Session lifecycle + auto-retry
├── utils/
│   ├── csvParser.js              # CSV → phone number array
│   ├── helpers.js                # randomDelay, toChatId, validators
│   └── logger.js                 # Winston logger
├── whatsapp/
│   └── client.js                 # WPPConnect session wrapper
└── server.js                     # Bootstrap + graceful shutdown

sessions/
├── device-registry.json          # Persisted token → session map
├── device-a1b2c3d4/              # WPPConnect session tokens per device
└── device-b2c3d4e5/

logs/
├── app.log
└── error.log
```

---

## Key Design Decisions

| Concern | Approach |
|---|---|
| Multi-device | Each device = one Chromium instance + one WPPConnect session |
| Auth | Master API key for management; device token for messaging |
| Anti-ban | Sequential send + 5–10s random delay between messages |
| Retry | Max 2 retries per message, 3s between attempts |
| Deduplication | Same number+message already pending → skipped |
| Session persistence | Tokens saved in `sessions/device-registry.json` — survive restarts |
| Auto-reconnect | Sessions auto-restore from saved tokens on server restart |
| QR delivery | Server-Sent Events — QR appears in browser instantly, no polling |
| Rate limiting | 30 requests/minute per IP |
