import './config/env.js';
import http from 'http';
import app from './app.js';
import { initDatabase } from './config/db.js';
import { initWebSocketServer } from './websocket/server.js';


const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    // 1. Initialize DB tables and pool
    await initDatabase();

    // 2. Create HTTP Server from Express app
    const httpServer = http.createServer(app);

    // 3. Attach WebSocket server to the HTTP Server
    initWebSocketServer(httpServer);

    // 4. Start listening
    httpServer.listen(PORT, () => {
      console.log(`==================================================`);
      console.log(`[Server] Service running in development mode.`);
      console.log(`[Server] REST API: http://localhost:${PORT}`);
      console.log(`[Server] WebSockets: ws://localhost:${PORT}`);
      console.log(`==================================================`);
    });
  } catch (error) {
    console.error('[Server] Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
