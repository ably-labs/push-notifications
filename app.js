/* ── app.js — Ably Push Notifications ── */

const SW_PATH = '/service-worker.js';

let ably = null;
let channel = null;

/* ── Logging ── */
function log(msg, type = 'info') {
  const list = document.getElementById('log');
  const li = document.createElement('li');
  li.className = type;
  const ts = new Date().toLocaleTimeString();
  li.innerHTML = `<span class="ts">${ts}</span><span>${msg}</span>`;
  list.prepend(li);
}

/* ── Badge helpers ── */
function setBadge(id, label, state) {
  const el = document.getElementById(id);
  el.textContent = label;
  el.className = `badge ${state}`;
}

/* ── Button helpers ── */
function setButtons(connected) {
  document.getElementById('connect-btn').disabled = connected;
  document.getElementById('disconnect-btn').disabled = !connected;
  document.getElementById('subscribe-btn').disabled = !connected;
  document.getElementById('publish-btn').disabled = !connected;
  document.getElementById('publish-data-btn').disabled = !connected;
}

/* ── Service Worker registration ── */
async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    log('Service workers not supported in this browser', 'err');
    return null;
  }
  try {
    const reg = await navigator.serviceWorker.register(SW_PATH);
    log(`Service worker registered (scope: ${reg.scope})`, 'success');
    return reg;
  } catch (err) {
    log(`Service worker registration failed: ${err.message}`, 'err');
    return null;
  }
}

/* ── Notification permission ── */
async function requestNotificationPermission() {
  if (!('Notification' in window)) {
    setBadge('notif-badge', 'Not supported', 'error');
    return false;
  }

  let permission = Notification.permission;
  if (permission === 'default') {
    permission = await Notification.requestPermission();
  }

  if (permission === 'granted') {
    setBadge('notif-badge', 'Granted', 'ok');
    log('Notification permission granted', 'success');
    return true;
  } else {
    setBadge('notif-badge', 'Denied', 'error');
    log('Notification permission denied', 'err');
    return false;
  }
}

/* ── Connect ── */
async function connectAbly() {
  const apiKey = document.getElementById('api-key-input').value.trim();
  if (!apiKey) {
    log('Please enter an Ably API key', 'err');
    return;
  }

  setBadge('connection-badge', 'Connecting…', 'pending');
  log('Connecting to Ably…');

  try {
    ably = new Ably.Realtime({ key: apiKey, clientId: 'push-demo-client' });

    ably.connection.on('connected', () => {
      setBadge('connection-badge', 'Connected', 'ok');
      log(`Connected — client ID: ${ably.auth.clientId || 'anonymous'}`, 'success');
      setButtons(true);
    });

    ably.connection.on('disconnected', () => {
      setBadge('connection-badge', 'Disconnected', 'idle');
      log('Disconnected from Ably');
      setButtons(false);
      setBadge('push-badge', 'Not subscribed', 'idle');
    });

    ably.connection.on('failed', (err) => {
      setBadge('connection-badge', 'Failed', 'error');
      log(`Connection failed: ${err?.reason?.message || 'Unknown error'}`, 'err');
      setButtons(false);
    });
  } catch (err) {
    setBadge('connection-badge', 'Error', 'error');
    log(`Failed to initialise Ably: ${err.message}`, 'err');
  }
}

/* ── Publish ── */
async function publishMessage() {
  if (!ably) { log('Not connected', 'err'); return; }
  const channelName = document.getElementById('channel-input').value.trim() || 'push:demo';
  const text = document.getElementById('publish-input').value.trim();
  if (!text) { log('Enter a message to publish', 'err'); return; }
  try {
    const ch = ably.channels.get(channelName);
    await ch.publish('message', text);
    log(`📤 Published to [${channelName}]: ${text}`, 'success');
  } catch (err) {
    log(`Publish failed: ${err.message}`, 'err');
  }
}

/* ── Publish data ── */
async function publishData() {
  if (!ably) { log('Not connected', 'err'); return; }
  const channelName = document.getElementById('channel-input').value.trim() || 'push:demo';
  const raw = document.getElementById('publish-data-input').value.trim();
  if (!raw) { log('Enter a JSON payload to publish', 'err'); return; }

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    log('Invalid JSON — check your data payload', 'err');
    return;
  }

  try {
    const ch = ably.channels.get(channelName);
    console.log('[Ably] Data message publishing:', data);
    await ch.publish('data', data);
    log(`📤 Published data to [${channelName}]`, 'success');
  } catch (err) {
    log(`Publish failed: ${err.message}`, 'err');
  }
}

/* ── Disconnect ── */
function disconnectAbly() {
  if (ably) {
    ably.close();
    ably = null;
    channel = null;
  }
  setBadge('connection-badge', 'Disconnected', 'idle');
  setBadge('push-badge', 'Not subscribed', 'idle');
  setButtons(false);
  document.getElementById('unsubscribe-btn').disabled = true;
  log('Disconnected');
}

/* ── Subscribe to push ── */
async function subscribePush() {
  if (!ably) {
    log('Not connected to Ably', 'err');
    return;
  }

  const channelName = document.getElementById('channel-input').value.trim() || 'push:demo';

  // 1. Register service worker
  const swReg = await registerServiceWorker();
  if (!swReg) return;

  // 2. Request notification permission
  const permitted = await requestNotificationPermission();
  if (!permitted) return;

  // 3. Subscribe to Ably channel for real-time messages
  try {
    channel = ably.channels.get(channelName);

    channel.subscribe((message) => {
      const isData = message.name === 'data';
      console.log(`[Ably] ${isData ? 'Data' : 'Message'} received:`, { name: message.name, data: message.data, timestamp: message.timestamp });
      log(`📨 [${message.name}] ${JSON.stringify(message.data)}`);

      // Only show a notification for non-data messages
      if (!isData && Notification.permission === 'granted') {
        new Notification('Ably Push', {
          body: typeof message.data === 'string'
            ? message.data
            : JSON.stringify(message.data),
          icon: '/favicon.ico',
        });
      }
    });

    setBadge('push-badge', 'Subscribed', 'ok');
    log(`Subscribed to channel: ${channelName}`, 'success');

    document.getElementById('subscribe-btn').disabled = true;
    document.getElementById('unsubscribe-btn').disabled = false;
  } catch (err) {
    setBadge('push-badge', 'Error', 'error');
    log(`Failed to subscribe: ${err.message}`, 'err');
  }
}

/* ── Unsubscribe from push ── */
function unsubscribePush() {
  if (channel) {
    channel.unsubscribe();
    channel.detach();
    channel = null;
  }
  setBadge('push-badge', 'Not subscribed', 'idle');
  log('Unsubscribed from push channel');
  document.getElementById('subscribe-btn').disabled = false;
  document.getElementById('unsubscribe-btn').disabled = true;
}

/* ── Init ── */
(async function init() {
  // Check notification support on load
  if (!('Notification' in window)) {
    setBadge('notif-badge', 'Not supported', 'error');
  } else {
    const perm = Notification.permission;
    const labels = { granted: ['Granted', 'ok'], denied: ['Denied', 'error'], default: ['Not asked', 'idle'] };
    const [label, state] = labels[perm] || ['Unknown', 'idle'];
    setBadge('notif-badge', label, state);
  }

  // Pre-fill API key from URL param ?key=... (handy for dev)
  const params = new URLSearchParams(window.location.search);
  if (params.get('key')) {
    document.getElementById('api-key-input').value = params.get('key');
  }
  if (params.get('channel')) {
    document.getElementById('channel-input').value = params.get('channel');
  }

  log('Page loaded — enter your API key to connect');
})();
