from __future__ import annotations
import re
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
    # "<Company> - <loan_id> | Løpetid: <m> m | Rente: <r>%"
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
    # Tom-robust: returner riktig-formet DF
    empty_cols = ["date","transaction","amount","currency",
                  "company","loan_id","duration_months","interest_rate",
                  "transaction_norm"]
    if not raw or not raw.strip():
        return pd.DataFrame(columns=empty_cols)

    lines = raw.splitlines()
    heads = [i for i, l in enumerate(lines) if _parse_header(l)]
    if not heads:
        return pd.DataFrame(columns=empty_cols)

    blocks = ["\n".join(lines[heads[i]: heads[i+1] if i+1 < len(heads) else len(lines)])
              for i in range(len(heads))]

    rows = []
    for b in blocks:
        h = _parse_header(b.splitlines()[0]);  t = _parse_table(b)
        if not h or t.empty:
            continue
        for k, v in h.items():
            t[k] = v
        rows.append(t)

    if not rows:
        return pd.DataFrame(columns=empty_cols)

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
    # Tomt inn => tom DF med forventede kolonner
    if tx_df.empty:
        return pd.DataFrame(columns=[
            "Company","loan_id","duration","interest","Date","Amount",
            "interest_amount","principal_amount","accumulated_interest",
            "invested","is_repaid","last_payment_date",
            "estimated_total_interest","interest_return_pct"
        ])

    def _expand(g: pd.DataFrame) -> pd.DataFrame:
        meta = g.iloc[0][["company", "loan_id", "duration_months", "interest_rate"]]
        start = g[g["transaction_norm"] == "allocation"]["date"].min()
        last  = g["date"].max()
        est_end = start + relativedelta(months=int(meta["duration_months"]))
        idx = pd.date_range(start=start, end=max(last, est_end), freq="D")
        daily = pd.DataFrame({"date": idx})

        # totals per dag
        daily["Amount"] = g.groupby("date")["amount"].sum().reindex(idx, fill_value=0.0).values
        for c in ["company", "loan_id", "duration_months", "interest_rate"]:
            daily[c] = meta[c]

        # interest/principal per dag
        is_int = g["transaction_norm"].isin(["interest", "interest_penalty"])
        interest_by_day = (g.loc[is_int, ["date", "amount"]]
                             .groupby("date").sum()
                             .reindex(idx, fill_value=0.0))["amount"]
        principal_by_day = (g.loc[g["transaction_norm"]=="principal_repaid", ["date","amount"]]
                              .groupby("date").sum()
                              .reindex(idx, fill_value=0.0))["amount"]
        daily["interest_amount"] = interest_by_day.values
        daily["principal_amount"] = principal_by_day.values

        # akk. rente
        daily["accumulated_interest"] = interest_by_day.cumsum().values

        # invested, status, last payment
        invested = -g.loc[g["transaction_norm"] == "allocation", "amount"].sum()
        repaid_sum =  g.loc[g["transaction_norm"] == "principal_repaid", "amount"].sum()
        daily["invested"]  = float(invested)
        daily["is_repaid"] = bool(repaid_sum >= invested and repaid_sum > 0)
        daily["last_payment_date"] = g.loc[
            g["transaction_norm"].isin(["interest","interest_penalty","principal_repaid"]), "date"
        ].max()

        # expected totals (for % return på kort)
        monthly_interest = invested * (meta["interest_rate"] / 100.0) / 12.0
        daily["estimated_total_interest"] = float(monthly_interest * meta["duration_months"])
        daily["interest_return_pct"] = (
            (daily["accumulated_interest"] / daily["estimated_total_interest"]).clip(upper=1.0).fillna(0.0) * 100.0
        )
        return daily

    daily_df = (tx_df.groupby("loan_id", group_keys=False)
                    .apply(_expand)
                    .reset_index(drop=True)
                    .rename(columns={
                        "company": "Company",
                        "loan_id": "loan_id",
                        "duration_months": "duration",
                        "interest_rate": "interest",
                        "date": "Date",
                    })
                    .sort_values(["Company", "loan_id", "Date"])
                    .reset_index(drop=True))
    return daily_df


def build_views(daily_df: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    """
    by_loan / by_company med:
      - start_date = første renteinntektsdato om den finnes, ellers første dato (Tildeling)
      - end_date   = start_date + antall terminer (måneder)
      - repayment_date-regler som tidligere:
          1) Har Tilbakebetaling -> bruk SISTE dato med principal_amount > 0
          2) Ellers, har Renteinntekt -> første rente + antall terminer
          3) Ellers -> første dato + antall terminer
    """
    if daily_df.empty:
        by_loan = pd.DataFrame(columns=[
            "loan_id","Company","duration","interest","start_date","end_date",
            "invested","accumulated_interest","estimated_total_interest",
            "interest_return_pct","last_payment_date","repaid",
            "repayment_date","status"
        ])
        by_company = pd.DataFrame(columns=[
            "Company","loans","invested","accumulated_interest","estimated_total_interest",
            "active_loans","repaid_loans","assigned_loans","interest_return_pct"
        ])
        return by_loan, by_company

    # --- Beregn start/end per lån etter ønsket regel ---
    start_end_rows = []
    for loan_id, g in daily_df.groupby("loan_id"):
        g = g.sort_values("Date")
        duration = int(g["duration"].iloc[0])

        int_mask = (g["interest_amount"].abs() > 0)
        if int_mask.any():
            start_dt = pd.to_datetime(g.loc[int_mask, "Date"].min())
        else:
            start_dt = pd.to_datetime(g["Date"].min())

        end_dt = start_dt + relativedelta(months=+duration)
        start_end_rows.append((loan_id, start_dt, end_dt))

    start_end_df = pd.DataFrame(start_end_rows, columns=["loan_id", "start_date", "end_date"])

    # --- Aggregater per lån (uten start/end), så merger vi inn våre start/end ---
    by_loan = (daily_df.groupby(["loan_id", "Company", "duration", "interest"], as_index=False)
        .agg(
            invested=("invested", "max"),
            accumulated_interest=("accumulated_interest", "max"),
            estimated_total_interest=("estimated_total_interest", "max"),
            interest_return_pct=("interest_return_pct", "max"),
            last_payment_date=("last_payment_date", "max"),
            repaid=("is_repaid", "max"),
        )
    ).merge(start_end_df, on="loan_id", how="left")

    # --- Repayment date etter tidligere regler ---
    def repayment_date_for_group(g: pd.DataFrame) -> pd.Timestamp:
        mask_pri = (g["principal_amount"].abs() > 0)
        if mask_pri.any():
            return pd.to_datetime(g.loc[mask_pri, "Date"].max())
        mask_int = (g["interest_amount"].abs() > 0)
        duration = int(g["duration"].iloc[0])
        if mask_int.any():
            first_interest = pd.to_datetime(g.loc[mask_int, "Date"].min())
            return first_interest + relativedelta(months=+duration)
        first_date = pd.to_datetime(g["Date"].min())
        return first_date + relativedelta(months=+duration)

    rep_dates = []
    for loan_id, g in daily_df.groupby("loan_id"):
        rep_dates.append((loan_id, repayment_date_for_group(g)))
    rep_df = pd.DataFrame(rep_dates, columns=["loan_id", "repayment_date"])
    by_loan = by_loan.merge(rep_df, on="loan_id", how="left")

    # --- Status ---
    def _status(row):
        if row["repaid"]:
            return "repaid"
        if pd.isna(row["last_payment_date"]) or row["accumulated_interest"] == 0:
            return "assigned"
        return "active"
    by_loan["status"] = by_loan.apply(_status, axis=1)

    # --- By company ---
    by_company = (by_loan.groupby(["Company"], as_index=False)
        .agg(
            loans=("loan_id", "count"),
            invested=("invested", "sum"),
            accumulated_interest=("accumulated_interest", "sum"),
            estimated_total_interest=("estimated_total_interest", "sum"),
            active_loans=("status", lambda s: (s == "active").sum()),
            repaid_loans=("status", lambda s: (s == "repaid").sum()),
            assigned_loans=("status", lambda s: (s == "assigned").sum()),
        )
        .assign(
            interest_return_pct=lambda d:
                (d["accumulated_interest"] / d["estimated_total_interest"].replace(0, pd.NA)) * 100
        )
        .fillna({"interest_return_pct": 0.0})
        .sort_values(["Company"])
        .reset_index(drop=True)
    )

    return by_loan, by_company


def build_monthly_series(tx_df: pd.DataFrame, daily_df: pd.DataFrame) -> pd.DataFrame:
    """
    Månedlig serie med kolonner:
      - interest_actual / principal_actual (fra transaksjoner, abs())
      - interest_estimated / principal_estimated:
          • Start = første rente-dato hvis finnes, ellers første dato
          • Hovedstol i 500-trinn (siste måned tar rest) fra og med inneværende måned
          • I inneværende måned: Estimated -= Actual (ingen overlapp)
      • Fullt nedbetalte lån hoppes over i estimatet
    Tom-robust: returnerer float-kolonner selv ved tom input.
    """
    # Tom-sikring: gi tilbake rene float-kolonner
    if tx_df.empty or daily_df.empty:
        return pd.DataFrame(
            columns=[
                "interest_actual", "principal_actual",
                "interest_estimated", "principal_estimated"
            ],
            dtype="float64",
        )

    tx = tx_df.copy()
    tx["month"] = pd.to_datetime(tx["date"]).values.astype("datetime64[M]")

    # Faktiske summer per måned (abs())
    is_int = tx["transaction_norm"].isin(["interest", "interest_penalty"])
    is_pri = tx["transaction_norm"].eq("principal_repaid")
    actual = pd.DataFrame({
        "interest_actual":  tx.loc[is_int, "amount"].abs().groupby(tx.loc[is_int, "month"]).sum(),
        "principal_actual": tx.loc[is_pri, "amount"].abs().groupby(tx.loc[is_pri, "month"]).sum(),
    }).fillna(0.0)

    today = pd.Timestamp.today().normalize()
    this_month = pd.Timestamp(today.year, today.month, 1)

    est_rows = []
    def round_500(x: float) -> float:
        return 500.0 * round(float(x) / 500.0)

    for loan_id, g in daily_df.groupby("loan_id"):
        invested = float(g["invested"].max())
        rate     = float(g["interest"].max())
        duration = int(g["duration"].max())

        # Plan-start
        int_mask = (g["interest_amount"].abs() > 0)
        sched_start = (
            pd.to_datetime(g.loc[int_mask, "Date"].min())
            if int_mask.any() else pd.to_datetime(g["Date"].min())
        )
        start_month = pd.Timestamp(sched_start.year, sched_start.month, 1)

        # Hopp over helt nedbetalte lån
        if bool(g["is_repaid"].max()):
            continue

        months_all = pd.period_range(start=start_month, periods=duration, freq="M").to_timestamp()
        months_future = [m for m in months_all if m >= this_month]
        if not months_future:
            continue

        principal_paid_before = tx_df.loc[
            (tx_df["loan_id"] == loan_id) &
            (tx_df["transaction_norm"] == "principal_repaid") &
            (tx_df["date"] < this_month),
            "amount"
        ].sum()
        remaining_principal = max(0.0, invested - float(principal_paid_before))

        n_left = len(months_future)
        base = round_500(remaining_principal / n_left) if n_left > 1 else remaining_principal

        monthly_interest = invested * (rate / 100.0) / 12.0 if duration > 0 else 0.0

        rem = remaining_principal
        for i, m in enumerate(months_future, start=1):
            if i < n_left:
                pay = min(rem, base); pay = round_500(pay)
            else:
                pay = rem
            pay = max(0.0, float(pay))
            rem -= pay

            est_rows.append({
                "month": m,
                "interest_estimated": monthly_interest,
                "principal_estimated": pay,
            })

    est = pd.DataFrame(est_rows).groupby("month").sum() if est_rows else pd.DataFrame()
    monthly = actual.join(est, how="outer").fillna(0.0).sort_index()

    # Fjern overlapp i inneværende måned
    if this_month in monthly.index:
        monthly.loc[this_month, "interest_estimated"]  = max(
            0.0, monthly.loc[this_month, "interest_estimated"]  - monthly.loc[this_month, "interest_actual"]
        )
        monthly.loc[this_month, "principal_estimated"] = max(
            0.0, monthly.loc[this_month, "principal_estimated"] - monthly.loc[this_month, "principal_actual"]
        )

    # Sørg for rene float-kolonner uansett
    for c in ["interest_actual","principal_actual","interest_estimated","principal_estimated"]:
        if c not in monthly.columns:
            monthly[c] = 0.0
        monthly[c] = pd.to_numeric(monthly[c], errors="coerce").fillna(0.0).astype("float64")

    return monthly
