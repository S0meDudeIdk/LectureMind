import { spawn } from 'node:child_process';
const child = spawn(process.execPath, ['tests/mindmap-export.browser.mjs'], { stdio: 'inherit', env: { ...process.env, EXPORT_TEST_PRODUCTION: '1' } });
child.on('exit', code => process.exitCode = code || 0);
