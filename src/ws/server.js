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

export function attachWebSocketServer(server) {

  const wss = new WebSocketServer({
    server,
    path: "/ws",
    maxPayload: 1024 * 1024,
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

  wss.on("connection", async (socket,req) => {
    if(wsArcjet){
    try {
      const decision= await wsArcjet.protect(req)
      if(decision.isDenied()){
        const code=decision.reason.isRateLimit()? 1013:1008
        const reason=decision.reason.isRateLimit()? "Rate limit exceeded":"Access denied"
        socket.close(code,reason)
        return
      }
    } catch (error) {
      console.log("WebSocket Error",error)
      socket.close(1011,'Server security error')
      return
    }
  }
 socket.isAlive = true;
    socket.on("pong", () => {
     socket.isAlive = true;
    });

    sendJson(socket, { type: "welcome" });

    socket.on("error", console.error);


  });

  function broadcastMatchCreated(match){
    broadcast(wss,{type:"match created",data:match})
  }
  return {broadcastMatchCreated}
}
