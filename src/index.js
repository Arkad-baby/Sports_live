import express from 'express';
import matchRouter from './routes/matches.js';
import { matchStatusScheduler } from './triggers/match_scheduler.js';
const app = express();
const PORT = process.env.PORT || 8000;

app.use(express.json())

app.get('/', (req, res) => {
	res.send(' Live Sports — server is running very happy');
});

app.use('/matches',matchRouter)

app.listen(PORT, () => {
	matchStatusScheduler.start()
	console.log(`Server is running on http://localhost:${PORT}`);
});

export default app;
