"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import Settings, { loadSettings, type UserSettings } from "./Settings";
import type { AISignal, NewsAnalysis } from "@/lib/providers/types";
import type { StockQuote } from "@/lib/psx";

// ─── Colour palette ────────────────────────────────────────────────────────
const C = {
  bg: "#0f0f0f", card: "#181818", border: "#222", border2: "#2a2a2a",
  text: "#e8e8e8", muted: "#888", dim: "#555",
  green: "#4a9966", greenDim: "#1a3020", greenText: "#5dbf7f",
  red: "#c05050", redDim: "#2a1515", redText: "#e06060",
  amber: "#c8a060", amberDim: "#2a2010", amberText: "#e0b870",
  blue: "#4a80c0", blueDim: "#12202a", blueText: "#6aa0e0",
  purple: "#8a6fd0", purpleDim: "#1a1228", purpleText: "#b09ff0",
};

// ─── Signal pill ───────────────────────────────────────────────────────────
const PILL_MAP: Record<string, { bg: string; color: string; border: string }> = {
  STRONG_BUY: { bg: C.greenDim, color: C.greenText, border: C.green },
  BUY:        { bg: C.greenDim, color: C.greenText, border: C.green },
  WATCH:      { bg: C.blueDim,  color: C.blueText,  border: C.blue  },
  HOLD:       { bg: C.amberDim, color: C.amberText, border: C.amber },
  SELL:       { bg: C.redDim,   color: C.redText,   border: C.red   },
  AVOID:      { bg: C.redDim,   color: C.redText,   border: C.red   },
};
function Pill({ signal, small }: { signal?: string; small?: boolean }) {
  const s = PILL_MAP[signal?.toUpperCase() ?? ""] ?? PILL_MAP.WATCH;
  return (
    <span style={{
      background: s.bg, color: s.color, border: `0.5px solid ${s.border}`,
      borderRadius: 20, padding: small ? "1px 7px" : "2px 9px",
      fontSize: small ? 9 : 10, fontWeight: 600, letterSpacing: 0.3, whiteSpace: "nowrap"
    }}>{signal?.toUpperCase() ?? "—"}</span>
  );
}

function ConfBar({ pct, signal }: { pct: number; signal?: string }) {
  const col = signal === "BUY" || signal === "STRONG_BUY" ? C.green
            : signal === "SELL" || signal === "AVOID" ? C.red
            : signal === "HOLD" ? C.amber : C.blue;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
      <span style={{ fontSize: 9, color: C.dim, whiteSpace: "nowrap" }}>AI confidence</span>
      <div style={{ flex: 1, height: 2, background: C.border2, borderRadius: 2 }}>
        <div style={{ width: `${pct}%`, height: 2, background: col, borderRadius: 2, transition: "width 0.6s ease" }} />
      </div>
      <span style={{ fontSize: 9, color: C.muted, minWidth: 28, textAlign: "right" }}>{pct}%</span>
    </div>
  );
}

// ─── PKT clock ─────────────────────────────────────────────────────────────
function isPKTOpen() {
  const pkt = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Karachi" }));
  const h = pkt.getHours(), m = pkt.getMinutes(), day = pkt.getDay();
  if (day === 0 || day === 6) return false;
  const mins = h * 60 + m;
  if (day === 5) return (mins >= 570 && mins <= 720) || (mins >= 870 && mins <= 930);
  return mins >= 570 && mins <= 930;
}
function PKTClock() {
  const [t, setT] = useState(""); const [open, setOpen] = useState(false);
  useEffect(() => {
    const tick = () => {
      const pkt = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Karachi" }));
      setT(pkt.toLocaleTimeString("en-PK", { hour: "2-digit", minute: "2-digit" }));
      setOpen(isPKTOpen());
    };
    tick(); const id = setInterval(tick, 30000); return () => clearInterval(id);
  }, []);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: C.muted }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: open ? C.green : C.dim, display: "inline-block" }} />
      <span>KSE-100 · {t} PKT · {open ? "Open" : "Closed"}</span>
    </div>
  );
}

// ─── Technical data (from /api/technicals) ─────────────────────────────────
interface StockTech {
  symbol: string;
  compositeScore: number;
  technicalSignal: string;
  rsi: number;
  ema20: number;
  ema50: number;
  volumeRatio: number;
  crossoverSignal: string;
  priceVsEma20: string;
  reasons: string[];
}

// ─── Holdings ──────────────────────────────────────────────────────────────
interface Holding { ticker: string; name: string; shares: number; avgPrice: number; shariah: boolean; }
const DEFAULT_HOLDINGS: Holding[] = [
  { ticker: "BNL", name: "Bunny's Ltd", shares: 13450, avgPrice: 7.14, shariah: true },
];

// ─── Watchlist ─────────────────────────────────────────────────────────────
interface WatchItem { ticker: string; name: string; }

const s_label: React.CSSProperties = { fontSize: 10, fontWeight: 500, color: C.muted, textTransform: "uppercase", letterSpacing: 0.5 };
const cardStyle: React.CSSProperties = { background: C.card, borderRadius: 8, border: `0.5px solid ${C.border}`, padding: "10px 12px", marginBottom: 8 };
const inputSt: React.CSSProperties = { flex: 1, fontSize: 11, padding: "4px 8px", borderRadius: 5, border: `0.5px solid ${C.border2}`, background: "#111", color: C.text, outline: "none" };
const btnSt: React.CSSProperties = { fontSize: 10, padding: "4px 10px", borderRadius: 5, border: `0.5px solid ${C.border2}`, background: "transparent", color: C.muted, cursor: "pointer" };
const accentBtn: React.CSSProperties = { ...btnSt, borderColor: C.green + "80", color: C.greenText };
const dangerBtn: React.CSSProperties = { ...btnSt, borderColor: C.amber + "60", color: C.amberText };

// ─── Main Dashboard ────────────────────────────────────────────────────────
export default function Dashboard() {
  // Persistence
  const [holdings, setHoldings] = useState<Holding[]>(() => {
    try { return JSON.parse(localStorage.getItem("psx_holdings") ?? "null") ?? DEFAULT_HOLDINGS; } catch { return DEFAULT_HOLDINGS; }
  });
  const [watching, setWatching] = useState<WatchItem[]>(() => {
    try { return JSON.parse(localStorage.getItem("psx_watch") ?? "null") ?? []; } catch { return []; }
  });

  useEffect(() => { localStorage.setItem("psx_holdings", JSON.stringify(holdings)); }, [holdings]);
  useEffect(() => { localStorage.setItem("psx_watch", JSON.stringify(watching)); }, [watching]);

  // Prices
  const [prices, setPrices] = useState<Record<string, StockQuote>>({});
  const [loadingPrices, setLoadingPrices] = useState(false);
  const [lastUpdated, setLastUpdated] = useState("");
  const [serverOnline, setServerOnline] = useState<boolean | null>(null);

  // Scanner
  const [scanResult, setScanResult] = useState<{
    signals: AISignal[];
    newsAnalysis: NewsAnalysis | null;
    expandedSectors: string[];
    totalScanned: number;
    passedTechnicals: number;
    timestamp: string;
  } | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState("");
  const [scanPhase, setScanPhase] = useState(""); // for status display

  // Watch signals (separate lightweight scan)
  const [watchSignals, setWatchSignals] = useState<Record<string, AISignal>>({});
  const [loadingWatchAI, setLoadingWatchAI] = useState(false);
  // Watchlist technical data (from /api/technicals)
  const [watchTech, setWatchTech] = useState<Record<string, StockTech>>({});
  const [loadingWatchTech, setLoadingWatchTech] = useState(false);

  // Settings
  const [settings, setSettings] = useState<UserSettings>(() => loadSettings());
  const [showSettings, setShowSettings] = useState(false);

  // UI state
  const [tab, setTab] = useState<"opportunities" | "holdings" | "watching">("opportunities");
  const [newHolding, setNewHolding] = useState({ ticker: "", shares: "", avg: "" });
  const [newWatch, setNewWatch] = useState("");
  const [holdingError, setHoldingError] = useState("");
  const [watchError, setWatchError] = useState("");
  const [addingHolding, setAddingHolding] = useState(false);
  const [addingWatch, setAddingWatch] = useState(false);

  // ── Price fetching ──────────────────────────────────────────────────────
  const allTickers = [...new Set([
    ...holdings.map(h => h.ticker),
    ...watching.map(w => w.ticker),
  ])];

  const fetchPrices = useCallback(async () => {
    if (!allTickers.length) return;
    setLoadingPrices(true);
    try {
      const res = await fetch("/api/prices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbols: allTickers }),
      });
      if (res.ok) {
        const data = await res.json();
        setPrices(data);
        setServerOnline(true);
        const pkt = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Karachi" }));
        setLastUpdated(pkt.toLocaleTimeString("en-PK", { hour: "2-digit", minute: "2-digit" }) + " PKT");
      } else {
        setServerOnline(false);
      }
    } catch { setServerOnline(false); }
    setLoadingPrices(false);
  }, [allTickers.join(",")]); // eslint-disable-line

  // Fetch on mount, and whenever the ticker list changes (new holding / watch item added)
  useEffect(() => { fetchPrices(); }, [fetchPrices]); // eslint-disable-line
  // Refresh prices every 60s
  useEffect(() => { const id = setInterval(fetchPrices, 60000); return () => clearInterval(id); }, []); // eslint-disable-line

  // ── Full scanner ────────────────────────────────────────────────────────
  const runFullScan = async () => {
    if (!settings.apiKey) { setShowSettings(true); return; }
    setScanning(true); setScanError(""); setScanPhase("Searching for latest Pakistan & global news…");
    try {
      setScanPhase("Pass 1 · Analysing macro conditions & identifying sectors…");
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: settings.provider, apiKey: settings.apiKey, model: settings.model, mode: "full" }),
      });
      const data = await res.json();
      if (!res.ok) {
        // Clean up common API errors into readable messages
        const raw = data.error ?? "Scan failed";
        if (raw.includes("quota") || raw.includes("429") || raw.includes("Too Many Requests"))
          throw new Error("API quota exceeded. Add billing to your AI provider account, or switch providers in Settings.");
        if (raw.includes("401") || raw.includes("403") || raw.includes("invalid") || raw.includes("API key"))
          throw new Error("Invalid API key. Double-check it in Settings — make sure you copied the full key.");
        throw new Error(raw.length > 200 ? raw.slice(0, 200) + "…" : raw);
      }
      setScanPhase("Pass 2 · Scoring technicals & selecting best picks…");
      setScanResult({
        signals: data.signals ?? [],
        newsAnalysis: data.newsAnalysis ?? null,
        expandedSectors: data.expandedSectors ?? [],
        totalScanned: data.totalScanned ?? 0,
        passedTechnicals: data.passedTechnicals ?? 0,
        timestamp: data.timestamp,
      });
    } catch (e) {
      setScanError(e instanceof Error ? e.message : "Unknown error");
    }
    setScanning(false); setScanPhase("");
  };

  const runNewsRefresh = async () => {
    if (!settings.apiKey) { setShowSettings(true); return; }
    setScanning(true); setScanError(""); setScanPhase("Refreshing news only…");
    try {
      const res = await fetch("/api/news", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: settings.provider, apiKey: settings.apiKey, model: settings.model }),
      });
      const news = await res.json();
      if (!res.ok) throw new Error(news.error ?? "News refresh failed");
      setScanResult(prev => prev ? { ...prev, newsAnalysis: news } : null);
    } catch (e) {
      setScanError(e instanceof Error ? e.message : "Unknown error");
    }
    setScanning(false); setScanPhase("");
  };

  // KMI-30 list for Shariah auto-detection (client-side)
  const KMI30 = new Set([
    "MEBL","HBL","UBL","MCB","BAHL",
    "OGDC","PPL","PSO","MARI","POL",
    "LUCK","MLCF","CHCC","DGKC","PIOC",
    "ENGRO","EFERT","FFC","FATIMA","NRL",
    "HUBC","KAPCO","KEL","NCPL","PKGP",
    "SYS","TRG","AVN","COLG","EPCL",
  ]);

  /** Validate ticker exists on PSX by calling the prices API. */
  async function validateTicker(symbol: string): Promise<{ valid: boolean; quote?: StockQuote }> {
    try {
      const res = await fetch("/api/prices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbols: [symbol] }),
      });
      if (!res.ok) return { valid: false };
      const data: Record<string, StockQuote> = await res.json();
      const quote = data[symbol];
      return quote ? { valid: true, quote } : { valid: false };
    } catch {
      return { valid: false };
    }
  }

  // ── Holdings helpers ────────────────────────────────────────────────────
  const addHolding = async () => {
    const t = newHolding.ticker.toUpperCase().trim().replace(/[^A-Z0-9]/g, "");
    const shares = parseFloat(newHolding.shares);
    const avg = parseFloat(newHolding.avg);
    if (!t) { setHoldingError("Enter a ticker symbol (e.g. OGDC)."); return; }
    if (!shares || shares <= 0) { setHoldingError("Enter a valid number of shares."); return; }
    if (!avg || avg <= 0) { setHoldingError("Enter a valid average purchase price."); return; }
    setHoldingError("");
    setAddingHolding(true);
    const { valid, quote } = await validateTicker(t);
    setAddingHolding(false);
    if (!valid) {
      setHoldingError(`"${t}" not found on PSX. Check the ticker symbol and try again.`);
      return;
    }
    const isShariah = KMI30.has(t);
    // Update prices immediately with the validated quote
    if (quote) setPrices(prev => ({ ...prev, [t]: quote }));
    setHoldings(prev => [...prev.filter(h => h.ticker !== t), {
      ticker: t,
      name: quote?.sector ? `${t} · ${quote.sector}` : t,
      shares,
      avgPrice: avg,
      shariah: isShariah,
    }]);
    setNewHolding({ ticker: "", shares: "", avg: "" });
  };

  const addWatch = async () => {
    const t = newWatch.toUpperCase().trim().replace(/[^A-Z0-9]/g, "");
    if (!t) return;
    if (watching.find(w => w.ticker === t)) { setNewWatch(""); return; }
    setWatchError("");
    setAddingWatch(true);
    const { valid, quote } = await validateTicker(t);
    setAddingWatch(false);
    if (!valid) {
      setWatchError(`"${t}" not found on PSX. Check the ticker symbol.`);
      return;
    }
    if (quote) setPrices(prev => ({ ...prev, [t]: quote }));
    setWatching(prev => [...prev, {
      ticker: t,
      name: quote?.sector ? `${t} · ${quote.sector}` : t,
    }]);
    setNewWatch("");
  };

  // ── Quick-add from scan results (no PSX validation needed) ─────────────
  const quickAddWatch = (ticker: string) => {
    if (!watching.find(w => w.ticker === ticker)) {
      setWatching(prev => [...prev, { ticker, name: ticker }]);
    }
  };

  // ── Fetch technicals for all watchlist tickers ───────────────────────────
  const fetchWatchTech = async () => {
    if (!watching.length) return;
    setLoadingWatchTech(true);
    const results: Record<string, StockTech> = {};
    await Promise.allSettled(
      watching.map(async (w) => {
        try {
          const res = await fetch(`/api/technicals?symbol=${w.ticker}`);
          if (res.ok) results[w.ticker] = await res.json();
        } catch { /* ignore */ }
      })
    );
    setWatchTech(prev => ({ ...prev, ...results }));
    setLoadingWatchTech(false);
  };

  // ── Holding suggestion from scan data or P&L ────────────────────────────
  const getHoldingSuggestion = (ticker: string, pnlPct: number | null) => {
    const aiSig = scanResult?.signals.find(s => s.ticker === ticker);
    if (aiSig) return { signal: aiSig.signal, text: aiSig.reason, source: "AI scan" };
    const tech = watchTech[ticker] as StockTech | undefined;
    if (tech) return { signal: tech.technicalSignal, text: tech.reasons[0] ?? "Based on technicals", source: "Technicals" };
    if (pnlPct !== null) {
      if (pnlPct >= 20) return { signal: "HOLD", text: "Up 20%+ — consider booking partial profits", source: "P&L" };
      if (pnlPct >= 5)  return { signal: "HOLD", text: "In profit — hold and monitor for continuation", source: "P&L" };
      if (pnlPct >= -8) return { signal: "HOLD", text: "Near cost — hold and watch for a move", source: "P&L" };
      return { signal: "WATCH", text: "Down significantly — run a scan for full AI analysis", source: "P&L" };
    }
    return null;
  };

  // ── Render ──────────────────────────────────────────────────────────────
  const hasKey = !!settings.apiKey;

  return (
    <div style={{ background: C.bg, color: C.text, fontFamily: "'Segoe UI', system-ui, sans-serif", fontSize: 13, minHeight: "100vh" }}>

      {/* HEADER */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", borderBottom: `0.5px solid ${C.border}`, position: "sticky", top: 0, background: C.bg, zIndex: 50 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 14, fontWeight: 600, letterSpacing: -0.3 }}>PSX Scanner</span>
          {serverOnline === false && <span style={{ fontSize: 10, color: C.redText, background: C.redDim, padding: "2px 7px", borderRadius: 10 }}>PSX offline</span>}
          {loadingPrices && <span style={{ fontSize: 10, color: C.muted }}>refreshing prices…</span>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <PKTClock />
          <button onClick={fetchPrices} style={btnSt}>↻</button>
          <button onClick={() => setShowSettings(true)} style={{ ...btnSt, color: hasKey ? C.greenText : C.amberText, borderColor: hasKey ? C.green + "60" : C.amber + "60" }}>
            ⚙ {hasKey ? settings.provider : "Set API Key"}
          </button>
        </div>
      </div>

      {/* TABS */}
      <div style={{ display: "flex", borderBottom: `0.5px solid ${C.border}`, padding: "0 16px" }}>
        {(["opportunities", "holdings", "watching"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: "8px 14px", fontSize: 11, fontWeight: 500, border: "none", background: "none", cursor: "pointer",
            color: tab === t ? C.text : C.muted,
            borderBottom: tab === t ? `2px solid ${C.green}` : "2px solid transparent",
            textTransform: "capitalize", letterSpacing: 0.3,
          }}>
            {t === "opportunities" ? "Buy Opportunities" : t === "holdings" ? "My Holdings" : "Watchlist"}
            {t === "opportunities" && scanResult && (
              <span style={{ marginLeft: 6, fontSize: 9, background: C.greenDim, color: C.greenText, padding: "1px 5px", borderRadius: 8 }}>
                {scanResult.signals.length}
              </span>
            )}
          </button>
        ))}
      </div>

      <div style={{ padding: 16, maxWidth: 900, margin: "0 auto" }}>

        {/* ── BUY OPPORTUNITIES TAB ── */}
        {tab === "opportunities" && (
          <div>
            {/* Scanner controls */}
            <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
              <button onClick={runFullScan} disabled={scanning} style={{ ...accentBtn, padding: "6px 14px", fontSize: 11, fontWeight: 600 }}>
                {scanning ? `⟳ ${scanPhase || "Scanning…"}` : "↗ Full Scan · KMI-30 + News"}
              </button>
              <button onClick={runNewsRefresh} disabled={scanning} style={btnSt}>
                ↗ Refresh news only
              </button>
              {scanResult && (
                <span style={{ fontSize: 10, color: C.dim }}>
                  Last scan: {new Date(scanResult.timestamp).toLocaleTimeString("en-PK", { hour: "2-digit", minute: "2-digit" })} PKT
                  · {scanResult.totalScanned} stocks scanned
                  · {scanResult.passedTechnicals} passed technicals
                  {scanResult.expandedSectors.length > 0 && ` · expanded: ${scanResult.expandedSectors.join(", ")}`}
                </span>
              )}
            </div>

            {scanError && (
              <div style={{ ...cardStyle, background: C.redDim, border: `0.5px solid ${C.red}`, display: "flex", alignItems: "flex-start", gap: 10 }}>
                <span style={{ color: C.redText, fontSize: 11, flex: 1, lineHeight: 1.5 }}>✗ {scanError}</span>
                <button onClick={() => setScanError("")} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 16, lineHeight: 1, padding: "0 2px", flexShrink: 0 }}>×</button>
              </div>
            )}

            {/* News context panel */}
            {scanResult?.newsAnalysis && (
              <div style={{ ...cardStyle, marginBottom: 14 }}>
                <div style={{ ...s_label, marginBottom: 6 }}>Macro Context · Today</div>
                <p style={{ fontSize: 11, color: C.muted, lineHeight: 1.6, margin: "0 0 8px" }}>
                  {scanResult.newsAnalysis.summary}
                </p>
                {scanResult.newsAnalysis.globalFactors.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                    {scanResult.newsAnalysis.globalFactors.map((f, i) => (
                      <span key={i} style={{ fontSize: 9, color: C.blueText, background: C.blueDim, padding: "2px 7px", borderRadius: 10 }}>{f}</span>
                    ))}
                  </div>
                )}
                {scanResult.newsAnalysis.affectedSectors.length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    {scanResult.newsAnalysis.affectedSectors.map((sec, i) => (
                      <div key={i} style={{ fontSize: 10, color: sec.impact === "POSITIVE" ? C.greenText : sec.impact === "NEGATIVE" ? C.redText : C.muted, marginBottom: 2 }}>
                        {sec.impact === "POSITIVE" ? "▲" : sec.impact === "NEGATIVE" ? "▼" : "–"} {sec.sectorName}: {sec.reason}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Empty state */}
            {!scanResult && !scanning && (
              <div style={{ ...cardStyle, textAlign: "center", padding: "40px 20px" }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>📡</div>
                <div style={{ fontSize: 13, color: C.muted, marginBottom: 6 }}>
                  {hasKey ? "Ready to scan KMI-30 + Shariah stocks" : "Set your API key to get started"}
                </div>
                <div style={{ fontSize: 11, color: C.dim, lineHeight: 1.6 }}>
                  {hasKey
                    ? "The scanner will fetch live prices, compute RSI/EMA/volume for all KMI-30 stocks,\nexpand into news-relevant sectors, and return the best 1-8 setups."
                    : "Click ⚙ in the top-right to add your Claude, Gemini, or OpenAI API key."}
                </div>
                {hasKey && (
                  <button onClick={runFullScan} style={{ ...accentBtn, marginTop: 16, padding: "8px 20px", fontSize: 12 }}>
                    ↗ Run First Scan
                  </button>
                )}
              </div>
            )}

            {/* Loading skeleton */}
            {scanning && (
              <div style={{ ...cardStyle, textAlign: "center", padding: "30px 20px" }}>
                <div style={{ fontSize: 24, marginBottom: 10 }}>🔍</div>
                <div style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>{scanPhase}</div>
                <div style={{ fontSize: 10, color: C.dim }}>This takes 30-60 seconds — fetching prices, computing technicals, searching news…</div>
              </div>
            )}

            {/* Signal cards */}
            {scanResult?.signals.map((sig, i) => (
              <div key={sig.ticker} style={{ ...cardStyle }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 6 }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                      <span style={{ fontSize: 15, fontWeight: 600 }}>{sig.ticker}</span>
                      <Pill signal={sig.signal} />
                      <span style={{ fontSize: 10, color: C.dim }}>#{i + 1}</span>
                    </div>
                    <div style={{ fontSize: 11, color: C.muted }}>{sig.reason}</div>
                  </div>
                  {sig.suggestedEntry && (
                    <span style={{ fontSize: 10, color: C.amberText, background: C.amberDim, padding: "2px 8px", borderRadius: 6, whiteSpace: "nowrap", marginLeft: 8 }}>
                      Entry: {sig.suggestedEntry}
                    </span>
                  )}
                </div>

                {sig.newsHeadline && sig.newsHeadline !== "No recent news" && (
                  <div style={{ fontSize: 10, color: C.dim, marginBottom: 6, fontStyle: "italic" }}>
                    📰 {sig.newsHeadline}
                  </div>
                )}

                <ConfBar pct={sig.confidence} signal={sig.signal} />

                {(sig.catalysts?.length > 0 || sig.risks?.length > 0) && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 10 }}>
                    {sig.catalysts?.length > 0 && (
                      <div>
                        <div style={{ fontSize: 9, color: C.greenText, marginBottom: 3, textTransform: "uppercase", letterSpacing: 0.4 }}>Catalysts</div>
                        {sig.catalysts.map((c, j) => (
                          <div key={j} style={{ fontSize: 10, color: C.muted, marginBottom: 2 }}>▲ {c}</div>
                        ))}
                      </div>
                    )}
                    {sig.risks?.length > 0 && (
                      <div>
                        <div style={{ fontSize: 9, color: C.redText, marginBottom: 3, textTransform: "uppercase", letterSpacing: 0.4 }}>Risks</div>
                        {sig.risks.map((r, j) => (
                          <div key={j} style={{ fontSize: 10, color: C.muted, marginBottom: 2 }}>▼ {r}</div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Add to watchlist */}
                <div style={{ marginTop: 10, display: "flex", justifyContent: "flex-end" }}>
                  {watching.find(w => w.ticker === sig.ticker) ? (
                    <span style={{ fontSize: 9, color: C.greenText }}>✓ In Watchlist</span>
                  ) : (
                    <button onClick={() => quickAddWatch(sig.ticker)} style={{ ...btnSt, fontSize: 9, padding: "3px 10px", borderColor: C.blue + "50", color: C.blueText }}>
                      + Add to Watchlist
                    </button>
                  )}
                </div>
              </div>
            ))}

            {/* Disclaimer */}
            <div style={{ fontSize: 9, color: C.dim, textAlign: "center", padding: "12px 0", lineHeight: 1.6 }}>
              ⚠ Not financial advice. Signals are AI-generated for informational purposes only.<br />
              Always do your own research. Past signals do not guarantee future returns.
            </div>
          </div>
        )}

        {/* ── HOLDINGS TAB ── */}
        {tab === "holdings" && (
          <div>
            <div style={{ ...s_label, marginBottom: 10 }}>My Holdings</div>
            {holdings.map(h => {
              const p = prices[h.ticker];
              const livePrice = p?.currentPrice;
              const cost = h.avgPrice * h.shares;
              const marketVal = livePrice ? livePrice * h.shares : null;
              const pnl = marketVal ? marketVal - cost : null;
              const pnlPct = pnl ? (pnl / cost) * 100 : null;
              return (
                <div key={h.ticker} style={cardStyle}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 15, fontWeight: 600 }}>{h.ticker}</span>
                        {h.shariah && <span style={{ fontSize: 9, color: C.greenText, background: C.greenDim, padding: "1px 5px", borderRadius: 3 }}>Shariah ✓</span>}
                      </div>
                      <div style={{ fontSize: 10, color: C.muted }}>{h.name}</div>
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      {livePrice && <span style={{ fontSize: 13, fontWeight: 500 }}>PKR {livePrice.toFixed(2)}</span>}
                      {p?.changePercent !== undefined && (
                        <span style={{ fontSize: 10, color: p.changePercent >= 0 ? C.greenText : C.redText }}>
                          {p.changePercent >= 0 ? "+" : ""}{p.changePercent.toFixed(2)}%
                        </span>
                      )}
                      <button onClick={() => setHoldings(prev => prev.filter(x => x.ticker !== h.ticker))}
                        style={{ ...btnSt, padding: "0 5px", fontSize: 14, color: C.dim }}>×</button>
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
                    {[
                      ["Shares", h.shares.toLocaleString()],
                      ["Avg cost", `PKR ${h.avgPrice.toFixed(2)}`],
                      ["Cost basis", `PKR ${Math.round(cost).toLocaleString()}`],
                      ["Market value", marketVal ? `PKR ${Math.round(marketVal).toLocaleString()}` : "—"],
                      ["P&L", pnl !== null ? `${pnl >= 0 ? "+" : ""}PKR ${Math.round(pnl).toLocaleString()}` : "—"],
                      ["P&L %", pnlPct !== null ? `${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(2)}%` : "—"],
                    ].map(([label, val], i) => (
                      <div key={i} style={{ background: "#111", borderRadius: 5, padding: "5px 7px" }}>
                        <div style={{ fontSize: 9, color: C.dim, marginBottom: 2 }}>{label}</div>
                        <div style={{ fontSize: 12, fontWeight: 500, color: label.includes("P&L") && pnl !== null ? (pnl >= 0 ? C.greenText : C.redText) : C.text }}>{val}</div>
                      </div>
                    ))}
                  </div>
                  {/* AI suggestion */}
                  {(() => {
                    const s = getHoldingSuggestion(h.ticker, pnlPct);
                    if (!s) return (
                      <div style={{ marginTop: 8, fontSize: 9, color: C.dim, fontStyle: "italic" }}>
                        Run a full scan to get AI advice for this holding.
                      </div>
                    );
                    const col = s.signal === "BUY" || s.signal === "STRONG_BUY" ? C.greenText
                              : s.signal === "SELL" || s.signal === "AVOID" ? C.redText
                              : s.signal === "HOLD" ? C.amberText : C.blueText;
                    const bg  = s.signal === "BUY" || s.signal === "STRONG_BUY" ? C.greenDim
                              : s.signal === "SELL" || s.signal === "AVOID" ? C.redDim
                              : s.signal === "HOLD" ? C.amberDim : C.blueDim;
                    return (
                      <div style={{ marginTop: 8, background: bg, borderRadius: 6, padding: "6px 10px", display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 9, fontWeight: 700, color: col, textTransform: "uppercase", letterSpacing: 0.5, whiteSpace: "nowrap" }}>
                          {s.signal}
                        </span>
                        <span style={{ fontSize: 10, color: col, flex: 1 }}>{s.text}</span>
                        <span style={{ fontSize: 8, color: C.dim, whiteSpace: "nowrap" }}>{s.source}</span>
                      </div>
                    );
                  })()}
                </div>
              );
            })}
            {holdingError && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", background: C.redDim, border: `0.5px solid ${C.red}`, borderRadius: 6, marginTop: 6 }}>
                <span style={{ fontSize: 10, color: C.redText, flex: 1 }}>✗ {holdingError}</span>
                <button onClick={() => setHoldingError("")} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 14 }}>×</button>
              </div>
            )}
            <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
              <input style={{ ...inputSt, width: 60 }} placeholder="Ticker" value={newHolding.ticker} onChange={e => setNewHolding(p => ({ ...p, ticker: e.target.value.toUpperCase() }))} onKeyDown={e => e.key === "Enter" && addHolding()} />
              <input style={{ ...inputSt, width: 70 }} placeholder="Shares" type="text" inputMode="numeric" value={newHolding.shares} onChange={e => setNewHolding(p => ({ ...p, shares: e.target.value.replace(/[^0-9.]/g, "") }))} />
              <input style={{ ...inputSt, width: 70 }} placeholder="Avg PKR" type="text" inputMode="numeric" value={newHolding.avg} onChange={e => setNewHolding(p => ({ ...p, avg: e.target.value.replace(/[^0-9.]/g, "") }))} />
              <button onClick={addHolding} disabled={addingHolding} style={{ ...btnSt, opacity: addingHolding ? 0.5 : 1 }}>
                {addingHolding ? "…" : "Add"}
              </button>
            </div>
          </div>
        )}

        {/* ── WATCHLIST TAB ── */}
        {tab === "watching" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <span style={s_label}>Watchlist · KMI-30 / Shariah tickers</span>
              {watching.length > 0 && (
                <button onClick={fetchWatchTech} disabled={loadingWatchTech} style={{ ...btnSt, fontSize: 9, padding: "3px 10px" }}>
                  {loadingWatchTech ? "Loading…" : "↻ Load Signals"}
                </button>
              )}
            </div>
            {watching.length === 0 && (
              <div style={{ color: C.dim, fontSize: 11, padding: "20px 0" }}>Add tickers below to track them.</div>
            )}
            {watching.map(w => {
              const p = prices[w.ticker];
              const sig = watchSignals[w.ticker];
              const tech = watchTech[w.ticker];
              const scanSig = scanResult?.signals.find(s => s.ticker === w.ticker);
              return (
                <div key={w.ticker} style={{ ...cardStyle }}>
                  {/* Header row */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 14, fontWeight: 600 }}>{w.ticker}</span>
                      {p && <span style={{ fontSize: 13, fontWeight: 500 }}>PKR {p.currentPrice.toFixed(2)}</span>}
                      {p?.changePercent !== undefined && (
                        <span style={{ fontSize: 10, color: p.changePercent >= 0 ? C.greenText : C.redText }}>
                          {p.changePercent >= 0 ? "+" : ""}{p.changePercent.toFixed(2)}%
                        </span>
                      )}
                      {/* Signal: from scan result if available, else from watchSignals */}
                      {(scanSig || sig) && <Pill signal={(scanSig ?? sig)!.signal} small />}
                    </div>
                    <button onClick={() => setWatching(prev => prev.filter(x => x.ticker !== w.ticker))}
                      style={{ ...btnSt, padding: "0 5px", fontSize: 14, color: C.dim }}>×</button>
                  </div>

                  {/* Technical indicators row */}
                  {tech && (
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
                      {[
                        ["RSI", tech.rsi.toFixed(0), tech.rsi < 30 ? C.greenText : tech.rsi > 70 ? C.redText : C.muted],
                        ["EMA20", tech.ema20.toFixed(2), C.muted],
                        ["EMA50", tech.ema50.toFixed(2), C.muted],
                        ["Vol", `${tech.volumeRatio.toFixed(1)}x avg`, tech.volumeRatio >= 1.5 ? C.greenText : C.muted],
                        ["Score", `${tech.compositeScore}/100`, tech.compositeScore >= 60 ? C.greenText : tech.compositeScore >= 40 ? C.amberText : C.redText],
                      ].map(([label, val, col]) => (
                        <div key={label as string} style={{ background: "#111", borderRadius: 4, padding: "3px 7px", display: "flex", gap: 4, alignItems: "center" }}>
                          <span style={{ fontSize: 8, color: C.dim }}>{label}</span>
                          <span style={{ fontSize: 10, fontWeight: 500, color: col as string }}>{val}</span>
                        </div>
                      ))}
                      <div style={{ background: "#111", borderRadius: 4, padding: "3px 7px" }}>
                        <span style={{ fontSize: 9, color: tech.technicalSignal === "STRONG_BUY" || tech.technicalSignal === "BUY" ? C.greenText
                          : tech.technicalSignal === "AVOID" ? C.redText : C.amberText }}>
                          {tech.technicalSignal.replace("_", " ")}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Top reason from technicals */}
                  {tech?.reasons?.[0] && (
                    <div style={{ fontSize: 9, color: C.muted, marginBottom: 4 }}>▲ {tech.reasons[0]}</div>
                  )}

                  {/* AI signal from last scan if it covered this ticker */}
                  {scanSig && (
                    <>
                      <div style={{ fontSize: 10, color: C.muted, marginBottom: 2 }}>{scanSig.reason}</div>
                      {scanSig.newsHeadline && scanSig.newsHeadline !== "No recent news" && (
                        <div style={{ fontSize: 9, color: C.dim, fontStyle: "italic" }}>📰 {scanSig.newsHeadline}</div>
                      )}
                      <ConfBar pct={scanSig.confidence} signal={scanSig.signal} />
                    </>
                  )}

                  {/* Prompt to load signals if nothing loaded yet */}
                  {!tech && !scanSig && (
                    <div style={{ fontSize: 9, color: C.dim, fontStyle: "italic" }}>
                      Click "↻ Load Signals" above to fetch EMA/RSI/volume data.
                    </div>
                  )}
                </div>
              );
            })}
            {watchError && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", background: C.redDim, border: `0.5px solid ${C.red}`, borderRadius: 6, marginBottom: 6 }}>
                <span style={{ fontSize: 10, color: C.redText, flex: 1 }}>✗ {watchError}</span>
                <button onClick={() => setWatchError("")} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 14 }}>×</button>
              </div>
            )}
            <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
              <input style={inputSt} placeholder="e.g. PPL" value={newWatch} onChange={e => setNewWatch(e.target.value.toUpperCase())} onKeyDown={e => e.key === "Enter" && addWatch()} />
              <button onClick={addWatch} disabled={addingWatch} style={{ ...btnSt, opacity: addingWatch ? 0.5 : 1 }}>
                {addingWatch ? "…" : "Add"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ borderTop: `0.5px solid ${C.border}`, padding: "6px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 9, color: C.dim }}>
        <span>{lastUpdated ? `Prices updated ${lastUpdated}` : "Connecting to PSX…"}</span>
        <span>PSX Scanner · Not financial advice</span>
      </div>

      <Settings open={showSettings} onClose={() => setShowSettings(false)} onSave={s => { setSettings(s); setShowSettings(false); }} />
    </div>
  );
}
