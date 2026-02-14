import express from 'express';
import matchRouter from './routes/matches.js';
import { matchStatusScheduler } from './triggers/match_scheduler.js';
import http from 'http'
import { attachWebSocketServer } from './ws/server.js';
import { middleWare } from './arcjet.js';
const app = express();
const PORT = process.env.PORT || 8000;
const HOST = process.env.HOST || "0.0.0.0";

const server=http.createServer(app)

app.use(express.json())
app.use(middleWare)

app.get('/', (req, res) => {
	res.send(' Live Sports — server is running very happy');
});

app.use('/matches',matchRouter)

const {broadcastMatchCreated}=attachWebSocketServer(server)
//a persistent object used for storing global variables
app.locals.broadcastMatchCreated=broadcastMatchCreated

server.listen(PORT,HOST, () => {
const baseURL=HOST=="0.0.0.0" ? `http://localhost:${PORT}`:`http://${HOST}:${PORT}`
	matchStatusScheduler.start()
	console.log(`Server is running on ${baseURL}`);
	console.log(`WebSocket server is running on ${baseURL.replace('http','ws')}/ws`);
});

export default app;
