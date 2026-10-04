# Mindmap export browser check

Requires Chrome, Node.js, Playwright, and Sharp. The project already supplies Vite and pdf-lib. The script starts a local Vite server, seeds a sample mindmap in a fresh browser profile, blocks external requests, and checks actual JPG, PNG, and PDF downloads. Generated files stay under `.tmp/export-qa`.

On a machine without Playwright and Sharp, install only these test tools outside the app dependencies:

```powershell
npm install --prefix .tmp/export-test-tools --no-save --no-package-lock playwright sharp
$env:NODE_PATH = (Resolve-Path .tmp/export-test-tools/node_modules).Path
node tests/mindmap-export.browser.mjs
$env:EXPORT_TEST_PRODUCTION = '1'
node tests/mindmap-export.browser.mjs
```
