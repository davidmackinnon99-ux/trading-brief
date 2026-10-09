// SID layout pre-scan check (9 Oct 2026). Run with `tv ui eval --code "$(cat scripts/sid-layout-check.js)"`.
// 1) A maximized main pane gives every lower pane height 0 → TradingView stops calculating
//    SID Trading Signals Pro, MACD Sep, ADX, RVOL… (24 Sep and 9 Oct SID scans aborted on this).
//    Restore it. 2) Report brief-critical studies that are hidden (eye off): hidden studies do
//    not calculate either (CAP Tools hidden = no supply/demand zones). Reported, not changed.
(function () {
  var c = window.TradingViewApi._activeChartWidgetWV.value()._chartWidget;
  var m = c.model().model();
  var out = { restoredMaximized: false, hidden: [] };
  try { var mp = m.maximizedPane().value(); if (mp) { c.model().toggleMaximizedPane(mp); out.restoredMaximized = true; } } catch (e) { out.err = e.message; }
  var critical = /SID Trading Signals Pro|CAP Tools Supplement|MACD Separation|ADX and DI|RVOL|Bollinger|Moving Average Ribbon/;
  m.dataSources().forEach(function (s) {
    try { var n = s.metaInfo().description || ''; if (critical.test(n) && s.properties().visible.value() === false) out.hidden.push(n); } catch (e) {}
  });
  return JSON.stringify(out);
})()
