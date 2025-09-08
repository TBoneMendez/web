# tbones-funfactAPI

A small FastAPI project that serves funfacts from SQLite, with an admin UI to add/delete facts.  
Designed for Raspberry Pi + Caddy, but works just as well locally.

## Features
- API (FastAPI + Uvicorn)
- SQLite storage (`data/funfacts.db`)
- Admin UI (`/login` + `/admin`) with session-cookie
- Bearer-token support for writes (Homey/scripts)
- Ready for systemd + Caddy

## Project Structure
```
tbones-funfactAPI/
  app/
    __init__.py
    main.py          # API and endpoints
    admin.py         # login/admin routes and templates
    db.py            # SQLite connection and init
    models.py        # Pydantic models
    .example.env     # environment variable template
    .env             # (ignored, not committed)
    requirements.txt
    templates/
      login.html
      admin.html
  data/
    funfacts.db      # SQLite database (ignored)
  .gitignore
  README.md
```

## Requirements
- Python 3.10+ (tested also with 3.13)
- Virtualenv recommended

Install dependencies:
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r app/requirements.txt
```

`app/requirements.txt` includes:
```
fastapi
uvicorn[standard]
python-dotenv
jinja2
itsdangerous
python-multipart
```

## Configuration
Copy `.example.env` to `.env` and fill in values:
```bash
cp app/.example.env app/.env
# edit app/.env: API_TOKEN and SECRET_KEY
```

- **API_TOKEN**: used for `/login` and for write endpoints via `Authorization: Bearer`.
- **SECRET_KEY**: used to sign session cookies (not something you type in).

## Run locally
```bash
source .venv/bin/activate
uvicorn app.main:app --reload --port 9000
```

Open:
- Login: http://127.0.0.1:9000/login
- Admin: http://127.0.0.1:9000/admin (requires login)
- Docs:  http://127.0.0.1:9000/docs

## Endpoints
- `GET /health` → `{ "status": "ok" }`
- `GET /stats` → `{ "count": <int>, "latest_created_at": <str|null> }`
- `GET /funfact` → `{ "id": <int>, "text": <str> }` (random)
- `GET /funfacts?limit=50&offset=0` → list of `{id, text}`
- `POST /funfacts` (requires login **or** `Authorization: Bearer <API_TOKEN>`)
  ```json
  {"text": "New funfact"}
  ```
- `DELETE /funfacts/{id}` (requires login **or** bearer)

## Admin UI
- `GET /login` – enter **API_TOKEN** to log in (sets session-cookie).
- `GET /admin` – GUI to add, list and delete funfacts.
- `GET /logout` – logs out (clears session).

## Homey / Scripts
Example (HomeyScript or curl):
```bash
curl -X POST https://tbonesfunfactapi.duckdns.org/funfacts \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <API_TOKEN>" \
  -d '{"text":"Honey never spoils."}'
```

## Deploy on Raspberry Pi
1. **systemd-service** (`/etc/systemd/system/funfacts.service`)
   ```ini
   [Unit]
   Description=Funfacts API (FastAPI/Uvicorn)
   After=network-online.target
   Wants=network-online.target

   [Service]
   User=pi
   WorkingDirectory=/home/pi/github/web/tbones-funfactAPI
   Environment=SECRET_KEY=<strong-random-key>
   Environment=API_TOKEN=<your-token>
   ExecStart=/home/pi/github/web/tbones-funfactAPI/.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 9000 --workers 2
   Restart=on-failure

   [Install]
   WantedBy=multi-user.target
   ```
   Enable:
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable --now funfacts
   sudo systemctl status funfacts
   ```

2. **Caddy** (`/etc/caddy/Caddyfile`)
   ```
   tbonesfunfactapi.duckdns.org {
       reverse_proxy 127.0.0.1:9000
       header {
           X-Frame-Options "DENY"
           X-Content-Type-Options "nosniff"
           Referrer-Policy "strict-origin-when-cross-origin"
           Cache-Control "no-store"
       }
   }
   ```
   Reload:
   ```bash
   sudo caddy reload --config /etc/caddy/Caddyfile
   ```

3. **HTTPS sessions**  
   When running behind Caddy (HTTPS), set `https_only=True` in `SessionMiddleware`.

## Backup
SQLite is a single file:
```bash
sqlite3 data/funfacts.db ".backup data/funfacts-$(date +%F).db"
```
Cron example:
```bash
(crontab -l 2>/dev/null; echo '7 2 * * * sqlite3 /home/pi/github/web/tbones-funfactAPI/data/funfacts.db ".backup /home/pi/github/web/tbones-funfactAPI/data/funfacts-$(date +\%F).db"') | crontab -
```

## .gitignore
Make sure secrets and binaries are not committed:
```
# venv
.venv/

# DB
data/*.db

# secrets
app/.env

# Python cache
__pycache__/
*.pyc
```

## Troubleshooting
- **401 on /admin** → not logged in (go to `/login` and enter API_TOKEN).
- **401/403 on POST/DELETE** → missing or wrong `Authorization: Bearer`.
- **Jinja error** → `pip install jinja2`.
- **Form data requires "python-multipart"** → `pip install python-multipart`.
- **Sessions** → `itsdangerous` must be installed.
