import serverless from 'serverless-http';
import express from 'express';
import cors from 'cors';
import matchRouter from '../../src/routes/matches.js';
import router from '../../src/routes/commentary.js';
import { middleWare } from '../../src/arcjet.js';

const app = express();

// 1. Basic Middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json());
app.use(middleWare);

// 2. Mocking the WebSocket broadcasts
// Since WebSockets won't work, we provide empty functions to prevent errors in your routes
app.locals.broadcastMatchCreated = () => { console.log("WS not available in serverless"); };
app.locals.broadcastCommentary = () => { console.log("WS not available in serverless"); };

// 3. Define Routes (Note the /.netlify/functions/api prefix)
const baseRoute = '/.netlify/functions/api';
app.get(`${baseRoute}/`, (req, res) => {
    res.send('Live Sports — Serverless API is running');
});

app.use(`${baseRoute}/matches`, matchRouter);
app.use(`${baseRoute}/commentary`, router);

// 4. Export the handler
export const handler = serverless(app);