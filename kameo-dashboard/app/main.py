from __future__ import annotations
from pathlib import Path
import json

from fastapi import FastAPI, File, UploadFile, Request, Form
from fastapi.responses import HTMLResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
import pandas as pd

from .parser import (
    parse_text_to_tx_df,
    expand_to_daily,
    build_views,
    build_monthly_series,
)

# --- Paths / app setup ---
APP_DIR = Path(__file__).resolve().parent
ROOT_DIR = APP_DIR.parent
# Demo-filen ligger under app/demo/demo.txt
DEMO_PATH = APP_DIR / "demo" / "demo.txt"

# Husk sist rendret råtekst (demo / upload / paste) for eksport
LAST_RAW: str = ""

app = FastAPI(title="Kameo Dashboard")
templates = Jinja2Templates(directory=str(APP_DIR / "templates"))

STATIC_DIR = APP_DIR / "static"
STATIC_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


# ---------------- Helpers ----------------
def _fmt_for_template(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    for c in ["Date", "start_date", "end_date", "last_payment_date", "repayment_date"]:
        if c in out.columns:
            out[c] = pd.to_datetime(out[c], errors="coerce").dt.date.astype("string").fillna("").astype(str)
    for c in ["invested", "accumulated_interest", "estimated_total_interest", "interest_return_pct"]:
        if c in out.columns:
            out[c] = pd.to_numeric(out[c], errors="coerce").fillna(0.0).astype(float)
    return out


def _build_monthly_by_loan(tx: pd.DataFrame, daily: pd.DataFrame, monthly_df: pd.DataFrame) -> dict:
    """
    Per-lån månedsserier for filterbar graf.
    - Faktiske tall tas alltid med.
    - Estimater lages KUN for lån som ikke er repaid.
    """
    if tx.empty or daily.empty or monthly_df.empty:
        return {"months": [], "loans": {}}

    months_idx = list(monthly_df.index)
    months_str = [pd.to_datetime(m).date().strftime("%Y-%m") for m in months_idx]
    this_month = pd.Timestamp.today().normalize().replace(day=1)

    payload = {}
    for loan_id, g in daily.groupby("loan_id"):
        invested = float(g["invested"].max())
        rate = float(g["interest"].max())
        duration = int(g["duration"].max())
        is_repaid = bool(g["is_repaid"].max())

        t = tx[tx["loan_id"] == loan_id].copy()
        if t.empty:
            continue
        t["month"] = pd.to_datetime(t["date"]).values.astype("datetime64[M]")

        is_int = t["transaction_norm"].isin(["interest", "interest_penalty"])
        is_pri = t["transaction_norm"].eq("principal_repaid")

        # Ta abs() FØR groupby (kompatibelt med flere pandas-versjoner)
        ia = t.loc[is_int, "amount"].abs().groupby(t.loc[is_int, "month"]).sum()
        pa = t.loc[is_pri, "amount"].abs().groupby(t.loc[is_pri, "month"]).sum()

        ie, pe = {}, {}  # default: ingen estimater for repaid
        if not is_repaid:
            # Plan-start: første rentebetaling hvis finnes, ellers første dato
            int_days = g[g["interest_amount"].abs() > 0]
            sched_start = pd.to_datetime(int_days["Date"].min()) if not int_days.empty else pd.to_datetime(g["Date"].min())
            start_month = pd.Timestamp(sched_start.year, sched_start.month, 1)

            months_all = pd.period_range(start=start_month, periods=duration, freq="M").to_timestamp()
            months_future = [m for m in months_all if m >= this_month]

            # Gjenstående hovedstol
            principal_paid_before = t.loc[
                (t["transaction_norm"] == "principal_repaid") & (t["date"] < this_month),
                "amount",
            ].sum()
            remaining_principal = max(0.0, invested - float(principal_paid_before))

            def round_500(x: float) -> float:
                return 500.0 * round(float(x) / 500.0)

            n_left = len(months_future)
            base = round_500(remaining_principal / n_left) if n_left > 1 else remaining_principal

            # Fordel estimert hovedstol
            rem = remaining_principal
            for i, m in enumerate(months_future, start=1):
                if i < n_left:
                    pay = min(rem, base); pay = round_500(pay)
                else:
                    pay = rem
                pay = max(0.0, float(pay))
                rem -= pay
                pe[m] = pe.get(m, 0.0) + pay

            # Flat rente-estimat pr måned
            mi = invested * (rate / 100.0) / 12.0 if duration > 0 else 0.0
            ie = {m: mi for m in months_future}

            # Fjern overlapp i inneværende måned
            if this_month in ie:
                ie[this_month] = max(0.0, ie[this_month] - float(ia.get(this_month, 0.0)))
            if this_month in pe:
                pe[this_month] = max(0.0, pe[this_month] - float(pa.get(this_month, 0.0)))

        def arr(series_map): return [float(series_map.get(m, 0.0)) for m in months_idx]

        payload[str(int(loan_id))] = {
            "interest_actual": [float(ia.get(m, 0.0)) for m in months_idx],
            "principal_actual": [float(pa.get(m, 0.0)) for m in months_idx],
            "interest_estimated": arr(ie),
            "principal_estimated": arr(pe),
        }

    return {"months": months_str, "loans": payload}


def _make_context_from_text(raw: str):
    tx = parse_text_to_tx_df(raw)
    daily = expand_to_daily(tx)
    by_loan, by_company = build_views(daily)

    monthly_df = build_monthly_series(tx, daily)
    # Tving numeriske kolonner til float (robusthet)
    for c in ["interest_actual", "interest_estimated", "principal_actual", "principal_estimated"]:
        if c not in monthly_df.columns:
            monthly_df[c] = 0.0
        monthly_df[c] = pd.to_numeric(monthly_df[c], errors="coerce").fillna(0.0).astype("float64")

    months = [pd.to_datetime(m).date().strftime("%Y-%m") for m in monthly_df.index]
    monthly = {
        "months": months,
        "interest_actual": monthly_df["interest_actual"].round(2).tolist(),
        "interest_estimated": monthly_df["interest_estimated"].round(2).tolist(),
        "principal_actual": monthly_df["principal_actual"].round(2).tolist(),
        "principal_estimated": monthly_df["principal_estimated"].round(2).tolist(),
    }

    monthly_by_loan = _build_monthly_by_loan(tx, daily, monthly_df)

    kpis = {
        "companies": int(by_company.shape[0]),
        "loans": int(by_loan.shape[0]),
        "invested": float(by_company["invested"].sum()) if "invested" in by_company else 0.0,
        "accumulated_interest": float(by_company["accumulated_interest"].sum()) if "accumulated_interest" in by_company else 0.0,
        "est_total_interest": float(by_company["estimated_total_interest"].sum()) if "estimated_total_interest" in by_company else 0.0,
    }
    return {
        "tx": tx,
        "daily": daily,
        "by_loan": by_loan,
        "by_company": by_company,
        "kpis": kpis,
        "monthly": monthly,
        "monthly_by_loan": monthly_by_loan,
    }


def _render_full(request: Request, ctx: dict) -> HTMLResponse:
    return templates.TemplateResponse(
        "index.html",
        {
            "request": request,
            "kpis": ctx["kpis"],
            "by_company": _fmt_for_template(ctx["by_company"]).to_dict(orient="records"),
            "by_loan": _fmt_for_template(ctx["by_loan"]).to_dict(orient="records"),
            "monthly_json": json.dumps(ctx["monthly"]),
            "monthly_by_loan_json": json.dumps(ctx["monthly_by_loan"]),
        },
    )


def _render_dashboard_partial(request: Request, ctx: dict) -> HTMLResponse:
    return templates.TemplateResponse(
        "_dashboard.html",
        {
            "request": request,
            "kpis": ctx["kpis"],
            "by_company": _fmt_for_template(ctx["by_company"]).to_dict(orient="records"),
            "by_loan": _fmt_for_template(ctx["by_loan"]).to_dict(orient="records"),
            "monthly_json": json.dumps(ctx["monthly"]),
            "monthly_by_loan_json": json.dumps(ctx["monthly_by_loan"]),
        },
    )


# ---------------- Routes ----------------
@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    """Rendre side med demo hvis den finnes."""
    global LAST_RAW
    raw = DEMO_PATH.read_text(encoding="utf-8") if DEMO_PATH.exists() else ""
    LAST_RAW = raw
    ctx = _make_context_from_text(raw)
    return _render_full(request, ctx)


@app.post("/upload", response_class=HTMLResponse)
async def upload(
    request: Request,
    file: UploadFile | None = File(None),
    paste: str | None = Form(None),
):
    """Upload / paste – rendrer dashboard og husker sist brukte råtekst for eksport."""
    global LAST_RAW
    if paste and paste.strip():
        raw = paste
    elif file is not None:
        raw = (await file.read()).decode("utf-8", errors="ignore")
    else:
        # Ingen input – behold forrige datasett (eller fall tilbake til demo)
        raw = LAST_RAW if LAST_RAW else (DEMO_PATH.read_text(encoding="utf-8") if DEMO_PATH.exists() else "")

    LAST_RAW = raw
    ctx = _make_context_from_text(raw)
    return _render_dashboard_partial(request, ctx)


@app.get("/download/csv")
async def download_csv(view: str = "by_loan"):
    """
    Eksporterer CSV for gjeldende datasett (siste rendret råtekst).
    view = 'daily' | 'by_company' | 'by_loan'
    """
    raw = LAST_RAW if LAST_RAW is not None else ""
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
