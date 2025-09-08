import os
from pathlib import Path
from typing import List, Optional

from fastapi import FastAPI, HTTPException, Depends, Header, Query, Request
from starlette.middleware.sessions import SessionMiddleware
from dotenv import load_dotenv

from .db import get_conn, init_db
from .models import FunFactIn, FunFact

# Load .env next to this file (for API_TOKEN, SECRET_KEY)
load_dotenv(dotenv_path=Path(__file__).resolve().parent / ".env")

API_TOKEN = os.getenv("API_TOKEN")               # token for API writes
SECRET_KEY = os.getenv("SECRET_KEY", "dev-key")  # session cookie key (set a strong one in prod!)

app = FastAPI(title="Funfacts API", version="1.3.0")
init_db()

from .admin import router as admin_router
app.include_router(admin_router)

# Session cookie for admin login (/login -> sets request.session["auth"] = True)
# NOTE: Set https_only=True when running behind HTTPS (Caddy) in production.
app.add_middleware(
    SessionMiddleware,
    secret_key=SECRET_KEY,
    session_cookie="funfacts_sess",
    https_only=False,     # change to True when served over HTTPS
    same_site="lax"
)

def require_token(
    authorization: Optional[str] = Header(default=None),
    request: Request = None
):
    """
    Write-guard that allows either:
      1) Logged-in admin via session cookie (set at /login)
      2) Bearer token in Authorization header (for Homey/scripts)
    If API_TOKEN is not set, writes are open (dev mode).
    """
    # Session-auth (admin UI)
    if request and request.session.get("auth") is True:
        return

    # Bearer token (automation / Homey / curl)
    if not API_TOKEN:
        return  # open write if no token configured
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing Bearer token")
    token = authorization.split(" ", 1)[1]
    if token != API_TOKEN:
        raise HTTPException(status_code=403, detail="Invalid token")

@app.get("/health")
def health():
    return {"status": "ok"}

@app.get("/stats")
def stats():
    with get_conn() as conn:
        total = conn.execute("SELECT COUNT(*) AS c FROM funfacts").fetchone()["c"]
        latest = conn.execute(
            "SELECT created_at FROM funfacts ORDER BY id DESC LIMIT 1"
        ).fetchone()
        return {
            "count": total,
            "latest_created_at": latest["created_at"] if latest else None
        }

@app.get("/funfact", response_model=FunFact)
def get_random_funfact():
    # 100% uniform random via SQLite RNG, fine for hundreds/thousands of rows
    with get_conn() as conn:
        row = conn.execute(
            "SELECT id, text FROM funfacts ORDER BY RANDOM() LIMIT 1"
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="No funfacts yet")
        return {"id": row["id"], "text": row["text"]}

@app.get("/funfacts", response_model=List[FunFact])
def list_funfacts(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0)
):
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT id, text FROM funfacts ORDER BY id DESC LIMIT ? OFFSET ?",
            (limit, offset)
        ).fetchall()
        return [{"id": r["id"], "text": r["text"]} for r in rows]

@app.post("/funfacts", status_code=201)
def add_funfact(payload: FunFactIn, _=Depends(require_token)):
    text = (payload.text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Empty text")
    with get_conn() as conn:
        cur = conn.execute("INSERT INTO funfacts (text) VALUES (?)", (text,))
        conn.commit()
        return {"id": cur.lastrowid, "text": text}

@app.delete("/funfacts/{fact_id}", status_code=204)
def delete_funfact(fact_id: int, _=Depends(require_token)):
    with get_conn() as conn:
        cur = conn.execute("DELETE FROM funfacts WHERE id = ?", (fact_id,))
        conn.commit()
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Not found")
