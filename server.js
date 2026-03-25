/**
 * server.js — Node.js Server
 *
 * Serves static files from ./data/ and provides a WebSocket relay
 * for the phone remote control feature.
 * Also exposes GET /api/qr?url=<encoded> to generate QR code PNGs.
 * Includes a visit counter stored in /connections.txt.
 */

const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const QRCode = require('qrcode');
const path = require('path');
const fs = require('fs');

const PORT = process.env.PORT || 80;

const app = express();

/* ------------------------------------------------------------------ */
/*  Gestione Contatore Visite (/connections.txt)                       */
/* ------------------------------------------------------------------ */

const CONNECTIONS_FILE = '/connectionsCounter.txt';
let totalConnections = 0;

// 1. On server start, read the file to retrieve the saved value
try {
  if (fs.existsSync(CONNECTIONS_FILE)) {
    const data = fs.readFileSync(CONNECTIONS_FILE, 'utf-8');
    totalConnections = parseInt(data.trim(), 10) || 0;
    console.log(`[server] Visit counter restored to: ${totalConnections}`);
  } else {
    // If the file does not exist, create it initialized to 0
    fs.writeFileSync(CONNECTIONS_FILE, '0', 'utf-8');
    console.log(`[server] File connections.txt created initialized to 0`);
  }
} catch (err) {
  console.error('[server] Error reading/writing file connections.txt:', err);
}

// 2. Middleware to increment the counter for user visits
app.use((req, res, next) => {
  if (req.path === '/' || req.path.endsWith('.html')) {
    // Simple cookie parsing
    const cookies = req.headers.cookie
      ? Object.fromEntries(req.headers.cookie.split('; ').map(c => c.split('=')))
      : {};

    if (!cookies.pdf_presenter_visited) {
      totalConnections++;

      // Set a persistent cookie for 1 year
      res.setHeader('Set-Cookie', 'pdf_presenter_visited=true; Max-Age=86400; Path=/; HttpOnly; SameSite=Lax');

      // Async writing to avoid blocking requests
      fs.writeFile(CONNECTIONS_FILE, totalConnections.toString(), (err) => {
        if (err) console.error('[server] Error writing to connections.txt:', err);
      });

      console.log(`[server] New unique visit! Total: ${totalConnections} (${req.path})`);
    }
  }
  next();
});

/* ------------------------------------------------------------------ */
/*  Express — static files                                             */
/* ------------------------------------------------------------------ */

// HTML files: always revalidate (network-first strategy support)
app.use((req, res, next) => {
  if (req.path === '/' || req.path.endsWith('.html')) {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
  next();
});

app.use(express.static(path.join(__dirname, 'dist')));

/* ---- QR code endpoint ---- */

app.get('/api/qr', async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).send('Missing url parameter');

  try {
    const buffer = await QRCode.toBuffer(url, {
      width: 300,
      margin: 2,
      color: { dark: '#e6edf3', light: '#0d1117' },
    });
    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'no-store');
    res.send(buffer);
  } catch (err) {
    console.error('[server] QR generation error:', err);
    res.status(500).send('QR generation failed');
  }
});

/* ------------------------------------------------------------------ */
/*  HTTP server                                                        */
/* ------------------------------------------------------------------ */

const server = http.createServer(app);

/* ------------------------------------------------------------------ */
/*  WebSocket — remote control relay                                   */
/* ------------------------------------------------------------------ */

const wss = new WebSocketServer({ server, path: '/ws' });

/**
 * Sessions map: sessionId → { presenter: WebSocket, remotes: Set<WebSocket>, qaClients: Set<WebSocket> }
 */
const sessions = new Map();

wss.on('connection', (ws) => {
  let role = null;       // 'presenter' | 'remote' | 'qa-audience'
  let sessionId = null;

  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch (_) {
      return;
    }

    switch (msg.type) {

      /* ---- Presenter creates a session ---- */
      case 'create-session': {
        sessionId = msg.sessionId;
        role = 'presenter';

        // Clean up existing session with same ID
        if (sessions.has(sessionId)) {
          const old = sessions.get(sessionId);
          old.remotes.forEach((r) => {
            try { r.close(1000, 'session-reset'); } catch (_) {}
          });
          if (old.qaClients) {
            old.qaClients.forEach((r) => {
              try { r.close(1000, 'session-reset'); } catch (_) {}
            });
          }
        }

        sessions.set(sessionId, { presenter: ws, remotes: new Set(), qaClients: new Set() });
        ws.send(JSON.stringify({ type: 'session-created', sessionId }));
        console.log(`[ws] Session created: ${sessionId}`);
        break;
      }

      /* ---- Phone joins a session ---- */
      case 'join-session': {
        sessionId = msg.sessionId;
        role = 'remote';

        const session = sessions.get(sessionId);
        if (!session || !session.presenter || session.presenter.readyState !== 1) {
          ws.send(JSON.stringify({ type: 'error', message: 'Session not found' }));
          ws.close(4004, 'session-not-found');
          return;
        }

        session.remotes.add(ws);
        ws.send(JSON.stringify({ type: 'session-joined', sessionId }));

        // Notify presenter
        session.presenter.send(JSON.stringify({
          type: 'remote-joined',
          remoteCount: session.remotes.size,
        }));

        console.log(`[ws] Remote joined session ${sessionId} (${session.remotes.size} remotes)`);
        break;
      }

      /* ---- Q&A audience joins a session ---- */
      case 'join-qa': {
        sessionId = msg.sessionId;
        role = 'qa-audience';

        const qaSession = sessions.get(sessionId);
        if (!qaSession || !qaSession.presenter || qaSession.presenter.readyState !== 1) {
          ws.send(JSON.stringify({ type: 'error', message: 'Session not found' }));
          ws.close(4004, 'session-not-found');
          return;
        }

        qaSession.qaClients.add(ws);
        ws.send(JSON.stringify({ type: 'qa-joined', sessionId }));
        console.log(`[ws] Q&A audience joined session ${sessionId} (${qaSession.qaClients.size} qa clients)`);
        break;
      }

      /* ---- Q&A audience submits a question ---- */
      case 'qa-submit': {
        if (role !== 'qa-audience' || !sessionId) return;
        const qaS = sessions.get(sessionId);
        if (qaS && qaS.presenter && qaS.presenter.readyState === 1) {
          qaS.presenter.send(JSON.stringify({
            type: 'qa-question',
            text: String(msg.text || '').slice(0, 500),
            timestamp: Date.now(),
          }));
        }
        break;
      }

      /* ---- Phone sends a command (next/prev) ---- */
      case 'remote-command': {
        if (role !== 'remote' || !sessionId) return;
        const session = sessions.get(sessionId);
        if (session && session.presenter && session.presenter.readyState === 1) {
          session.presenter.send(JSON.stringify({
            type: 'remote-command',
            command: msg.command,
          }));
        }
        break;
      }

      /* ---- Presenter pushes state to all remotes ---- */
      case 'state-update': {
        if (role !== 'presenter' || !sessionId) return;
        const session = sessions.get(sessionId);
        if (!session) return;

        const update = JSON.stringify({
          type: 'state-update',
          currentPage: msg.currentPage,
          totalPages: msg.totalPages,
        });

        session.remotes.forEach((r) => {
          if (r.readyState === 1) r.send(update);
        });
        break;
      }
    }
  });

  ws.on('close', () => {
    if (!sessionId) return;
    const session = sessions.get(sessionId);
    if (!session) return;

    if (role === 'presenter') {
      // Notify all remotes and Q&A clients and destroy session
      const closedMsg = JSON.stringify({ type: 'session-closed' });
      session.remotes.forEach((r) => {
        try { r.send(closedMsg); r.close(1000, 'presenter-left'); } catch (_) {}
      });
      session.qaClients.forEach((r) => {
        try { r.send(closedMsg); r.close(1000, 'presenter-left'); } catch (_) {}
      });
      sessions.delete(sessionId);
      console.log(`[ws] Session destroyed: ${sessionId}`);
    } else if (role === 'remote') {
      session.remotes.delete(ws);
      // Notify presenter of updated count
      if (session.presenter && session.presenter.readyState === 1) {
        session.presenter.send(JSON.stringify({
          type: 'remote-left',
          remoteCount: session.remotes.size,
        }));
      }
      console.log(`[ws] Remote left session ${sessionId} (${session.remotes.size} remotes)`);
    } else if (role === 'qa-audience') {
      session.qaClients.delete(ws);
      console.log(`[ws] Q&A audience left session ${sessionId} (${session.qaClients.size} qa clients)`);
    }
  });
});

/* ---- Heartbeat: detect dead connections ---- */

const heartbeat = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

wss.on('close', () => clearInterval(heartbeat));

/* ------------------------------------------------------------------ */
/*  Start                                                              */
/* ------------------------------------------------------------------ */

server.listen(PORT, () => {
  console.log(`[server] PDF Presentation Tool running on port ${PORT}`);
});