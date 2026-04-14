Quick Docker deploy notes (backend)

1) Build and run with Docker Compose (binds to 127.0.0.1:5030 by default):

```bash
cd atlas_backend
docker compose build backend
docker compose up -d backend
```

2) Environment
- Copy `.env.example` to `.env` and set values. If you want the built-in OpenAI chat, set `OPENAI_API_KEY`.
- If you use the Make webhook workflow as previously configured, set `MAKE_WEBHOOK_URL`.

3) Endpoints
- `GET /api/chatsessions` - list sessions (requires auth cookie/session)
- `POST /api/chat/messages` - post a message (uses Make webhook flow)
- `POST /api/chat/complete` - OpenAI-backed chat completion (requires auth)

4) Nginx
Keep your existing nginx config pointing to `127.0.0.1:5030` (HTTPS proxy). If you changed compose to expose externally, update accordingly.
