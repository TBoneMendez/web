import sqlite3
from pathlib import Path

# peker til data/funfacts.db i prosjektroten
DB_PATH = Path(__file__).resolve().parent.parent / "data" / "funfacts.db"

def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    with get_conn() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS funfacts (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              text TEXT NOT NULL,
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.commit()
