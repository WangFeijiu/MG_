import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createAPIRouter } from './api/routes.js';
import { InMemoryStore } from '../src/store/in-memory-store.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

const store = new InMemoryStore();

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes
app.use('/api/v1', createAPIRouter(store));

app.listen(PORT, () => {
  console.log(`DSL2React API running on http://localhost:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`API base: http://localhost:${PORT}/api/v1`);
});

export { app, store };
