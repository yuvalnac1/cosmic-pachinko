import { defineConfig, type Plugin } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

// Dev-only endpoint so the in-game developer menu reads/writes tuning.config.json directly.
// The file is excluded from the watcher, so saving values never reloads or resets the game.
const CONFIG = path.resolve(__dirname, 'tuning.config.json');
function tuningFile(): Plugin {
  return {
    name: 'tuning-config-file',
    configureServer(server) {
      server.middlewares.use('/__tuning', (req, res) => {
        if (req.method === 'POST') {
          let body = '';
          req.on('data', (c) => (body += c));
          req.on('end', () => {
            try {
              const obj = JSON.parse(body);
              fs.writeFileSync(CONFIG, JSON.stringify(obj, null, 2) + '\n');
              res.end('ok');
            } catch (e) {
              res.statusCode = 400;
              res.end(String(e));
            }
          });
          return;
        }
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-store');
        res.end(fs.existsSync(CONFIG) ? fs.readFileSync(CONFIG, 'utf8') : '{}');
      });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [tuningFile()],
  server: { host: true, watch: { ignored: ['**/tuning.config.json'] } },
});
