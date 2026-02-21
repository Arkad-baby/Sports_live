import { WebSocket, WebSocketServer } from "ws";
import { wsArcjet } from "../arcjet.js";

function sendJson(socket, payload) {
  if (socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify(payload));
}

function broadcast(wss, payload) {
  const data = JSON.stringify(payload);
  wss.clients.forEach((client) => {
    if (client.readyState !== WebSocket.OPEN) return;
    client.send(data);
  });
}

// Broadcast to subscribed users only
function broadcastToSubscribers(wss, matchesId, payload) {
  const data = JSON.stringify(payload);
  wss.clients.forEach((client) => {
    if (client.readyState !== WebSocket.OPEN) return;
    if (client.subscribedMatches && client.subscribedMatches.has(matchesId)) {
      client.send(data);
    }
  });
}

export function attachWebSocketServer(server) {
  const wss = new WebSocketServer({
    server,
    path: "/ws",
    maxPayload: 1024 * 1024,
      verifyClient: (info, callback) => {
    // Allow all origins in development
    // In production, replace with: info.origin === 'https://yourdomain.com'
    callback(true);
      }
  });

  // Heartbeat interval - runs once for all connections
  const interval = setInterval(() => {
    wss.clients.forEach((client) => {
      if (client.isAlive === false) {
        return client.terminate();
      }
      client.isAlive = false;
      client.ping();
    });
  }, 30000);

  wss.on("close", () => {
    clearInterval(interval);
  });

  wss.on("connection", async (socket, req) => {
    if (wsArcjet) {
      try {
        const decision = await wsArcjet.protect(req);
        if (decision.isDenied()) {
          const code = decision.reason.isRateLimit() ? 1013 : 1008;
          const reason = decision.reason.isRateLimit()
            ? "Rate limit exceeded"
            : "Access denied";
          socket.close(code, reason);
          return;
        }
      } catch (error) {
        console.log("WebSocket Error", error);
        socket.close(1011, "Server security error");
        return;
      }
    }
    socket.isAlive = true;
    socket.subscribedMatches = new Set();

    socket.on("pong", () => {
      socket.isAlive = true;
    });

    sendJson(socket, { type: "welcome" });

    socket.on("error", console.error);





    
    socket.on("message", (message) => {
      try {
        // Convert Buffer to string
        const messageString = message.toString();
        console.log("Received message:", messageString);
  console.log("Socket readyState:", socket.readyState); 

      const data = JSON.parse(messageString);
    console.log("Parsed data:", data);
        // Handle subscription
        if (data.type === "subscribe" && data.matchesId) {
          socket.subscribedMatches.add(data.matchesId);
          sendJson(socket, {
            type: "subscribed",
            matchesId: data.matchesId,
            message: `Subscribed to match ${data.matchesId}`,
          });
        }

        // Handle unsubscription
        if (data.type === "unsubscribe" && data.matchesId) {
          socket.subscribedMatches.delete(data.matchesId);
          sendJson(socket, {
            type: "unsubscribed",
            matchesId: data.matchesId,
            message: `Unsubscribed to match ${data.matchesId}`,
          });
        }
      } catch (error) {
        console.error("Message parsing error:", error);
      }
    });
  });

  function broadcastMatchCreated(match) {
    broadcast(wss, { type: "match created", data: match });
  }

  function broadcastCommentary(matchesId, commentary) {
  broadcastToSubscribers(wss, matchesId, {
    type: "commentary",
    matchesId: matchesId,
    data: commentary,
  });
}
  return { broadcastMatchCreated,broadcastCommentary };
}
