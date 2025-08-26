# Kameo Dashboard
Small FastAPI + HTMX app to parse a Kameo `.txt` export and render metrics. Includes demo data and an upload form that renders **in memory only** (no persistence).


## Quickstart (Pi)
```bash
# 1) Clone
cd ~/github/raspberry-projects
mkdir -p kameo-dashboard && cd kameo-dashboard


# 2) Python & venv
python3 -m venv .venv
source .venv/bin/activate
pip install -U pip
pip install -r requirements.txt


# 3) Run locally
uvicorn app.main:app --host 0.0.0.0 --port 8090 --reload
# Browse to http://<pi-ip>:8090
```


## Systemd service
```bash
sudo cp service/kameo-dashboard.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable kameo-dashboard
sudo systemctl start kameo-dashboard
sudo systemctl status kameo-dashboard -n 100
```


## Caddy (reverse proxy)
Example site block to expose on `kameo.yourhost`:
```caddy
kameo.yourhost {
reverse_proxy 127.0.0.1:8090
}
```
Reload Caddy and you’re good.


## Notes
- Uploads are **not saved**. If you refresh or revisit, the app loads the bundled demo file.
- CSV download (`/download/csv`) uses the demo dataset by design. We can extend this to also stream the last uploaded dataset per-request if you want session-level downloads.
- Parser assumptions and formulas live in `app/parser.py` and are easy to tune.