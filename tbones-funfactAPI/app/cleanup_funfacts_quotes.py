import os
import re
import shutil
import sqlite3
from datetime import datetime
from pathlib import Path

# ---- Konfig ----
DB_PATH = Path("/home/pi/github/web/tbones-funfactAPI/data/funfacts.db")

# ----------------

PATTERN = re.compile(r'^"(.*)"$', flags=re.S)

def strip_outer_quotes(s: str) -> str:
    s = s.strip()
    m = PATTERN.match(s)
    return m.group(1) if m else s

def main():
    if not DB_PATH.exists():
        raise SystemExit(f"Cant find database file: {DB_PATH}")

    # Backup
    ts = datetime.now().strftime("%Y%m%d-%H%M%S")
    backup_path = DB_PATH.with_name(f"{DB_PATH.stem}-backup-{ts}{DB_PATH.suffix}")
    shutil.copy2(DB_PATH, backup_path)
    print(f"[i] Backup created: {backup_path}")

    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row

    changed = 0
    skipped = 0

    try:
        with conn:  # transaksjon
            rows = conn.execute("SELECT id, text FROM funfacts").fetchall()
            for r in rows:
                original = r["text"]
                if not isinstance(original, str):
                    skipped += 1
                    continue

                cleaned = strip_outer_quotes(original)
                if cleaned != original:
                    conn.execute("UPDATE funfacts SET text = ? WHERE id = ?", (cleaned, r["id"]))
                    changed += 1
                else:
                    skipped += 1
    finally:
        conn.close()

    print(f"[✓] Finished. Changed: {changed}, Unchanged: {skipped}")
    print("Tip: If something went wrong, you can roll back by replacing DB with the backup:")
    print(f"      cp '{backup_path}' '{DB_PATH}'")

if __name__ == "__main__":
    main()