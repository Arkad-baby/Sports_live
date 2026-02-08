const express = require('express');

const app = express();
const PORT = process.env.PORT || 8000;

app.use(express.json())

app.get('/', (req, res) => {
	res.send(' Live Sports — server is running very happy');
});

app.listen(PORT, () => {
	console.log(`Server is running on http://localhost:${PORT}`);
});

module.exports = app;
