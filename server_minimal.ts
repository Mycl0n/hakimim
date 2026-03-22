import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.get('/api/health', (req, res) => {
  res.json({ status: "ok", message: "Minimal server is running" });
});

// Serve static files from 'dist' if it exists, otherwise just a message
const distPath = path.join(__dirname, 'dist');
app.use(express.static(distPath));

app.get('*', (req, res) => {
  res.send("Server is up. If you see this, the static files are missing or not being served.");
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Minimal server running on http://localhost:${PORT}`);
});
