import { WebSocket, WebSocketServer } from "ws";

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

  wss.on("connection", (socket) => {
    socket.isAlive=true
    socket.on("pong",()=>{socket.isAlive=true})

    const interval=setInterval(()=>{
      wss.clients.forEach((client)=>{
        if(client.isAlive ===false) return client.terminate()
          client.isAlive=false
          client.ping()

      })
    },30000)

    wss.on("close",()=>{
      clearInterval(interval)
    })

    sendJson(socket, { type: "welcome" });

    socket.on("error", console.error);


  });

  function broadcastMatchCreated(match){
    broadcast(wss,{type:"match created",data:match})
  }
  return {broadcastMatchCreated}
}
