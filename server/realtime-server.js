import crypto from 'node:crypto';
import http from 'node:http';

const PORT = Number(process.env.MEMORIYA_REALTIME_PORT || 8787);
const clients = new Set();

const server = http.createServer((_req, res) => {
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ ok: true, service: 'memoriya-realtime' }));
});

const encodeFrame = data => {
  const payload = Buffer.from(data);
  const length = payload.length;

  if (length < 126) {
    return Buffer.concat([Buffer.from([0x81, length]), payload]);
  }

  if (length < 65536) {
    const header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(length, 2);
    return Buffer.concat([header, payload]);
  }

  const header = Buffer.alloc(10);
  header[0] = 0x81;
  header[1] = 127;
  header.writeBigUInt64BE(BigInt(length), 2);
  return Buffer.concat([header, payload]);
};

const decodeFrame = buffer => {
  const secondByte = buffer[1];
  let length = secondByte & 0x7f;
  let offset = 2;

  if (length === 126) {
    length = buffer.readUInt16BE(offset);
    offset += 2;
  } else if (length === 127) {
    length = Number(buffer.readBigUInt64BE(offset));
    offset += 8;
  }

  const mask = buffer.subarray(offset, offset + 4);
  offset += 4;
  const payload = buffer.subarray(offset, offset + length);
  const decoded = Buffer.alloc(payload.length);

  for (let index = 0; index < payload.length; index += 1) {
    decoded[index] = payload[index] ^ mask[index % 4];
  }

  return decoded.toString('utf8');
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

  clients.add(socket);
  socket.on('data', buffer => {
    try {
      const message = decodeFrame(buffer);
      const frame = encodeFrame(message);
      for (const client of clients) {
        if (client !== socket && !client.destroyed) client.write(frame);
      }
    } catch {
      socket.destroy();
    }
  });
  socket.on('close', () => clients.delete(socket));
  socket.on('error', () => clients.delete(socket));
});

server.listen(PORT, () => {
  console.log(`Memoriya realtime server running on ws://localhost:${PORT}`);
});
