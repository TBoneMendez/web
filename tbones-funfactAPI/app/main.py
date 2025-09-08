import os, random
from fastapi import FastAPI, HTTPException, Depends, Header, Query
from typing import List, Optional
from .db import get_conn, init_db
from .models import FunFactIn, FunFact
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(dotenv_path=Path(__file__).resolve().parent / ".env")

API_TOKEN = os.getenv("API_TOKEN")  # set in .env or systemd Environment

app = FastAPI(title="Funfacts API", version="1.0.0")
init_db()

def require_token(authorization: Optional[str] = Header(default=None)):
    if not API_TOKEN:
        return  # open write if no token set
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing Bearer token")
    token = authorization.split(" ", 1)[1]
    if token != API_TOKEN:
        raise HTTPException(status_code=403, detail="Invalid token")

@app.get("/health")
def health():
    return {"status": "ok"}

@app.get("/funfact", response_model=FunFact)
def get_random_funfact():
    with get_conn() as conn:
        row = conn.execute("SELECT id, text FROM funfacts ORDER BY RANDOM() LIMIT 1").fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="No funfacts yet")
        return {"id": row["id"], "text": row["text"]}

@app.get("/funfacts", response_model=List[FunFact])
def list_funfacts(limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0)):
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT id, text FROM funfacts ORDER BY id DESC LIMIT ? OFFSET ?",
            (limit, offset)
        ).fetchall()
        return [{"id": r["id"], "text": r["text"]} for r in rows]

@app.post("/funfacts", status_code=201)
def add_funfact(payload: FunFactIn, _=Depends(require_token)):
    with get_conn() as conn:
        cur = conn.execute("INSERT INTO funfacts (text) VALUES (?)", (payload.text.strip(),))
        conn.commit()
        return {"id": cur.lastrowid, "text": payload.text.strip()}

@app.delete("/funfacts/{fact_id}", status_code=204)
def delete_funfact(fact_id: int, _=Depends(require_token)):
    with get_conn() as conn:
        cur = conn.execute("DELETE FROM funfacts WHERE id = ?", (fact_id,))
        conn.commit()
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Not found")
