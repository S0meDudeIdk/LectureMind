# LectureMind 🧠✨

> Transform lecture audio and video recordings into interactive mindmaps, verbatim transcripts, and comprehensive study notes using Gemini AI.

---

## 🚀 Overview

**LectureMind** is an AI-powered study companion designed for students, researchers, and professionals. Upload any lecture recording (audio or video), and LectureMind automatically transcribes the audio, structures key concepts into an interactive hierarchical mindmap, and generates formatted Obsidian-compatible markdown notes with rich formatting, mathematical LaTeX equations, and callouts.

---

## ✨ Key Features

- **🎙️ Multi-Format Media Ingestion**:
  - Supports audio (`.mp3`, `.wav`, `.m4a`, `.aac`, `.ogg`) and video (`.mp4`, `.webm`, `.mov`).
  - Dual-mode upload: fast inline processing for media under 20MB, and Firebase Cloud Storage (`gs://`) references for large recordings processed via Vertex AI.
  - Browser-side FFmpeg audio extraction for video files.

- **🗺️ Interactive Mindmaps**:
  - Hierarchical left/right tree renderer powered by `simple-mind-map`.
  - Rich KaTeX math support with custom math-aware node sizing and centered text.
  - Expand/collapse branches, zoom, pan, and fit-to-view controls.
  - Bi-directional sync between the live editor and the mindmap canvas.

- **📝 Obsidian-Style Live Preview Editor**:
  - Hybrid WYSIWYG / CodeMirror markdown editor with instant formatting.
  - Rich KaTeX math equations (`$...$` and `$$...$$`).
  - Interactive task checkboxes (`- [ ]`, `- [x]`), callouts (`> [!NOTE]`, `> [!WARNING]`), and code highlighting.
  - Word count, reading time estimation, and markdown table support.

- **⏱️ Synchronized Media Player & Transcripts**:
  - Interactive transcript with timestamps linked directly to the media playback position.
  - Searchable transcript blocks with instant seek on click.

- **💾 Dual-Layer Storage & Offline Resilience**:
  - **Browser IndexedDB (`mediaDb`)**: Instant local caching of video and audio streams for stutter-free local playback without waiting on cloud downloads.
  - **Firebase Firestore & Cloud Storage**: Cloud document synchronization and persistent cloud media hosting.

- **🔐 Google Sign-In & Firebase Authentication**:
  - Quick 1-click Google authentication.
  - Automatic authorized domain helper for Google Cloud Run / AI Studio preview environments.

- **📤 Multi-Format Exporting**:
  - Export mindmap diagrams as **JPG** or **PDF** via the `simple-mind-map` Export plugin.
  - Export study notes as clean **Markdown (.md)** or rich **Google Docs** (direct Drive upload or clipboard fallback).

---

## 🛠️ Tech Stack

- **Frontend**: [React 19](https://react.dev/), [Vite](https://vitejs.dev/)
- **Styling**: [Tailwind CSS v4](https://tailwindcss.com/)
- **AI Model**: [Google Gemini via Vertex AI / Gemini Enterprise Agent Platform (`@google/genai`)](https://cloud.google.com/gemini-enterprise-agent-platform)
- **Mindmap Engine**: [`simple-mind-map`](https://github.com/wanglin2/mind-map) with [`katex`](https://katex.org/) math rendering
- **Editor & Formatting**: [CodeMirror 6](https://codemirror.net/), [KaTeX](https://katex.org/), [Marked](https://marked.js.org/)
- **Icons**: [@phosphor-icons/react](https://phosphoricons.com/)
- **Backend & Persistence**: [Firebase (Firestore, Storage, Authentication)](https://firebase.google.com/)
- **Audio Extraction**: [`@ffmpeg/ffmpeg`](https://ffmpegwasm.netlify.app/) in the browser
- **Export Utilities**: `simple-mind-map` Export plugin, `html2canvas`, Google Drive REST API

---

## ⚙️ Environment Variables

Create a `.env` file in the project root based on `.env.example`:

```env
# Vertex AI / Gemini Enterprise Agent Platform (Required for AI generation)
GOOGLE_CLOUD_PROJECT=your_gcp_project_id
GOOGLE_CLOUD_LOCATION=us-central1

# Firebase Configuration (Required for cloud sync & authentication)
VITE_FIREBASE_API_KEY=your_firebase_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project_id.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
VITE_FIREBASE_APP_ID=your_firebase_app_id
VITE_FIREBASE_MEASUREMENT_ID=your_measurement_id

# Optional Backend / reCAPTCHA
VITE_BACKEND_URL=
VITE_RECAPTCHA_SITE_KEY=
```

---

## 📦 Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Run Development Server
```bash
npm run dev
```
The application will be running at `http://localhost:3000`.

### 3. Build for Production
```bash
npm run build
```

---

## 🔑 Firebase Configuration Guide

### 1. Firestore Database Rules
Make sure your Firestore database has read/write rules enabled for the `mindmaps` collection:
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /mindmaps/{document=**} {
      allow read, write: if true; // Or restrict to authenticated users: request.auth != null
    }
  }
}
```

### 2. Firebase Storage Rules
Ensure your Firebase Storage bucket allows file uploads for lecture media:
```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /lectures/{allPaths=**} {
      allow read, write: if true; // Or restrict to authenticated users
    }
  }
}
```

### 3. Google Sign-In & Authorized Domains
If deploying to Google AI Studio or custom domains, ensure the domain is whitelisted:
1. Go to **Firebase Console** &gt; **Authentication** &gt; **Settings** &gt; **Authorized domains**.
2. Add your host domain (e.g. `localhost` or `ais-dev-*.asia-east1.run.app`).

---

## 📄 License

MIT License. Designed with craftsmanship for intuitive lecture synthesis and knowledge exploration.
