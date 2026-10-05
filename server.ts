import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createApp } from './server/app';
import { createProductionDependencies } from './server/adapters';
export { createApp } from './server/app';

export async function startServer() {
  const production = process.argv.includes('--production') || process.env.NODE_ENV === 'production';
  if (production) process.env.NODE_ENV = 'production';
  const dependencies = await createProductionDependencies(production);
  const app = createApp(dependencies);
  if (production) {
    const { default: express } = await import('express');
    const publicPath = path.join(process.cwd(), 'dist', 'public');
    app.use(express.static(publicPath, { dotfiles: 'deny' }));
    app.get('*all', (_req, res) => res.sendFile(path.join(publicPath, 'index.html')));
  } else {
    const { createServer } = await import('vite');
    const vite = await createServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  }
  const port = Number(process.env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer between 1 and 65535.');
  const server=app.listen(port, '0.0.0.0', () => console.log(`LectureMind listening on port ${port}.`));
  const stopMaintenance=dependencies.startMaintenance?.();
  server.once('close',()=>stopMaintenance?.());
  return server;
}

// Importing this module never initializes credentials or opens a server.
const invokedPath = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href;
if (invokedPath === import.meta.url || /[/\\]server\.cjs$/.test(process.argv[1] || '')) {
  startServer().catch((error) => { console.error('Server startup failed:', error.message); process.exitCode = 1; });
}
