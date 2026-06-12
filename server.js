const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, "public");
const rooms = new Map();

function getIceServers() {
  if (process.env.ICE_SERVERS_JSON) {
    try {
      return JSON.parse(process.env.ICE_SERVERS_JSON);
    } catch (error) {
      console.warn("ICE_SERVERS_JSON okunamadi, varsayilan STUN kullaniliyor.");
    }
  }

  if (process.env.TURN_URL && process.env.TURN_USERNAME && process.env.TURN_CREDENTIAL) {
    return [
      { urls: "stun:stun.l.google.com:19302" },
      {
        urls: process.env.TURN_URL,
        username: process.env.TURN_USERNAME,
        credential: process.env.TURN_CREDENTIAL
      }
    ];
  }

  return [{ urls: "stun:stun.l.google.com:19302" }];
}

function getRoom(roomId) {
  if (!rooms.has(roomId)) rooms.set(roomId, new Map());
  return rooms.get(roomId);
}

function sendEvent(client, event) {
  const payload = JSON.stringify(event);
  if (client.socket && !client.socket.destroyed && !client.socket.writableEnded) {
    try {
      client.socket.write(encodeWsFrame(payload));
    } catch (error) {
      client.socket.destroy();
    }
    return;
  }
  if (client.res && !client.res.destroyed && !client.res.writableEnded) {
    try {
      client.res.write(`data: ${payload}\n\n`);
    } catch (error) {
      client.res.destroy();
    }
  }
}

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store"
  });
  res.end(body);
}

function safeRoomId(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 48);
}

function broadcast(roomId, event, exceptClientId) {
  const room = rooms.get(roomId);
  if (!room) return;

  for (const [clientId, client] of room.entries()) {
    if (clientId === exceptClientId) continue;
    sendEvent(client, event);
  }
}

function cleanupRoom(roomId) {
  const room = rooms.get(roomId);
  if (room && room.size === 0) rooms.delete(roomId);
}

function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = path.normalize(path.join(PUBLIC_DIR, pathname));

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    const ext = path.extname(filePath);
    const types = {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "application/javascript; charset=utf-8",
      ".svg": "image/svg+xml"
    };
    res.writeHead(200, {
      "Content-Type": types[ext] || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    res.end(data);
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        reject(new Error("Body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function encodeWsFrame(text) {
  const payload = Buffer.from(text);
  const length = payload.length;
  let header;

  if (length < 126) {
    header = Buffer.from([0x81, length]);
  } else if (length < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(length), 2);
  }

  return Buffer.concat([header, payload]);
}

function decodeWsFrame(buffer) {
  if (buffer.length < 2) return null;
  const opcode = buffer[0] & 0x0f;
  if (opcode === 0x8) return { close: true };
  if (opcode !== 0x1) return null;

  let length = buffer[1] & 0x7f;
  let offset = 2;

  if (length === 126) {
    if (buffer.length < 4) return null;
    length = buffer.readUInt16BE(2);
    offset = 4;
  } else if (length === 127) {
    if (buffer.length < 10) return null;
    const bigLength = buffer.readBigUInt64BE(2);
    if (bigLength > BigInt(Number.MAX_SAFE_INTEGER)) return null;
    length = Number(bigLength);
    offset = 10;
  }

  const masked = Boolean(buffer[1] & 0x80);
  if (!masked || buffer.length < offset + 4 + length) return null;

  const mask = buffer.subarray(offset, offset + 4);
  const payload = buffer.subarray(offset + 4, offset + 4 + length);
  const decoded = Buffer.alloc(payload.length);

  for (let i = 0; i < payload.length; i += 1) {
    decoded[i] = payload[i] ^ mask[i % 4];
  }

  return { text: decoded.toString("utf8") };
}

function handleWsUpgrade(req, socket) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const roomId = safeRoomId(url.searchParams.get("room"));
  const name = String(url.searchParams.get("name") || "Misafir").trim().slice(0, 32);
  const key = req.headers["sec-websocket-key"];

  if (!roomId || !key) {
    socket.destroy();
    return;
  }

  const accept = crypto
    .createHash("sha1")
    .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
    .digest("base64");

  socket.write([
    "HTTP/1.1 101 Switching Protocols",
    "Upgrade: websocket",
    "Connection: Upgrade",
    `Sec-WebSocket-Accept: ${accept}`,
    "",
    ""
  ].join("\r\n"));
  socket.setKeepAlive(true, 15000);
  socket.setNoDelay(true);

  const clientId = crypto.randomUUID();
  const room = getRoom(roomId);
  sendEvent({ socket }, {
    type: "connected",
    clientId,
    peers: [...room.values()].map((client) => ({ id: client.id, name: client.name }))
  });

  room.set(clientId, { id: clientId, name, socket });
  broadcast(roomId, { type: "peer-joined", from: clientId, name }, clientId);

  const heartbeat = setInterval(() => {
    sendEvent({ socket }, { type: "heartbeat", at: Date.now() });
  }, 25000);

  socket.on("data", (buffer) => {
    const frame = decodeWsFrame(buffer);
    if (!frame) return;
    if (frame.close) {
      socket.end();
      return;
    }

    try {
      const body = JSON.parse(frame.text);
      const target = body.to ? String(body.to).trim() : "";
      const type = String(body.type || "").trim();
      if (!type) return;

      const event = {
        type,
        from: clientId,
        to: target,
        name,
        text: String(body.text || "").trim().slice(0, 2000),
        description: body.description || null, candidate: body.candidate || null, description: body.description || null, candidate: body.candidate || null, data: body.data || null,
        at: Date.now()
      };

      if (target) {
        const client = rooms.get(roomId)?.get(target);
        if (client) sendEvent(client, event);
      } else {
        broadcast(roomId, event, type === "chat" ? "" : clientId);
      }
    } catch (error) {
      sendEvent({ socket }, { type: "system", text: "Mesaj okunamadi." });
    }
  });

  socket.on("close", () => {
    clearInterval(heartbeat);
    room.delete(clientId);
    broadcast(roomId, { type: "peer-left", from: clientId, name }, clientId);
    cleanupRoom(roomId);
  });

  socket.on("error", () => {
    clearInterval(heartbeat);
    room.delete(clientId);
    cleanupRoom(roomId);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "GET" && url.pathname === "/health") {
    sendJson(res, 200, { ok: true, name: "HI BUBY BURDA" });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/config") {
    sendJson(res, 200, { iceServers: getIceServers() });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/connect") {
    const roomId = safeRoomId(url.searchParams.get("room"));
    const name = String(url.searchParams.get("name") || "Misafir").trim().slice(0, 32);

    if (!roomId) {
      sendJson(res, 400, { error: "Oda adi gerekli." });
      return;
    }

    const clientId = crypto.randomUUID();
    const room = getRoom(roomId);

    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no"
    });
    res.write(`data: ${JSON.stringify({ type: "connected", clientId, peers: [...room.values()].map((client) => ({ id: client.id, name: client.name })) })}\n\n`);

    room.set(clientId, { id: clientId, name, res });
    broadcast(roomId, { type: "peer-joined", from: clientId, name }, clientId);

    const heartbeat = setInterval(() => {
      res.write(`: heartbeat\n\n`);
    }, 15000);

    req.on("close", () => {
      clearInterval(heartbeat);
      room.delete(clientId);
      broadcast(roomId, { type: "peer-left", from: clientId, name }, clientId);
      cleanupRoom(roomId);
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/send") {
    try {
      const body = await readBody(req);
      const roomId = safeRoomId(body.room);
      const from = String(body.from || "").trim();
      const target = body.to ? String(body.to).trim() : "";
      const type = String(body.type || "").trim();

      if (!roomId || !from || !type) {
        sendJson(res, 400, { error: "Eksik bilgi var." });
        return;
      }

      const event = {
        type,
        from,
        to: target,
        name: String(body.name || "").trim().slice(0, 32),
        text: String(body.text || "").trim().slice(0, 2000),
        description: body.description || null, candidate: body.candidate || null, description: body.description || null, candidate: body.candidate || null, data: body.data || null,
        at: Date.now()
      };

      if (target) {
        const client = rooms.get(roomId)?.get(target);
        if (client) sendEvent(client, event);
      } else {
        broadcast(roomId, event, type === "chat" ? "" : from);
      }

      sendJson(res, 200, { ok: true });
    } catch (error) {
      sendJson(res, 400, { error: "Mesaj okunamadi." });
    }
    return;
  }

  serveStatic(req, res);
});

server.on("upgrade", (req, socket) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === "/ws" || url.pathname === "/") {
    handleWsUpgrade(req, socket);
    return;
  }
  socket.destroy();
});

server.listen(PORT, () => {
  console.log(`HI BUBY BURDA http://localhost:${PORT}`);
});
