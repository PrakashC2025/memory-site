import crypto from 'node:crypto';
import http from 'node:http';

const PORT = Number(process.env.MEMORIYA_REALTIME_PORT || 8787);
const clients = new Map();

const server = http.createServer((_req, res) => {
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ ok: true, service: 'memoriya-realtime' }));
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

server.listen(PORT, () => {
  console.log(`Memoriya realtime server running on ws://localhost:${PORT}`);
});
