import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

if (process.env.GOOGLE_APPLICATION_CREDENTIALS && !fs.existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
  delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
}

import { createApp } from './app';
import { createProductionDependencies } from './adapters';
export { createApp } from './app';

export async function startServer() {
  const production = process.argv.includes('--production') || process.env.NODE_ENV === 'production';
  process.env.NODE_ENV = production ? 'production' : 'development';
  const dependencies = await createProductionDependencies(production);
  const app = createApp(dependencies);
  const server = http.createServer(app);
  if (production) {
    const { default: express } = await import('express');
    const publicPath = path.join(process.cwd(), 'dist', 'public');
    app.use(express.static(publicPath, { dotfiles: 'deny' }));
    app.get('*all', (_req, res) => res.sendFile(path.join(publicPath, 'index.html')));
  } else {
    const { createServer } = await import('vite');
    const vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: { server } }, appType: 'spa' });
    app.use(vite.middlewares);
  }
  const portArgIndex = process.argv.indexOf('--port');
  const portArg = portArgIndex >= 0 ? Number(process.argv[portArgIndex + 1]) : NaN;
  const port = Number.isInteger(portArg) ? portArg : Number(process.env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer between 1 and 65535.');
  server.listen(port, '0.0.0.0', () => console.log(`LectureMind listening on port ${port}.`));
  const stopMaintenance = dependencies.startMaintenance?.();
  server.once('close', () => stopMaintenance?.());
  return server;
}

// Importing this module never initializes credentials or opens a server.
const isMainModule = () => {
  if (typeof require !== 'undefined' && typeof module !== 'undefined') {
    return require.main === module;
  }
  const entry = process.argv[1] ? path.resolve(process.argv[1]) : '';
  return /[/\\]server[/\\]server\.[cm]?[jt]s$/.test(entry);
};

if (isMainModule()) {
  startServer().catch((error) => { console.error('Server startup failed:', error.message); process.exitCode = 1; });
}
