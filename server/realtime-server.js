import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Render/Railway/Fly inject PORT. Local development keeps the old 8787 port.
const PORT = Number(process.env.PORT || process.env.MEMORIYA_REALTIME_PORT || 8787);
const distDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const clients = new Map();

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'x-frame-options': 'SAMEORIGIN',
  'cross-origin-opener-policy': 'same-origin-allow-popups',
  'permissions-policy': "camera=(self), microphone=(self), geolocation=(self), payment=(), usb=(), fullscreen=(self)",
  'content-security-policy': "default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' blob: https://apis.google.com https://accounts.google.com https://www.youtube.com https://www.gstatic.com https://s.ytimg.com https://www.googletagmanager.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: blob: https:; media-src 'self' blob: data: https:; connect-src 'self' blob: data: https: wss: ws://127.0.0.1:8787 ws://localhost:8787; frame-src https://www.youtube.com https://www.youtube-nocookie.com https://accounts.google.com https://*.firebaseapp.com https://*.google.com; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'",
};

const sendHttpJson = (res, status, payload) => {
  res.writeHead(status, { ...SECURITY_HEADERS, 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
};

const server = http.createServer((req, res) => {
  const requestUrl = (req.url || '/').split('?')[0];
  if (requestUrl === '/__memoriya-cast' || requestUrl === '/health') {
    sendHttpJson(res, 200, { ok: true, service: 'memoriya-realtime' });
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { allow: 'GET, HEAD' });
    res.end();
    return;
  }
  let pathname = '/';
  try {
    pathname = decodeURIComponent(requestUrl);
  } catch {
    pathname = '/';
  }
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const filePath = path.resolve(distDir, relative);
  if (filePath !== path.join(distDir, 'index.html') && !filePath.startsWith(`${distDir}${path.sep}`)) {
    res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }
  fs.stat(filePath, (error, stats) => {
    const exists = !error && stats.isFile();
    if (!exists && path.extname(relative)) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }
    const target = exists ? filePath : path.join(distDir, 'index.html');
    fs.readFile(target, (readError, data) => {
      if (readError) {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        res.end('Build output is missing. Run "npm run build" before starting the cast server.');
        return;
      }
      const extension = path.extname(target).toLowerCase();
      res.writeHead(200, {
        ...SECURITY_HEADERS,
        'content-type': MIME_TYPES[extension] || 'application/octet-stream',
        'cache-control': extension === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
      });
      if (req.method === 'HEAD') res.end();
      else res.end(data);
    });
  });
});

const encodeFrame = (data, opcode = 0x1) => {
  const payload = Buffer.from(data);
  const length = payload.length;

  if (length < 126) {
    return Buffer.concat([Buffer.from([0x80 | opcode, length]), payload]);
  }

  if (length < 65536) {
    const header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(length, 2);
    return Buffer.concat([header, payload]);
  }

  const header = Buffer.alloc(10);
  header[0] = 0x80 | opcode;
  header[1] = 127;
  header.writeBigUInt64BE(BigInt(length), 2);
  return Buffer.concat([header, payload]);
};

const decodeFrames = buffer => {
  const frames = [];
  let offset = 0;
  while (buffer.length - offset >= 2) {
    const frameStart = offset;
    const firstByte = buffer[offset];
    const secondByte = buffer[offset + 1];
    const fin = Boolean(firstByte & 0x80);
    const opcode = firstByte & 0x0f;
    const masked = Boolean(secondByte & 0x80);
    let length = secondByte & 0x7f;
    offset += 2;
    if (length === 126) {
      if (buffer.length - offset < 2) return { frames, remaining: buffer.subarray(frameStart) };
      length = buffer.readUInt16BE(offset);
      offset += 2;
    } else if (length === 127) {
      if (buffer.length - offset < 8) return { frames, remaining: buffer.subarray(frameStart) };
      const wideLength = buffer.readBigUInt64BE(offset);
      if (wideLength > BigInt(1024 * 1024)) throw new Error('WebSocket frame too large');
      length = Number(wideLength);
      offset += 8;
    }
    const maskLength = masked ? 4 : 0;
    if (buffer.length - offset < maskLength + length) {
      return { frames, remaining: buffer.subarray(frameStart) };
    }
    const mask = masked ? buffer.subarray(offset, offset + 4) : null;
    offset += maskLength;
    const payload = Buffer.from(buffer.subarray(offset, offset + length));
    offset += length;
    if (mask) {
      for (let index = 0; index < payload.length; index += 1) payload[index] ^= mask[index % 4];
    }
    frames.push({ fin, opcode, payload });
  }
  return { frames, remaining: buffer.subarray(offset) };
};

const sendJson = (socket, message) => {
  if (!socket.destroyed) socket.write(encodeFrame(JSON.stringify(message)));
};

const sendPong = (socket, payload) => {
  if (!socket.destroyed) socket.write(encodeFrame(payload, 0x0a));
};

const isCastRoom = room => /^\d{6}$/.test(String(room || ''));

const relayCast = (sender, message) => {
  if (!isCastRoom(message.room)) return;
  for (const [client, info] of clients) {
    if (client === sender || client.destroyed) continue;
    if (info.room !== message.room) continue;
    sendJson(client, message);
  }
};

server.on('upgrade', (req, socket) => {
  const key = req.headers['sec-websocket-key'];
  if (!key) {
    socket.destroy();
    return;
  }

  const accept = crypto
    .createHash('sha1')
    .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
    .digest('base64');

  socket.write([
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${accept}`,
    '',
    '',
  ].join('\r\n'));

  socket.setNoDelay(true);
  clients.set(socket, { role: 'unknown', room: '', label: '' });
  let frameBuffer = Buffer.alloc(0);
  let fragmentedOpcode = 0;
  let fragmentedPayload = [];
  socket.on('data', buffer => {
    try {
      frameBuffer = Buffer.concat([frameBuffer, buffer]);
      const decoded = decodeFrames(frameBuffer);
      frameBuffer = decoded.remaining;
      for (const frame of decoded.frames) {
        if (frame.opcode === 0x8) {
          socket.end();
          return;
        }
        if (frame.opcode === 0x9) {
          sendPong(socket, frame.payload);
          continue;
        }
        if (frame.opcode === 0x0) {
          if (!fragmentedOpcode) continue;
          fragmentedPayload.push(frame.payload);
          if (!frame.fin) continue;
          frame.opcode = fragmentedOpcode;
          frame.payload = Buffer.concat(fragmentedPayload);
          fragmentedOpcode = 0;
          fragmentedPayload = [];
        } else if (!frame.fin) {
          fragmentedOpcode = frame.opcode;
          fragmentedPayload = [frame.payload];
          continue;
        }
        if (frame.opcode !== 0x1) continue;
        const parsed = JSON.parse(frame.payload.toString('utf8'));
      const info = clients.get(socket);
      if (!info) continue;
      if (parsed.type === 'cast:register') {
        info.role = parsed.role === 'receiver' ? 'receiver' : 'controller';
        info.room = info.role === 'receiver' ? String(parsed.room || '') : '';
        info.label = String(parsed.label || '');
        if (info.role === 'receiver' && !isCastRoom(info.room)) {
          sendJson(socket, { type: 'cast:error', message: 'Invalid TV room code.' });
          socket.destroy();
          return;
        }
        if (info.role === 'receiver' && info.room) {
          for (const [client, clientInfo] of clients) {
            if (client !== socket && clientInfo.role === 'controller') sendJson(client, { type: 'cast:receiver-online', room: info.room, label: parsed.label || 'Memoriya TV' });
          }
        }
        if (info.role === 'controller') {
          for (const [, receiverInfo] of clients) {
            if (receiverInfo.role === 'receiver' && receiverInfo.room) sendJson(socket, { type: 'cast:receiver-online', room: receiverInfo.room, label: receiverInfo.label || 'Memoriya TV' });
          }
        }
        continue;
      }
      if (parsed.type === 'cast:join') {
        if (!isCastRoom(parsed.room)) {
          sendJson(socket, { type: 'cast:error', message: 'Enter the six-digit TV code.' });
          continue;
        }
        info.role = 'controller';
        info.room = String(parsed.room || '');
        relayCast(socket, { type: 'cast:receiver-ready', room: info.room });
        continue;
      }
      if (parsed.type?.startsWith('cast:')) {
        if (!isCastRoom(parsed.room) || info.room !== String(parsed.room)) continue;
        relayCast(socket, parsed);
        continue;
      }
      // Preserve the original broadcast behavior for any existing realtime
      // messages used by older local builds.
      for (const [client] of clients) if (client !== socket && !client.destroyed) sendJson(client, parsed);
      }
    } catch {
      socket.destroy();
    }
  });
  const removeClient = () => {
    if (!clients.has(socket)) return;
    const info = clients.get(socket);
    if (info?.role === 'receiver' && info.room) {
      relayCast(socket, { type: 'cast:receiver-offline', room: info.room });
    }
    clients.delete(socket);
  };
  socket.on('close', removeClient);
  socket.on('error', removeClient);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Memoriya realtime/cast server listening on port ${PORT}`);
  console.log(`Serving built site from ${distDir}`);
});
