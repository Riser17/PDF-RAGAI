# PDF RAG

Chat with your PDFs. Upload a document from the mobile app, it gets chunked and embedded in the background, and you can ask natural-language questions that are answered using retrieved context from the file — with sources shown alongside each answer.

## How it works

```
┌─────────────────┐      upload PDF      ┌──────────────────┐
│  Mobile App      │ ───────────────────> │  Express Server   │
│  (Expo / RN)      │                      │  (index.js)        │
│                  │ <─────────────────── │                    │
│  - FileUpload     │     chat response    │  - /upload/pdf      │
│  - ChatComponent   │                      │  - /chat            │
└─────────────────┘                      └─────────┬────────┘
                                                      │ enqueue job
                                                      ▼
                                              ┌──────────────┐
                                              │  Redis Queue  │
                                              │  (BullMQ)      │
                                              └──────┬───────┘
                                                      │ job consumed
                                                      ▼
                                              ┌──────────────┐
                                              │  Worker        │
                                              │  (worker.js)    │
                                              │  - load PDF     │
                                              │  - split chunks │
                                              │  - embed        │
                                              └──────┬───────┘
                                                      │ store vectors
                                                      ▼
                                              ┌──────────────┐
                                              │  Qdrant        │
                                              │  (vector DB)   │
                                              └──────┬───────┘
                                                      │ similarity search
                                                      ▼
                                              ┌──────────────┐
                                              │  Ollama        │
                                              │  - embeddings   │
                                              │  - chat (cloud) │
                                              └──────────────┘
```

1. **Upload** — the mobile app picks a PDF and uploads it to the Express server.
2. **Queue** — the server saves the file to disk and enqueues a job on a Redis-backed BullMQ queue, so the upload request returns immediately.
3. **Ingest** — a background worker picks up the job, loads the PDF, splits it into chunks, embeds each chunk, and stores the vectors in Qdrant.
4. **Chat** — when you ask a question, the server embeds your query, retrieves the most relevant chunks from Qdrant, and passes them as context to a chat model to generate an answer with cited sources.

## Tech stack

| Layer | Tech |
|---|---|
| Mobile app | React Native (Expo), Clerk (auth) |
| API server | Express, Multer |
| Job queue | BullMQ + Redis |
| PDF parsing | LangChain `PDFLoader`, `pdf-parse` |
| Text splitting | LangChain `RecursiveCharacterTextSplitter` |
| Embeddings | Ollama — `nomic-embed-text-v2-moe` |
| Vector store | Qdrant |
| Chat / generation | Ollama Cloud — `gemma4:31b-cloud` |

## Prerequisites

- Node.js (v18+)
- [Redis](https://redis.io/) running locally (or reachable) for BullMQ
- [Qdrant](https://qdrant.tech/) running locally (`localhost:6333`) or hosted
- [Ollama](https://ollama.com/) installed, with:
  - `nomic-embed-text-v2-moe` pulled locally for embeddings: `ollama pull nomic-embed-text-v2-moe`
  - An Ollama account + API key for cloud chat models (`gemma4:31b-cloud`)
- Expo CLI / an Expo-compatible simulator or device for the mobile app
- A Clerk account + publishable key for auth in the mobile app

## Project structure

```
.
├── server/
│   ├── index.js        # Express API: /upload/pdf, /chat
│   └── worker.js        # BullMQ worker: PDF ingestion pipeline
├── app/                 # Expo app
│   ├── components/
│   │   ├── file-upload.tsx
│   │   └── chat.tsx
│   └── (screens)/
└── uploads/              # uploaded PDFs land here (gitignored)
```

## Setup

### 1. Clone and install

```bash
git clone <your-repo-url>
cd pdf-rag
npm install
```

### 2. Start infrastructure

```bash
# Redis
redis-server

# Qdrant (via Docker)
docker run -p 6333:6333 qdrant/qdrant
```

### 3. Pull the embedding model

```bash
ollama pull nomic-embed-text-v2-moe
```

### 4. Configure environment variables

Create a `.env` file in `server/`:

```env
OLLAMA_API_KEY=your_ollama_cloud_api_key
REDIS_HOST=localhost
REDIS_PORT=6379
QDRANT_URL=http://localhost:6333
```

### 5. Run the backend

```bash
# Terminal 1 — API server
node server/index.js

# Terminal 2 — ingestion worker
node server/worker.js
```

> **Note:** run both without `--watch` (or exclude `uploads/` from the watch path). Watching the uploads directory causes the worker to restart mid-job the moment a file is written, which silently kills ingestion before it finishes.

### 6. Run the mobile app

```bash
cd app
npx expo start
```

Update the server IP in `chat.tsx` / `file-upload.tsx` to match your machine's local network address, and make sure your device/simulator can reach it (see **Known issues** below for HTTPS/ATS considerations on iOS).

## API reference

### `POST /upload/pdf`

Uploads a PDF and queues it for ingestion.

- **Body:** `multipart/form-data` with a `pdf` field
- **Response:**
  ```json
  { "message": "File uploaded successfully", "file": { ... } }
  ```

### `GET /chat?message=<question>`

Answers a question using retrieved context from ingested PDFs.

- **Query params:** `message` — the user's question
- **Response:**
  ```json
  {
    "message": "The answer text...",
    "docs": [ { "pageContent": "...", "metadata": { "source": "...", "loc": { "pageNumber": 3 } } } ]
  }
  ```

## Roadmap

- [ ] Multi-file ingestion status / progress indicator in the app
- [ ] Streaming chat responses instead of a single JSON payload
- [ ] Per-user document scoping in Qdrant (currently a single shared collection)
- [ ] Delete / re-index uploaded documents

## License

MIT
