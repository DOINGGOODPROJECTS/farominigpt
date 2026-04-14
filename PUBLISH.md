**Publish MiniGPT (Atlas) as a ChatGPT plugin / GPT**

Steps to prepare and publish:

- Host the backend on HTTPS with a public domain (example: `https://atlasapi.solondev.com`).
- Ensure the static files in `faro_backend/public` are served from that domain:
 - Host the backend on HTTPS with a public domain (example: `https://minigpt.farosmart.com`).
 - For Docker on Hostinger you'll run the container and put nginx on the host as a reverse proxy for `minigpt.farosmart.com`.
  
  Example `docker-compose` run (on Hostinger VPS):

  ```bash
  # build and start the backend container
  cd /path/to/minigpt
  docker compose build --pull
  docker compose up -d
  ```

  The service listens on container port `5030` and the provided `compose.yml` maps it to the host port `5030`.

  Example `nginx` server block (host machine) to proxy TLS for `minigpt.farosmart.com` and serve plugin files:

  ```nginx
  server {
    listen 80;
    server_name minigpt.farosmart.com;
    return 301 https://$host$request_uri;
  }

  server {
    listen 443 ssl;
    server_name minigpt.farosmart.com;

    # ssl_certificate /etc/letsencrypt/live/minigpt.farosmart.com/fullchain.pem;
    # ssl_certificate_key /etc/letsencrypt/live/minigpt.farosmart.com/privkey.pem;

    location / {
      proxy_pass http://127.0.0.1:5030;
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto $scheme;
    }

    # ensure /.well-known and plugin files are proxied to the app
    location /.well-known/ {
      proxy_pass http://127.0.0.1:5030/.well-known/;
    }
  }
  ```
  - `/.well-known/ai-plugin.json` (plugin manifest)
  - `/openapi.yaml` (OpenAPI spec)
  - `/logo.svg` (logo referenced from manifest)
- Update `faro_backend/public/.well-known/ai-plugin.json` fields to match your domain, contact email, and auth method.
- If your API requires authentication, configure the `auth` block accordingly (e.g. `service_http` with bearer token, or `user_http` for user-based auth).
- Verify the OpenAPI file (`/openapi.yaml`) uses the correct `servers:` URL(s) for your hosted API.
- (Optional) Add a privacy policy and terms pages and set `legal_info_url` in the manifest.
- Register the plugin or create a GPT in ChatGPT:
  - For ChatGPT Plugins: in ChatGPT settings, go to Plugins → Develop your own plugin and provide the URL to `https://<your-domain>/.well-known/ai-plugin.json`.
  - For Custom GPTs: use the 'Actions' / 'API' settings and upload or point to your OpenAPI spec.

Local testing:
- If you don't have a public domain yet, use `ngrok` or similar to expose your local backend and update the manifest URLs to the `ngrok` domain.

Security note:
- Don't commit production secrets to the repo. Use environment variables and CI/CD secrets for deployment.
