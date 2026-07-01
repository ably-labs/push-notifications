/* ── app.js — Ably Push Notifications ── */

const SW_PATH = '/service-worker.js';

let ably = null;
let channel = null;

/* ── Theme toggle ── */
function toggleTheme() {
  const html = document.documentElement;
  const isDark = html.getAttribute('data-theme') === 'dark';
  const next = isDark ? 'light' : 'dark';
  html.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
  document.getElementById('theme-btn').textContent = next === 'dark' ? '☀️ Light' : '🌙 Dark';
}

// Sync button label on load
(function syncThemeBtn() {
  const onLoad = () => {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const btn = document.getElementById('theme-btn');
    if (btn) btn.textContent = isDark ? '☀️ Light' : '🌙 Dark';
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', onLoad);
  else onLoad();
})();

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
  document.getElementById('direct-publish-btn').disabled = !connected;
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
    ably = new Ably.Realtime({
      key: apiKey,
      clientId: 'push-demo-client',
      plugins: { Push: AblyPushPlugin },
      pushServiceWorkerUrl: '/service-worker.js',
    });

    ably.connection.on('connected', () => {
      setBadge('connection-badge', 'Connected', 'ok');
      const clientId = ably.auth.clientId || 'anonymous';
      document.getElementById('client-id-display').textContent = clientId;
      log(`Connected — client ID: ${clientId}`, 'success');
      setButtons(true);
    });

    ably.connection.on('disconnected', () => {
      setBadge('connection-badge', 'Disconnected', 'idle');
      document.getElementById('client-id-display').textContent = '—';
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
  const title = document.getElementById('publish-notif-title').value.trim() || 'Ably Push';
  const body = document.getElementById('publish-notif-body').value.trim() || text;
  const raw = document.getElementById('publish-data-input').value.trim();
  if (!text) { log('Enter a message to publish', 'err'); return; }

  let data = undefined;
  if (raw) {
    try { data = JSON.parse(raw); } catch { log('Invalid JSON in data field', 'err'); return; }
  }

  try {
    const ch = ably.channels.get(channelName);
    await ch.publish({
      name: 'message',
      data: text,
      extras: { push: { notification: { title, body }, ...(data && { data }) } },
    });
    log(`📤 Published to channel [${channelName}]: ${text}`, 'success');
  } catch (err) {
    log(`Publish failed: ${err.message}`, 'err');
  }
}

/* ── Publish direct push (no channel message) ── */
async function publishDirect() {
  if (!ably) { log('Not connected', 'err'); return; }
  const title = document.getElementById('direct-notif-title').value.trim();
  const body = document.getElementById('direct-notif-body').value.trim();
  const raw = document.getElementById('direct-data-input').value.trim();
  const clientId = document.getElementById('direct-client-id').value.trim();
  if (!clientId) { log('Enter a client ID to target', 'err'); return; }

  let data = undefined;
  if (raw) {
    try { data = JSON.parse(raw); } catch { log('Invalid JSON in data field', 'err'); return; }
  }

  try {
    // clientId could be switched for deviceID here
    await ably.push.admin.publish(
      { clientId },
      { notification: { title, body }, ...(data && { data }) }
    );
    log(`📤 Direct push sent to clientId [${clientId}]`, 'success');
  } catch (err) {
    log(`Direct push failed: ${err.message}`, 'err');
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

  // 1. Activate push
  try {
    log('Activating push…');
    await ably.push.activate();
    const deviceId = ably.device().id;
    document.getElementById('device-id-display').textContent = deviceId;
    log('Push activated', 'success');
  } catch (err) {
    setBadge('push-badge', 'Error', 'error');
    log(`Push activation failed: ${err.message}`, 'err');
    return;
  }

  // 2. Subscribe device to channel push + Realtime for in-page event log
  try {
    channel = ably.channels.get(channelName);
    await channel.push.subscribeDevice();


    channel.subscribe((message) => {
      const isData = message.name === 'data';
      console.log(message.name);
      console.log(`[Ably] ${isData ? 'Data' : 'Message'} received:`, { message });
      if (message.name) {
        log(`📨 [${message.name}] ${JSON.stringify(message.data)}`);
      }
      else if (message.extras.push) {
        log(`📨 [Notification Message] ${JSON.stringify(message.extras.push)}`);
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

  // Pre-fill from config.js (gitignored local dev file)
  const cfg = window.ABLY_CONFIG || {};
  if (cfg.apiKey) document.getElementById('api-key-input').value = cfg.apiKey;
  if (cfg.channel) document.getElementById('channel-input').value = cfg.channel;

  // URL params override config
  const params = new URLSearchParams(window.location.search);
  if (params.get('key')) document.getElementById('api-key-input').value = params.get('key');
  if (params.get('channel')) document.getElementById('channel-input').value = params.get('channel');

  log('Page loaded — enter your API key to connect');
})();
