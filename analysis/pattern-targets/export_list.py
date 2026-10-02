"""Export the individual pattern trades for chart review + momentum breakdown (2 Oct 2026).
Usage: python3 export_list.py <out dir>   (reads <out dir>/pattern_trades.csv)"""
import os, sys
import numpy as np, pandas as pd
OUT = sys.argv[1]
R = pd.read_csv(os.path.join(OUT, "pattern_trades.csv"))
x = R[(R["mode"] == "early") & (R.k == 0.75) & R.kind.isin(["DOUBLE BOTTOM", "DOUBLE TOP"])].copy()
x["edge_R"] = x.R - x.R_placebo
cols = {"sym": "Symbol", "kind": "Pattern", "p1": "Bottom/Top 1", "neck": "Neckline date", "neck_price": "Neckline",
        "p_last": "Bottom/Top 2", "entry_date": "Entry date (early)", "entry": "Entry", "stop": "Stop",
        "target": "Target (75%)", "break_date": "Neckline break", "exit_date": "Exit date", "exit_price": "Exit",
        "exit": "Exit reason", "ret": "Return %", "R": "R"}
lst = x.sort_values(["kind", "sym", "entry_date"])[list(cols)].rename(columns=cols)
lst["Return %"] = lst["Return %"].round(2); lst["R"] = lst["R"].round(2)
with pd.ExcelWriter(os.path.join(OUT, "Pattern_Trades_List.xlsx")) as w:
    for k in ("DOUBLE BOTTOM", "DOUBLE TOP"):
        lst[lst.Pattern == k].to_excel(w, sheet_name=k.title(), index=False)
# momentum: speed of the move from the last bottom/top to the neckline break (ATR per bar)
out = ["Momentum of the move out of the pattern (bottom/top 2 -> neckline break, ATR per bar), patterns that broke:\n",
       "| Pattern | Speed tercile | n | bars to break | early-entry avg R | edge vs placebo | target hit |", "|---|---|---|---|---|---|---|"]
for k in ("DOUBLE BOTTOM", "DOUBLE TOP"):
    y = x[(x.kind == k) & x.speed_atr_per_bar.notna()].copy()
    y["bars_to_break"] = (pd.to_datetime(y.break_date) - pd.to_datetime(y.p_last)).dt.days * 5 / 7
    y["t"] = pd.qcut(y.speed_atr_per_bar, 3, labels=["slow", "medium", "fast"])
    for t, z in y.groupby("t", observed=True):
        out.append(f"| {k} | {t} | {len(z)} | {z.bars_to_break.median():.0f} | {z.R.mean():+.2f}R | {z.edge_R.mean():+.2f}R | {(z.exit=='target').mean()*100:.0f}% |")
txt = "\n".join(out)
open(os.path.join(OUT, "MOMENTUM_raw.md"), "w").write(txt)
print(txt)
print("\nrows exported:", len(lst))
