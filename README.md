# Ably Push Notifications Demo

A simple browser demo for sending and receiving push notifications via [Ably](https://ably.com).
This page wont store your API key, but it is recommended to create a new API KEY for testing.

## Requirements

- An [Ably account](https://ably.com/sign-up) and API key
- The API key must have the following capabilities on the `push:*` namespace (or all channels):
  - `subscribe`
  - `publish`
  - `push-subscribe`
- Python 3 (or any static file server — service workers require HTTP, not `file://`)

## Running locally

```bash
cd path/to/push-notifications
python3 -m http.server 8080
```

Then open **http://localhost:8080** in your browser.

## Using the demo

1. **Enter your API key** in the Connection card and click **Connect**
2. **Click Subscribe** — this registers the service worker and requests notification permission
3. **Publish a text message** — triggers a browser notification
4. **Publish a data message** — delivered silently; logged to the page and browser console only

## URL parameters

You can pre-fill the API key and channel via query params (useful during development):

```
http://localhost:8080?key=YOUR_API_KEY&channel=push:demo
```

## Files

| File                | Purpose                                                   |
| ------------------- | --------------------------------------------------------- |
| `index.html`        | UI and styles                                             |
| `app.js`            | Ably SDK initialisation, channel subscribe, publish logic |
| `service-worker.js` | Handles background push events and notification clicks    |
