# FlareDrop

Self-hostable AirDrop alternative powered by Cloudflare Workers.

## Features

- **Cloudflare Workers**: Single deployment handles UI, file relay, and authentication
- **Email Authentication**: Verify identity via Cloudflare Email Routing
- **QR Code Pairing**: Add devices by scanning QR codes
- **Web Share Target**: Appears in mobile share menus
- **Web Push Notifications**: Get notified when files arrive
- **No Service Worker Dependency**: Works on iOS Safari

## Setup

### Prerequisites

- Cloudflare account with Workers enabled
- Domain with Cloudflare Email Routing configured
- Wrangler CLI installed (`npm install -g wrangler`)

### Installation

1. Clone and install dependencies:

```bash
git clone https://github.com/yourusername/flaredrop
cd flaredrop
npm install
```

2. Configure your authorized email in `wrangler.toml`:

```toml
[vars]
AUTHORIZED_EMAIL = "your-email@example.com"
```

3. Create D1 database:

```bash
wrangler d1 create flaredrop-db
```

4. Update `wrangler.toml` with the database ID from the output.

5. Create KV namespace:

```bash
wrangler kv:namespace create FILES
```

6. Update `wrangler.toml` with the KV namespace ID.

7. Deploy:

```bash
npm run deploy
```

### Email Routing Setup

1. Go to Cloudflare Dashboard > Email > Email Routing
2. Add a catch-all rule that forwards to your Worker
3. Or create specific routes like `verify-*@yourdomain.com`

## Usage

### First Device

1. Visit your FlareDrop URL
2. Enter your authorized email
3. Send an email to the verification address (shown in dev mode) or click the link
4. Name your device

### Additional Devices

1. On an authenticated device, click "Show QR Code"
2. Scan the QR code with your new device
3. Name the new device

### Sharing Files

1. Select files or drop them on the page
2. Choose the target device
3. Click Send
4. The recipient gets a notification and can download the file

### Mobile (Web Share Target)

After installing the PWA:
1. Share from any app
2. Select FlareDrop
3. Choose the target device

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                 Cloudflare Workers                   │
├─────────────────────────────────────────────────────┤
│  UI (HTML/JS)  │  File Relay  │  Auth Provider      │
├─────────────────────────────────────────────────────┤
│  D1 Database   │  KV Storage  │  Durable Objects    │
│  (devices,     │  (files,     │  (WebSocket         │
│   sessions)    │   24h TTL)   │   relay)            │
└─────────────────────────────────────────────────────┘
         │                              │
         │  Email Routing               │  Web Push
         ▼                              ▼
    ┌─────────┐                   ┌─────────┐
    │  Email  │                   │ Device  │
    │  Inbox  │                   │ Browser │
    └─────────┘                   └─────────┘
```

## Development

```bash
npm run dev
```

This starts a local development server. In dev mode, verification links are shown directly instead of requiring email.

## Limitations

- Maximum file size: 100MB (KV limit)
- Files expire after 24 hours
- Push notifications require VAPID setup for production

## License

MIT
