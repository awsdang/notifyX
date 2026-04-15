# NotifyX Automation Triggers — Web Demo

A single-page app to fire automation trigger events via the NotifyX API.

## Setup

1. Open `index.html` in a browser
2. Enter your API URL (default: `http://localhost:3000/api/v1`)
3. Enter your API key
4. Enter your App ID

## Usage

- Select a pre-built event template (order_paid, user_signup, cart_abandoned) or enter a custom event name
- Edit the JSON payload as needed
- Click **Fire Event** to POST to `/api/v1/events/:eventName`
- Click **List Triggers** to see all configured triggers for your app
- Responses appear in the log panel on the right
