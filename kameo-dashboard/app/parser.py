from __future__ import annotations
import re
from pathlib import Path
from typing import Tuple
import pandas as pd
from dateutil.relativedelta import relativedelta

# ---------- Helpers ----------
def _parse_decimal_no(x: str) -> float:
    x = (x or "").strip()
    if x in {"-", ""}:
        return 0.0
    x = x.replace("\xa0", "").replace(" ", "").replace(",", ".").replace("−", "-")
    return float(x)

def _parse_header(line: str):
    m = re.match(r"^(.*?)\s*-\s*(\d+)\s*\|\s*Løpetid:\s*([\d]+)\s*m.*?\|\s*Rente:\s*([\d,]+)%", line)
    if not m:
        return None
    return {
        "company": m.group(1).strip(),
        "loan_id": int(m.group(2)),
        "duration_months": int(m.group(3)),
        "interest_rate": float(m.group(4).replace(",", ".")),
    }

def _parse_table(block: str) -> pd.DataFrame:
    lines = block.strip().splitlines()
    try:
        start_idx = next(i for i, l in enumerate(lines) if l.strip().startswith("Dato"))
    except StopIteration:
        return pd.DataFrame()

    rows = []
    for r in lines[start_idx + 1:]:
        if r.strip().startswith("Totale renteinntekter"):
            break
        rows.append(r)

    parsed = []
    for r in rows:
        parts = r.split("\t") if "\t" in r else re.split(r"\s{2,}", r.strip())
        parts = (parts + [""] * 6)[:6]
        date_s, trans, amount_s, currency, _, amount_nok_s = parts[:6]
        parsed.append({
            "date": pd.to_datetime(date_s.strip(), format="%Y-%m-%d", errors="coerce"),
            "transaction": trans.strip(),
            "amount": _parse_decimal_no(amount_nok_s if amount_nok_s.strip() else amount_s),
            "currency": (currency or "NOK").strip() or "NOK",
        })

    return pd.DataFrame(parsed).dropna(subset=["date"]).reset_index(drop=True)

# ---------- Public API ----------
def parse_text_to_tx_df(raw: str) -> pd.DataFrame:
    lines = raw.splitlines()
    heads = [i for i, l in enumerate(lines) if _parse_header(l)]
    blocks = ["\n".join(lines[heads[i]: heads[i+1] if i+1 < len(heads) else len(lines)]) for i in range(len(heads))]

    rows = []
    for b in blocks:
        h = _parse_header(b.splitlines()[0])
        if not h: 
            continue
        t = _parse_table(b)
        if t.empty:
            continue
        for k, v in h.items():
            t[k] = v
        rows.append(t)

    tx = (pd.concat(rows, ignore_index=True)
            .sort_values(["loan_id", "date"])
            .reset_index(drop=True))

    tx["transaction_norm"] = tx["transaction"].replace({
        "Renteinntekt": "interest",
        "Forsinkelsesrente": "interest_penalty",
        "Tildeling": "allocation",
        "Tilbakebetaling": "principal_repaid",
    })
    return tx

def expand_to_daily(tx_df: pd.DataFrame) -> pd.DataFrame:
    def _expand(g: pd.DataFrame) -> pd.DataFrame:
        meta = g.iloc[0][["company", "loan_id", "duration_months", "interest_rate"]]
        start = g[g["transaction_norm"] == "allocation"]["date"].min()
        last  = g["date"].max()
        est_end = start + relativedelta(months=int(meta["duration_months"]))
        idx = pd.date_range(start=start, end=max(last, est_end), freq="D")
        daily = pd.DataFrame({"date": idx})

        # amounts by day
        daily["Amount"] = g.groupby("date")["amount"].sum().reindex(idx, fill_value=0.0).values
        for c in ["company", "loan_id", "duration_months", "interest_rate"]:
            daily[c] = meta[c]

        # accumulated interest
        is_int = g["transaction_norm"].isin(["interest", "interest_penalty"])
        int_cum = (g.loc[is_int, ["date", "amount"]]
                    .groupby("date").sum()
                    .reindex(idx, fill_value=0.0)
                    .cumsum())["amount"].values
        daily["accumulated_interest"] = int_cum

        # invested & repayment status
        invested = -g.loc[g["transaction_norm"] == "allocation", "amount"].sum()
        repaid_sum =  g.loc[g["transaction_norm"] == "principal_repaid", "amount"].sum()
        daily["invested"]  = float(invested)
        is_repaid = bool(repaid_sum >= invested and repaid_sum > 0)
        daily["is_repaid"] = is_repaid

        # last payment (interest/penalty/principal)
        last_payment = g.loc[
            g["transaction_norm"].isin(["interest", "interest_penalty", "principal_repaid"]),
            "date"
        ].max()
        daily["last_payment_date"] = last_payment

        # expected interest (simple model)
        monthly_interest = invested * (meta["interest_rate"] / 100.0) / 12.0
        daily["estimated_total_interest"] = float(monthly_interest * meta["duration_months"])
        daily["interest_return_pct"] = (
            (daily["accumulated_interest"] / daily["estimated_total_interest"]).clip(upper=1.0).fillna(0.0) * 100.0
        )
        return daily

    daily_df = (tx_df.groupby("loan_id", group_keys=False).apply(_expand).reset_index(drop=True)
                  .rename(columns={
                      "company": "Company",
                      "loan_id": "loan_id",
                      "duration_months": "duration",
                      "interest_rate": "interest",
                      "date": "Date",
                  })
                  .sort_values(["Company", "loan_id", "Date"]).reset_index(drop=True))
    return daily_df

def build_views(daily_df: pd.DataFrame) -> Tuple[pd.DataFrame, pd.DataFrame]:
    by_loan = (daily_df.groupby(["loan_id", "Company", "duration", "interest"], as_index=False)
        .agg(
            start_date=("Date", "min"),
            end_date=("Date", "max"),
            invested=("invested", "max"),
            accumulated_interest=("accumulated_interest", "max"),
            estimated_total_interest=("estimated_total_interest", "max"),
            interest_return_pct=("interest_return_pct", "max"),
            last_payment_date=("last_payment_date", "max"),
            repaid=("is_repaid", "max"),
        )
        .assign(status=lambda d: d["repaid"].map({True: "repaid", False: "active"}))
    )

    by_company = (by_loan.groupby(["Company"], as_index=False)
        .agg(
            loans=("loan_id", "count"),
            invested=("invested", "sum"),
            accumulated_interest=("accumulated_interest", "sum"),
            estimated_total_interest=("estimated_total_interest", "sum"),
            active_loans=("status", lambda s: (s == "active").sum()),
            repaid_loans=("status", lambda s: (s == "repaid").sum()),
        )
        .assign(interest_return_pct=lambda d: (d["accumulated_interest"] / d["estimated_total_interest"].replace(0, pd.NA)) * 100)
        .fillna({"interest_return_pct": 0.0})
        .sort_values(["Company"]).reset_index(drop=True)
    )
    return by_loan, by_company

def parse_file_to_views(path: Path) -> Tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    raw = path.read_text(encoding="utf-8")
    tx_df = parse_text_to_tx_df(raw)
    daily = expand_to_daily(tx_df)
    by_loan, by_company = build_views(daily)
    return daily, by_loan, by_company
