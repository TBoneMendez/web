# File: app/main.py
from __future__ import annotations
from pathlib import Path

from fastapi import FastAPI, File, UploadFile, Request
from fastapi.responses import HTMLResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
import pandas as pd

from .parser import parse_text_to_tx_df, expand_to_daily, build_views

APP_DIR = Path(__file__).resolve().parent
# Bytt til "Kameo.txt" hvis du fortsatt bruker det navnet
DEMO_PATH = APP_DIR / "demo" / "demo.txt"

app = FastAPI(title="Kameo Dashboard")
templates = Jinja2Templates(directory=str(APP_DIR / "templates"))

# (valgfritt) statiske filer-mappe hvis du senere vil legge inn egne css/js
STATIC_DIR = APP_DIR / "static"
if STATIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


# ----------------- helpers -----------------
def _make_context_from_text(raw: str):
    """Parse rå Kameo-tekst og bygg datastrukturer for templaten."""
    tx = parse_text_to_tx_df(raw)
    daily = expand_to_daily(tx)
    by_loan, by_company = build_views(daily)

    kpis = {
        "companies": int(by_company.shape[0]),
        "loans": int(by_loan.shape[0]),
        "invested": float(by_company["invested"].sum()),
        "accumulated_interest": float(by_company["accumulated_interest"].sum()),
        "est_total_interest": float(by_company["estimated_total_interest"].sum()),
    }
    return {"daily": daily, "by_loan": by_loan, "by_company": by_company, "kpis": kpis}


def _fmt_for_template(df: pd.DataFrame) -> pd.DataFrame:
    """Små justeringer for pen visning i tabeller/kort."""
    out = df.copy()
    for c in ["Date", "start_date", "end_date", "estimated_tilbakebetalt_date"]:
        if c in out.columns:
            out[c] = pd.to_datetime(out[c]).dt.date.astype(str)
    moneyish = [
        "invested",
        "accumulated_interest",
        "estimated_total_interest",
        "interest_return_pct",
    ]
    for c in moneyish:
        if c in out.columns:
            out[c] = out[c].astype(float)
    return out


def _render_full(request: Request, ctx: dict) -> HTMLResponse:
    """Render hele siden (index.html inneholder upload + dashboard-include)."""
    return templates.TemplateResponse(
        "index.html",
        {
            "request": request,
            "kpis": ctx["kpis"],
            "by_company": _fmt_for_template(ctx["by_company"]).to_dict(orient="records"),
            "by_loan": _fmt_for_template(ctx["by_loan"]).to_dict(orient="records"),
        },
    )


def _render_dashboard_partial(request: Request, ctx: dict) -> HTMLResponse:
    """Render bare dashboard-delen (brukes av HTMX upload)."""
    return templates.TemplateResponse(
        "_dashboard.html",
        {
            "request": request,
            "kpis": ctx["kpis"],
            "by_company": _fmt_for_template(ctx["by_company"]).to_dict(orient="records"),
            "by_loan": _fmt_for_template(ctx["by_loan"]).to_dict(orient="records"),
        },
    )


# ----------------- routes -----------------
@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    raw = DEMO_PATH.read_text(encoding="utf-8")
    ctx = _make_context_from_text(raw)
    return _render_full(request, ctx)


@app.post("/upload", response_class=HTMLResponse)
async def upload(request: Request, file: UploadFile = File(...)):
    # NB: Husk hx-encoding="multipart/form-data" på <form> i templaten.
    raw = (await file.read()).decode("utf-8", errors="ignore")
    ctx = _make_context_from_text(raw)
    return _render_dashboard_partial(request, ctx)


@app.get("/download/csv")
async def download_csv(view: str = "by_loan"):
    """Last ned CSV basert på DEMO-data (ikke last-upload, per design)."""
    raw = DEMO_PATH.read_text(encoding="utf-8")
    tx = parse_text_to_tx_df(raw)
    daily = expand_to_daily(tx)
    by_loan, by_company = build_views(daily)

    if view == "daily":
        df = daily
    elif view == "by_company":
        df = by_company
    else:
        df = by_loan

    csv = df.to_csv(index=False).encode("utf-8")
    return StreamingResponse(iter([csv]), media_type="text/csv")
