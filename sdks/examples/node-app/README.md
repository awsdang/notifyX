# NotifyX Node.js Integration Example

A minimal Express server demonstrating NotifyX API integration.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/webhooks/notifyx` | Receive webhook callbacks (with HMAC verification) |
| POST | `/fire-event` | Fire an automation trigger event |
| POST | `/register-device` | Register a user + push device |
| POST | `/send-notification` | Send a push notification |

## Setup

```bash
npm install
```

## Run

```bash
NOTIFYX_URL=http://localhost:3000/api/v1 \
NOTIFYX_API_KEY=your_api_key \
npm start
```

Optional: set `NOTIFYX_WEBHOOK_SECRET` for signature verification.

## Examples

**Fire an automation event:**
```bash
curl -X POST http://localhost:4000/fire-event \
  -H "Content-Type: application/json" \
  -d '{
    "eventName": "order_paid",
    "appId": "app_xxx",
    "userId": "user_123",
    "payload": { "total": 49.99 }
  }'
```

**Send a notification:**
```bash
curl -X POST http://localhost:4000/send-notification \
  -H "Content-Type: application/json" \
  -d '{
    "appId": "app_xxx",
    "userIds": ["user_123"],
    "title": "Hello!",
    "body": "Your order is ready."
  }'
```

**Register a device:**
```bash
curl -X POST http://localhost:4000/register-device \
  -H "Content-Type: application/json" \
  -d '{
    "appId": "app_xxx",
    "userId": "user_123",
    "pushToken": "fcm_token_...",
    "platform": "android"
  }'
```
