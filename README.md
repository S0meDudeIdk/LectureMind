# LectureMind

Generate mindmaps, notes and timestamped transcripts from audio/video using React, Vite, Firebase and Vertex AI.

## Install and run

Use Node 24 and Bun 1.4.2. `bun.lock` is the authoritative lockfile.

```sh
bun install --frozen-lockfile
npm run dev
npm run build
npm start
```

Development defaults to port 3000. Production honors PORT and separates public assets in dist/public from the private backend in dist/server. See [deployment configuration](docs/DEPLOYMENT.md).

## Data and security

Protected API requests verify Firebase ID tokens; production also verifies App Check. Guest and member daily quotas are enforced on the backend. Owner-bound signed uploads and durable chunk fallback preserve the original recording; derived audio is temporary. Playback URLs refresh by upload ID.

Lectures/media are saved first in account-scoped IndexedDB. Cloud sync uses permanent IDs, immutable ownership, revisions, retryable outbox entries and deletion tombstones. The UI reports local saves, pending sync, conflicts and failures. Old unscoped browser records remain preserved in an explicit recovery shelf. Unowned legacy cloud records cannot be safely attributed automatically.

Deploy the checked-in Firestore rules, indexes and Storage rules. Never use permissive global read/write rules. Signed GCS operations use server IAM, so backend ownership checks remain essential.

## Editor and exports

Dynamic HTML is sanitized. Equations inside code stay literal, repeated formulas are preserved and fold positions track edits. Playback reports actual media events and errors, retaining its media element when minimized.

Mindmaps export as JPG/PNG/PDF with embedded math fonts and theme selection. PNG/PDF support transparency; JPG is opaque. Direct Google Docs export requests separate temporary Drive authorization and stages equations as PNGs. Clipboard fallback retains readable TeX. Actual Google import requires the staging checks in deployment documentation.

## Verification

```sh
npm run lint
npm test
npm run test:rules
npm run build
npm run test:production
npm run test:browser
npm run test:app
npm run test:export
npm run test:export:production
```

Browser tests require Chrome (`bunx playwright install chrome`). Emulator tests use Java 21 and demo-lecturemind. Tests use mocks/emulators, with no paid AI calls or customer cloud writes. CI is configured to run this sequence. See [repair evidence](docs/REPAIR_EXECUTION.md).
