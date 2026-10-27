import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import router from './routes.js';
import { initializeScheduler, stopScheduler } from './scheduler.js';
dotenv.config();
const app = express();
const port = Number(process.env.PORT ?? 4000);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientPath = path.join(__dirname, '..');
app.use(cors());
app.use(express.json());
app.use('/api', router);
app.use(express.static(clientPath));
app.get('*', (req, res) => {
    res.sendFile(path.join(clientPath, 'index.html'));
});
const startServer = async () => {
    const server = app.listen(port, () => {
        console.log(`Server berjalan di http://localhost:${port}`);
    });
    const shutdown = () => {
        stopScheduler();
        server.close(() => process.exit(0));
    };
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
    initializeScheduler().catch((error) => {
        console.error('Failed to initialize scheduler:', error);
    });
};
startServer();
