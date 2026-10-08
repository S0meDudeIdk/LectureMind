import fs from 'node:fs';
import path from 'node:path';

if (process.env.GOOGLE_APPLICATION_CREDENTIALS && !fs.existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
  delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
}

const isProduction = process.argv.includes('--production') || process.env.NODE_ENV === 'production';
const bundlePath = path.join(process.cwd(), 'dist', 'server', 'server.cjs');

export async function startServer() {
  if (isProduction && fs.existsSync(bundlePath) && !process.env.TSX) {
    const bundle = await import('./dist/server/server.cjs');
    return bundle.startServer();
  } else {
    const source = await import('./server/server.ts');
    return source.startServer();
  }
}

export async function createApp(deps?: any) {
  if (isProduction && fs.existsSync(bundlePath) && !process.env.TSX) {
    const bundle = await import('./dist/server/server.cjs');
    return bundle.createApp(deps);
  } else {
    const source = await import('./server/server.ts');
    return source.createApp(deps);
  }
}

const entry = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (/[/\\]server\.[cm]?[jt]s$/.test(entry)) {
  startServer().catch((error) => {
    console.error('Server startup failed:', error.message);
    process.exitCode = 1;
  });
}
