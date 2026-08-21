const WebSocket = require('ws');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PORT_FILE = path.join(
  os.homedir(),
  'Library/Application Support/Google/Chrome/DevToolsActivePort'
);

function readEndpoint() {
  if (!fs.existsSync(PORT_FILE)) {
    throw new Error(
      'DevToolsActivePort not found. Open chrome://inspect/#remote-debugging in ' +
        'Chrome, tick "Allow remote debugging for this browser instance", and click Allow.'
    );
  }
  const [port, wsPath] = fs.readFileSync(PORT_FILE, 'utf8').trim().split('\n');
  if (!port || !wsPath) throw new Error('DevToolsActivePort is malformed.');
  return `ws://127.0.0.1:${port}${wsPath}`;
}

function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl, {
      perMessageDeflate: false,
      maxPayload: 256 * 1024 * 1024,
    });
    let nextId = 0;
    const pending = new Map();
    const listeners = [];

    const rejectPending = (err) => {
      for (const { reject: rejectRequest, timer } of pending.values()) {
        clearTimeout(timer);
        rejectRequest(err);
      }
      pending.clear();
    };

    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.id && pending.has(msg.id)) {
        const { resolve: res, reject: rej, timer } = pending.get(msg.id);
        pending.delete(msg.id);
        clearTimeout(timer);
        if (msg.error) rej(new Error(JSON.stringify(msg.error)));
        else res(msg.result);
      } else if (msg.method) {
        listeners.forEach((fn) => fn(msg));
      }
    });

    ws.on('error', (err) => {
      const wrapped = new Error(
        `Could not reach Chrome at ${wsUrl}: ${err.message}. ` +
          'Chrome may have restarted — re-enable remote debugging at chrome://inspect/#remote-debugging.'
      );
      rejectPending(wrapped);
      reject(wrapped);
    });

    ws.on('close', () => {
      rejectPending(new Error('Chrome DevTools connection closed.'));
    });

    ws.on('open', () =>
      resolve({
        send(method, params = {}, sessionId, timeoutMs = 30000) {
          return new Promise((res, rej) => {
            const id = ++nextId;
            const timer = setTimeout(() => {
              pending.delete(id);
              rej(new Error(`Chrome DevTools request timed out: ${method}`));
            }, timeoutMs);
            pending.set(id, { resolve: res, reject: rej, timer });
            const payload = { id, method, params };
            if (sessionId) payload.sessionId = sessionId;
            ws.send(JSON.stringify(payload));
          });
        },
        on(fn) {
          listeners.push(fn);
        },
        close() {
          ws.close();
        },
      })
    );
  });
}

async function browserClient() {
  return connect(readEndpoint());
}

async function pageTargets(client, urlFilter) {
  const { targetInfos } = await client.send('Target.getTargets');
  return targetInfos.filter(
    (t) => t.type === 'page' && (!urlFilter || (t.url || '').includes(urlFilter))
  );
}

async function attach(client, targetId) {
  const { sessionId } = await client.send('Target.attachToTarget', {
    targetId,
    flatten: true,
  });
  await client.send('Runtime.enable', {}, sessionId);
  return sessionId;
}

async function evaluate(client, sessionId, expression) {
  const r = await client.send(
    'Runtime.evaluate',
    { expression, returnByValue: true, awaitPromise: true },
    sessionId
  );
  if (r.exceptionDetails) {
    throw new Error(
      r.exceptionDetails.exception?.description || 'evaluation failed'
    );
  }
  return r.result.value;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = {
  browserClient,
  pageTargets,
  attach,
  evaluate,
  sleep,
  readEndpoint,
};
