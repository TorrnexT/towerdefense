import express from 'express';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { DefenseRoom, CoopRoom } from './room';
export async function startServer(port = Number(process.env.PORT || 2567)) {
  const app = express();
  app.get('/health', (_, res) => res.json({ ok: true, game: 'Emberwatch' }));
  app.use(express.static(fileURLToPath(new URL('../../gameclient/dist/', import.meta.url))));
  const http = createServer(app);
  const game = new Server({
    transport: new WebSocketTransport({ server: http, pingInterval: 3000, pingMaxRetries: 2 }),
    greet: false,
  });
  game.define('endless', DefenseRoom);
  game.define('coop', CoopRoom);
  await game.listen(port, '0.0.0.0');
  console.log(`Emberwatch server → http://localhost:${port}`);
  return game;
}
if (process.argv[1] === fileURLToPath(import.meta.url))
  startServer().catch((error) => {
    console.error(error);
    process.exit(1);
  });
