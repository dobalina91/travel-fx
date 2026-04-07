import { useState, useEffect, useCallback, useRef } from "react";

const CURRENCIES = [
  { code: "HKD", symbol: "HK$", name: "Hong Kong Dollar", flag: "🇭🇰" },
  { code: "THB", symbol: "฿", name: "Thai Baht", flag: "🇹🇭" },
  { code: "USD", symbol: "$", name: "US Dollar", flag: "🇺🇸" },
  { code: "EUR", symbol: "€", name: "Euro", flag: "🇪🇺" },
  { code: "GBP", symbol: "£", name: "British Pound", flag: "🇬🇧" },
  { code: "JPY", symbol: "¥", name: "Japanese Yen", flag: "🇯🇵" },
  { code: "CNY", symbol: "¥", name: "Chinese Yuan", flag: "🇨🇳" },
  { code: "SGD", symbol: "S$", name: "Singapore Dollar", flag: "🇸🇬" },
  { code: "KRW", symbol: "₩", name: "South Korean Won", flag: "🇰🇷" },
  { code: "TWD", symbol: "NT$", name: "Taiwan Dollar", flag: "🇹🇼" },
  { code: "MYR", symbol: "RM", name: "Malaysian Ringgit", flag: "🇲🇾" },
  { code: "IDR", symbol: "Rp", name: "Indonesian Rupiah", flag: "🇮🇩" },
  { code: "VND", symbol: "₫", name: "Vietnamese Dong", flag: "🇻🇳" },
  { code: "PHP", symbol: "₱", name: "Philippine Peso", flag: "🇵🇭" },
  { code: "AUD", symbol: "A$", name: "Australian Dollar", flag: "🇦🇺" },
  { code: "CHF", symbol: "CHF", name: "Swiss Franc", flag: "🇨🇭" },
];

const STORAGE_KEY = "travelcalc";

const defaultState = () => ({
  homeCurrency: "HKD",
  travelCurrency: "THB",
  marketRate: "",
  exchanges: [],
  payments: [],
  cards: [
    { id: "hsbc", name: "HSBC Credit", rate: "", markup: "1.95" },
    { id: "citi", name: "Citi Debit", rate: "", markup: "0" },
  ],
});

function fmt(num, decimals = 2) {
  if (num === null || num === undefined || isNaN(num)) return "—";
  return Number(num).toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function pct(num) {
  if (num === null || num === undefined || isNaN(num)) return "—";
  return (num * 100).toFixed(2) + "%";
}

function getCurrencyObj(code) {
  return CURRENCIES.find((c) => c.code === code) || { code, symbol: code, name: code, flag: "💱" };
}

function DiffBadge({ value, homeSym }) {
  if (value === null || value === undefined || isNaN(value)) return null;
  const isGood = value <= 0;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 3,
        padding: "2px 8px",
        borderRadius: 20,
        fontSize: 12,
        fontWeight: 600,
        background: isGood ? "rgba(16,185,129,0.12)" : "rgba(239,68,68,0.12)",
        color: isGood ? "#059669" : "#dc2626",
      }}
    >
      {isGood ? "▼" : "▲"} {homeSym}
      {fmt(Math.abs(value))}
    </span>
  );
}

function RateBadge({ diffPct }) {
  if (diffPct === null || diffPct === undefined || isNaN(diffPct)) return null;
  const abs = Math.abs(diffPct * 100);
  let color, bg, label;
  if (abs < 0.5) {
    color = "#059669"; bg = "rgba(16,185,129,0.12)"; label = "Great rate";
  } else if (abs < 1.5) {
    color = "#d97706"; bg = "rgba(245,158,11,0.12)"; label = "OK rate";
  } else {
    color = "#dc2626"; bg = "rgba(239,68,68,0.12)"; label = "Poor rate";
  }
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 3,
        padding: "2px 8px",
        borderRadius: 20,
        fontSize: 11,
        fontWeight: 600,
        background: bg,
        color,
      }}
    >
      {label} ({abs.toFixed(2)}% off)
    </span>
  );
}

// ─── Storage ────────────────────────────────────────────────────────────────

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* ignore */ }
  return null;
}

function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) { /* ignore */ }
}

// ─── Live Rate Fetching ─────────────────────────────────────────────────────

async function fetchLiveRate(from, to) {
  // Try multiple free APIs as fallbacks
  const apis = [
    {
      name: "Frankfurter",
      url: `https://api.frankfurter.dev/v2/rates?base=${from}&quotes=${to}`,
      parse: (data) => data?.rates?.[to],
    },
    {
      name: "ExchangeRate-API",
      url: `https://open.er-api.com/v6/latest/${from}`,
      parse: (data) => data?.rates?.[to],
    },
    {
      name: "Currency-API",
      url: `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/${from.toLowerCase()}.min.json`,
      parse: (data) => data?.[from.toLowerCase()]?.[to.toLowerCase()],
    },
  ];

  for (const api of apis) {
    try {
      const res = await fetch(api.url, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) continue;
      const data = await res.json();
      const rate = api.parse(data);
      if (rate && !isNaN(rate) && rate > 0) {
        return { rate, source: api.name, time: new Date().toLocaleString() };
      }
    } catch (e) { continue; }
  }
  return null;
}

// ─── Export / Import ────────────────────────────────────────────────────────

function exportToJSON(state) {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `travel-fx-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function exportToCSV(state, home, travel) {
  const rows = [["Type", "Date", "Description", "Method", `Amount (${home.code})`, `Amount (${travel.code})`, "Rate", "Market Rate", `Cost (${home.code})`, "Surcharge %"]];

  (state.exchanges || []).forEach((ex) => {
    rows.push(["Exchange", ex.date, ex.shop, "Cash", ex.homeAmount, ex.travelAmount, ex.rate, ex.marketRateAtTime || "", "", ""]);
  });

  (state.payments || []).forEach((p) => {
    rows.push(["Spend", p.date, p.description, p.method === "cash" ? "Cash" : (p.cardName || "Card"), "", p.amount, "", "", p.costHome, p.surcharge || 0]);
  });

  const csv = rows.map((r) => r.map((v) => `"${v}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `travel-fx-export-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function importFromJSON(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (data && data.homeCurrency && Array.isArray(data.exchanges) && Array.isArray(data.payments)) {
          resolve(data);
        } else {
          reject(new Error("Invalid backup file format"));
        }
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsText(file);
  });
}

// ─── Components ─────────────────────────────────────────────────────────────

function CurrencySelect({ value, onChange, label }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {label && <label style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase" }}>{label}</label>}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          background: "#1e293b",
          border: "1px solid #334155",
          borderRadius: 10,
          color: "#f1f5f9",
          padding: "10px 14px",
          fontSize: 15,
          fontFamily: "inherit",
          cursor: "pointer",
          appearance: "none",
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
          backgroundRepeat: "no-repeat",
          backgroundPosition: "right 12px center",
        }}
      >
        {CURRENCIES.map((c) => (
          <option key={c.code} value={c.code}>
            {c.flag} {c.code} — {c.name}
          </option>
        ))}
      </select>
    </div>
  );
}

function NumInput({ value, onChange, placeholder, prefix, suffix, style: extraStyle, ...props }) {
  return (
    <div style={{ position: "relative", display: "flex", alignItems: "center", ...extraStyle }}>
      {prefix && (
        <span style={{ position: "absolute", left: 12, color: "#64748b", fontSize: 13, fontWeight: 600, pointerEvents: "none" }}>
          {prefix}
        </span>
      )}
      <input
        type="number"
        inputMode="decimal"
        step="any"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: "100%",
          background: "#1e293b",
          border: "1px solid #334155",
          borderRadius: 10,
          color: "#f1f5f9",
          padding: `10px ${suffix ? 40 : 14}px 10px ${prefix ? 42 : 14}px`,
          fontSize: 15,
          fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
          outline: "none",
        }}
        {...props}
      />
      {suffix && (
        <span style={{ position: "absolute", right: 12, color: "#64748b", fontSize: 13, fontWeight: 600, pointerEvents: "none" }}>
          {suffix}
        </span>
      )}
    </div>
  );
}

function Card({ children, title, action, style: extraStyle }) {
  return (
    <div
      style={{
        background: "#0f172a",
        border: "1px solid #1e293b",
        borderRadius: 16,
        padding: "18px 16px",
        ...extraStyle,
      }}
    >
      {(title || action) && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          {title && <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#e2e8f0", letterSpacing: 0.3 }}>{title}</h3>}
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

function SmallBtn({ onClick, children, danger, style: s }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: danger ? "rgba(239,68,68,0.15)" : "rgba(59,130,246,0.15)",
        border: "none",
        borderRadius: 8,
        color: danger ? "#f87171" : "#60a5fa",
        padding: "6px 12px",
        fontSize: 12,
        fontWeight: 600,
        cursor: "pointer",
        fontFamily: "inherit",
        ...s,
      }}
    >
      {children}
    </button>
  );
}

// ─── Main App ───────────────────────────────────────────────────────────────

export default function TravelCurrencyCalc() {
  const [state, setState] = useState(null);
  const [tab, setTab] = useState("exchange");
  const [loading, setLoading] = useState(true);
  const [liveRate, setLiveRate] = useState(null);
  const [rateLoading, setRateLoading] = useState(false);
  const [rateError, setRateError] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    setState(loadState() || defaultState());
    setLoading(false);
  }, []);

  useEffect(() => {
    if (state && !loading) saveState(state);
  }, [state, loading]);

  // Fetch live rate on load and when currencies change
  const doFetchRate = useCallback(async (from, to) => {
    if (!from || !to || from === to) return;
    setRateLoading(true);
    setRateError(null);
    const result = await fetchLiveRate(from, to);
    if (result) {
      setLiveRate(result);
    } else {
      setRateError("Couldn't fetch rate");
    }
    setRateLoading(false);
  }, []);

  useEffect(() => {
    if (state && !loading) {
      doFetchRate(state.homeCurrency, state.travelCurrency);
    }
  }, [state?.homeCurrency, state?.travelCurrency, loading]);

  const update = useCallback((patch) => {
    setState((prev) => ({ ...prev, ...patch }));
  }, []);

  const handleImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const data = await importFromJSON(file);
      if (confirm(`Import backup? This will replace all current data (${data.exchanges?.length || 0} exchanges, ${data.payments?.length || 0} payments).`)) {
        setState(data);
      }
    } catch (err) {
      alert("Failed to import: " + err.message);
    }
    e.target.value = "";
  };

  if (loading || !state) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", background: "#020617", color: "#94a3b8" }}>
        Loading...
      </div>
    );
  }

  const home = getCurrencyObj(state.homeCurrency);
  const travel = getCurrencyObj(state.travelCurrency);
  const marketRate = parseFloat(state.marketRate) || 0;

  // Wallet totals — separate cash vs card
  const walletHome = state.exchanges.reduce((s, e) => s + (parseFloat(e.homeAmount) || 0), 0);
  const walletTravel = state.exchanges.reduce((s, e) => s + (parseFloat(e.travelAmount) || 0), 0);
  const cashPayments = state.payments.filter((p) => p.method === "cash");
  const cardPayments = state.payments.filter((p) => p.method !== "cash");
  const spentCash = cashPayments.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
  const spentCard = cardPayments.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
  const spentTotal = spentCash + spentCard;
  const walletRemaining = walletTravel - spentCash;
  const blendedRate = walletHome > 0 ? walletTravel / walletHome : 0;

  const tabs = [
    { id: "exchange", label: "💱 Exchange" },
    { id: "spend", label: "💸 Spend" },
    { id: "wallet", label: "👛 Wallet" },
    { id: "data", label: "⚙️ Data" },
  ];

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#020617",
        color: "#e2e8f0",
        fontFamily: "'Inter', 'SF Pro Display', -apple-system, sans-serif",
        maxWidth: 480,
        margin: "0 auto",
        paddingBottom: 90,
      }}
    >
      {/* Header */}
      <div
        style={{
          background: "linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)",
          padding: "20px 16px 16px",
          borderBottom: "1px solid #1e293b",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <span style={{ fontSize: 26 }}>✈️</span>
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, letterSpacing: -0.5, background: "linear-gradient(135deg, #e2e8f0, #818cf8)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              Travel FX
            </h1>
            <p style={{ margin: 0, fontSize: 11, color: "#64748b", fontWeight: 500 }}>Know what you're really paying</p>
          </div>
        </div>

        {/* Currency pair + market rate */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 8, alignItems: "end", marginBottom: 12 }}>
          <CurrencySelect label="Home" value={state.homeCurrency} onChange={(v) => update({ homeCurrency: v })} />
          <span style={{ fontSize: 20, padding: "0 0 10px", color: "#475569" }}>→</span>
          <CurrencySelect label="Travel" value={state.travelCurrency} onChange={(v) => update({ travelCurrency: v })} />
        </div>
        <NumInput
          value={state.marketRate}
          onChange={(v) => update({ marketRate: v, marketRateUpdated: new Date().toLocaleString(), marketRateSource: "Manual" })}
          placeholder="e.g. 4.1463"
          prefix="1 ="
          suffix={travel.code}
          style={{ marginTop: 4 }}
        />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "6px 0 0" }}>
          <p style={{ margin: 0, fontSize: 11, color: "#475569" }}>
            {state.marketRateUpdated
              ? `${state.marketRateSource || "Manual"} · ${state.marketRateUpdated}`
              : "Not set yet"}
          </p>
          <a
            href={`https://www.xe.com/currencyconverter/convert/?From=${home.code}&To=${travel.code}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: 11, color: "#818cf8", textDecoration: "none", fontWeight: 600 }}
          >
            XE.com ↗
          </a>
        </div>

        {/* Live rate bar */}
        <div style={{
          marginTop: 8,
          padding: "8px 12px",
          background: "#1e293b",
          borderRadius: 10,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}>
          <div>
            <span style={{ fontSize: 11, color: "#64748b", fontWeight: 600 }}>Live rate: </span>
            {rateLoading && <span style={{ fontSize: 12, color: "#94a3b8" }}>Fetching...</span>}
            {rateError && <span style={{ fontSize: 12, color: "#f87171" }}>{rateError}</span>}
            {liveRate && !rateLoading && (
              <span style={{ fontSize: 13, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", color: "#e2e8f0" }}>
                {fmt(liveRate.rate, 4)}
              </span>
            )}
            {liveRate && !rateLoading && (
              <span style={{ fontSize: 10, color: "#475569", marginLeft: 6 }}>
                via {liveRate.source}
              </span>
            )}
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            {liveRate && !rateLoading && (
              <button
                onClick={() => update({
                  marketRate: String(liveRate.rate),
                  marketRateUpdated: new Date().toLocaleString(),
                  marketRateSource: liveRate.source,
                })}
                style={{
                  background: "rgba(129,140,248,0.15)",
                  border: "none",
                  borderRadius: 6,
                  color: "#818cf8",
                  padding: "4px 10px",
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                Use it
              </button>
            )}
            <button
              onClick={() => doFetchRate(state.homeCurrency, state.travelCurrency)}
              disabled={rateLoading}
              style={{
                background: "rgba(148,163,184,0.1)",
                border: "none",
                borderRadius: 6,
                color: "#94a3b8",
                padding: "4px 8px",
                fontSize: 13,
                cursor: rateLoading ? "default" : "pointer",
                fontFamily: "inherit",
              }}
            >
              ↻
            </button>
          </div>
        </div>
      </div>

      {/* Tab Bar */}
      <div
        style={{
          display: "flex",
          gap: 0,
          background: "#0f172a",
          borderBottom: "1px solid #1e293b",
          position: "sticky",
          top: 0,
          zIndex: 10,
        }}
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              flex: 1,
              padding: "12px 0",
              fontSize: 13,
              fontWeight: 700,
              fontFamily: "inherit",
              border: "none",
              borderBottom: tab === t.id ? "2px solid #818cf8" : "2px solid transparent",
              background: "transparent",
              color: tab === t.id ? "#e2e8f0" : "#475569",
              cursor: "pointer",
              transition: "all 0.15s",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ padding: "14px 12px" }}>
        {tab === "exchange" && (
          <ExchangeTab
            state={state}
            update={update}
            home={home}
            travel={travel}
            marketRate={marketRate}
          />
        )}
        {tab === "spend" && (
          <SpendTab
            state={state}
            update={update}
            home={home}
            travel={travel}
            marketRate={marketRate}
            blendedRate={blendedRate}
          />
        )}
        {tab === "wallet" && (
          <WalletTab
            state={state}
            update={update}
            home={home}
            travel={travel}
            marketRate={marketRate}
            walletHome={walletHome}
            walletTravel={walletTravel}
            walletRemaining={walletRemaining}
            spentCash={spentCash}
            spentCard={spentCard}
            spentTotal={spentTotal}
            blendedRate={blendedRate}
          />
        )}
        {tab === "data" && (
          <DataTab
            state={state}
            setState={setState}
            home={home}
            travel={travel}
            fileInputRef={fileInputRef}
          />
        )}
      </div>

      {/* Hidden file input for import */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        onChange={handleImport}
        style={{ display: "none" }}
      />
    </div>
  );
}

// ─── Exchange Tab ───────────────────────────────────────────────────────────

function ExchangeTab({ state, update, home, travel, marketRate }) {
  const [homeAmt, setHomeAmt] = useState("");
  const [travelAmt, setTravelAmt] = useState("");
  const [shop, setShop] = useState("");

  const shopRate = homeAmt && travelAmt ? parseFloat(travelAmt) / parseFloat(homeAmt) : 0;
  const diffPct = marketRate && shopRate ? (marketRate - shopRate) / marketRate : 0;
  const diffAmt = homeAmt && marketRate && shopRate ? parseFloat(homeAmt) * (marketRate - shopRate) / marketRate : 0;

  const addExchange = () => {
    if (!homeAmt || !travelAmt) return;
    const ex = {
      id: Date.now(),
      shop: shop || "Unknown",
      homeAmount: homeAmt,
      travelAmount: travelAmt,
      rate: shopRate,
      marketRateAtTime: marketRate || null,
      date: new Date().toLocaleString(),
    };
    update({ exchanges: [...state.exchanges, ex] });
    setHomeAmt(""); setTravelAmt(""); setShop("");
  };

  const removeExchange = (id) => {
    update({ exchanges: state.exchanges.filter((e) => e.id !== id) });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Card title={`Record a ${home.code} → ${travel.code} Exchange`}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <input
            value={shop}
            onChange={(e) => setShop(e.target.value)}
            placeholder="Shop / location name"
            style={{
              width: "100%",
              boxSizing: "border-box",
              background: "#1e293b",
              border: "1px solid #334155",
              borderRadius: 10,
              color: "#f1f5f9",
              padding: "10px 14px",
              fontSize: 14,
              fontFamily: "inherit",
              outline: "none",
            }}
          />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <NumInput value={homeAmt} onChange={setHomeAmt} placeholder="0" suffix={home.code} />
            <NumInput value={travelAmt} onChange={setTravelAmt} placeholder="0" suffix={travel.code} />
          </div>

          {shopRate > 0 && (
            <div
              style={{
                background: "#1e293b",
                borderRadius: 12,
                padding: "12px 14px",
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 12, color: "#94a3b8" }}>Shop rate</span>
                <span style={{ fontSize: 15, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>
                  1 {home.code} = {fmt(shopRate, 4)} {travel.code}
                </span>
              </div>
              {marketRate > 0 && (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 12, color: "#94a3b8" }}>vs. market</span>
                    <RateBadge diffPct={diffPct} />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 12, color: "#94a3b8" }}>You lose</span>
                    <DiffBadge value={diffAmt} homeSym={home.symbol} />
                  </div>
                </>
              )}
            </div>
          )}

          <button
            onClick={addExchange}
            disabled={!homeAmt || !travelAmt}
            style={{
              width: "100%",
              padding: "12px",
              borderRadius: 12,
              border: "none",
              background: homeAmt && travelAmt ? "linear-gradient(135deg, #6366f1, #818cf8)" : "#1e293b",
              color: homeAmt && travelAmt ? "#fff" : "#475569",
              fontSize: 14,
              fontWeight: 700,
              cursor: homeAmt && travelAmt ? "pointer" : "default",
              fontFamily: "inherit",
              transition: "all 0.15s",
            }}
          >
            + Add to Wallet
          </button>
        </div>
      </Card>

      {/* Exchange history */}
      {state.exchanges.length > 0 && (
        <Card title="Exchange History">
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {state.exchanges.map((ex) => {
              const snapshotMarket = ex.marketRateAtTime || null;
              const exDiffPct = snapshotMarket ? (snapshotMarket - ex.rate) / snapshotMarket : null;
              const exDiffAmt = snapshotMarket ? (parseFloat(ex.homeAmount) || 0) * (snapshotMarket - ex.rate) / snapshotMarket : null;
              return (
                <div
                  key={ex.id}
                  style={{
                    background: "#1e293b",
                    borderRadius: 10,
                    padding: "10px 12px",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>
                        {home.symbol}{fmt(ex.homeAmount)} → {travel.symbol}{fmt(ex.travelAmount)}
                      </div>
                      <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
                        {ex.shop} · {ex.date}
                      </div>
                    </div>
                    <button
                      onClick={() => removeExchange(ex.id)}
                      style={{ background: "none", border: "none", color: "#475569", fontSize: 16, cursor: "pointer", padding: 4 }}
                    >
                      ✕
                    </button>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 3, marginTop: 6, paddingTop: 6, borderTop: "1px solid #334155" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                      <span style={{ color: "#94a3b8" }}>Shop rate</span>
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, color: "#e2e8f0" }}>
                        {fmt(ex.rate, 4)}
                      </span>
                    </div>
                    {snapshotMarket && (
                      <>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                          <span style={{ color: "#94a3b8" }}>Market at time</span>
                          <span style={{ fontFamily: "'JetBrains Mono', monospace", color: "#94a3b8" }}>
                            {fmt(snapshotMarket, 4)}
                          </span>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12 }}>
                          <span style={{ color: "#94a3b8" }}>Difference</span>
                          <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                            <RateBadge diffPct={exDiffPct} />
                            <DiffBadge value={exDiffAmt} homeSym={home.symbol} />
                          </span>
                        </div>
                      </>
                    )}
                    {!snapshotMarket && (
                      <div style={{ fontSize: 11, color: "#475569", fontStyle: "italic" }}>
                        No market rate recorded
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}

// ─── Spend Tab ──────────────────────────────────────────────────────────────

function SpendTab({ state, update, home, travel, marketRate, blendedRate }) {
  const [amount, setAmount] = useState("");
  const [desc, setDesc] = useState("");
  const [method, setMethod] = useState("cash");
  const [surcharge, setSurcharge] = useState("0");
  const [cardIdx, setCardIdx] = useState(0);

  const amt = parseFloat(amount) || 0;
  const sur = parseFloat(surcharge) || 0;
  const amtWithSurcharge = amt * (1 + sur / 100);

  // Cost calculations
  const cashCostHome = blendedRate > 0 ? amt / blendedRate : 0;
  const cashCostMarket = marketRate > 0 ? amt / marketRate : 0;

  const selectedCard = state.cards[cardIdx];
  const cardRate = selectedCard ? parseFloat(selectedCard.rate) || 0 : 0;
  const cardCostHome = cardRate > 0 ? amtWithSurcharge / cardRate : 0;
  const cardCostMarket = marketRate > 0 ? amtWithSurcharge / marketRate : 0;

  const addPayment = () => {
    if (!amt) return;
    const p = {
      id: Date.now(),
      amount: amount,
      description: desc || "Payment",
      method,
      surcharge: sur,
      costHome: method === "cash" ? cashCostHome : cardCostHome,
      date: new Date().toLocaleString(),
      cardName: method !== "cash" ? selectedCard?.name : null,
    };
    update({ payments: [...state.payments, p] });
    setAmount(""); setDesc(""); setSurcharge("0");
  };

  const removePayment = (id) => {
    update({ payments: state.payments.filter((p) => p.id !== id) });
  };

  const updateCard = (idx, patch) => {
    const newCards = [...state.cards];
    newCards[idx] = { ...newCards[idx], ...patch };
    update({ cards: newCards });
  };

  const addCard = () => {
    update({
      cards: [...state.cards, { id: Date.now(), name: "New Card", rate: "", markup: "0" }],
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Card rates config */}
      <Card
        title="Card Rates"
        action={<SmallBtn onClick={addCard}>+ Card</SmallBtn>}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {state.cards.map((card, i) => (
            <div key={card.id} style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 6, alignItems: "center" }}>
              <input
                value={card.name}
                onChange={(e) => updateCard(i, { name: e.target.value })}
                style={{
                  background: "#1e293b",
                  border: "1px solid #334155",
                  borderRadius: 8,
                  color: "#f1f5f9",
                  padding: "8px 10px",
                  fontSize: 13,
                  fontFamily: "inherit",
                  outline: "none",
                }}
              />
              <NumInput
                value={card.rate}
                onChange={(v) => updateCard(i, { rate: v })}
                placeholder="Rate"
                suffix={"/" + home.code}
                style={{ fontSize: 13 }}
              />
              {state.cards.length > 1 && (
                <button
                  onClick={() => update({ cards: state.cards.filter((_, j) => j !== i) })}
                  style={{ background: "none", border: "none", color: "#475569", cursor: "pointer", padding: 4, fontSize: 14 }}
                >
                  ✕
                </button>
              )}
            </div>
          ))}
          <p style={{ margin: 0, fontSize: 11, color: "#475569" }}>
            Enter the rate your card gives per 1 {home.code} (e.g. 4.064 {travel.code}/{home.code})
          </p>
        </div>
      </Card>

      {/* Record spend */}
      <Card title="Record a Spend">
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <input
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="What did you buy?"
            style={{
              width: "100%",
              boxSizing: "border-box",
              background: "#1e293b",
              border: "1px solid #334155",
              borderRadius: 10,
              color: "#f1f5f9",
              padding: "10px 14px",
              fontSize: 14,
              fontFamily: "inherit",
              outline: "none",
            }}
          />

          <NumInput value={amount} onChange={setAmount} placeholder="0" suffix={travel.code} />

          {/* Payment method toggle */}
          <div style={{ display: "flex", gap: 6 }}>
            <button
              onClick={() => setMethod("cash")}
              style={{
                flex: 1,
                padding: "10px",
                borderRadius: 10,
                border: method === "cash" ? "2px solid #818cf8" : "1px solid #334155",
                background: method === "cash" ? "rgba(129,140,248,0.1)" : "#1e293b",
                color: method === "cash" ? "#c7d2fe" : "#64748b",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              💵 Cash
            </button>
            {state.cards.map((card, i) => (
              <button
                key={card.id}
                onClick={() => { setMethod("card"); setCardIdx(i); }}
                style={{
                  flex: 1,
                  padding: "10px",
                  borderRadius: 10,
                  border: method === "card" && cardIdx === i ? "2px solid #818cf8" : "1px solid #334155",
                  background: method === "card" && cardIdx === i ? "rgba(129,140,248,0.1)" : "#1e293b",
                  color: method === "card" && cardIdx === i ? "#c7d2fe" : "#64748b",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                💳 {card.name}
              </button>
            ))}
          </div>

          {/* Surcharge */}
          {method === "card" && (
            <NumInput
              value={surcharge}
              onChange={setSurcharge}
              placeholder="0"
              prefix="Surcharge"
              suffix="%"
            />
          )}

          {/* Cost preview */}
          {amt > 0 && (
            <div
              style={{
                background: "#1e293b",
                borderRadius: 12,
                padding: "12px 14px",
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              <div style={{ fontSize: 12, color: "#94a3b8", fontWeight: 600 }}>
                Real cost to you:
              </div>

              {method === "cash" && blendedRate > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 13, color: "#cbd5e1" }}>Cash (your blended rate)</span>
                    <span style={{ fontSize: 15, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>
                      {home.symbol}{fmt(cashCostHome)}
                    </span>
                  </div>
                  {marketRate > 0 && (
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ fontSize: 11, color: "#64748b" }}>vs. market rate</span>
                      <DiffBadge value={cashCostHome - cashCostMarket} homeSym={home.symbol} />
                    </div>
                  )}
                </div>
              )}
              {method === "cash" && blendedRate === 0 && (
                <p style={{ margin: 0, fontSize: 12, color: "#f87171" }}>
                  Add exchanges first to calculate cash cost
                </p>
              )}

              {method === "card" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {cardRate > 0 ? (
                    <>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ fontSize: 13, color: "#cbd5e1" }}>{selectedCard.name}</span>
                        <span style={{ fontSize: 15, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>
                          {home.symbol}{fmt(cardCostHome)}
                        </span>
                      </div>
                      {sur > 0 && (
                        <div style={{ fontSize: 11, color: "#f59e0b" }}>
                          Includes {sur}% shop surcharge ({travel.symbol}{fmt(amtWithSurcharge - amt)} extra)
                        </div>
                      )}
                      {blendedRate > 0 && (
                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                          <span style={{ fontSize: 11, color: "#64748b" }}>vs. paying cash</span>
                          <DiffBadge value={cardCostHome - cashCostHome} homeSym={home.symbol} />
                        </div>
                      )}
                      {marketRate > 0 && (
                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                          <span style={{ fontSize: 11, color: "#64748b" }}>vs. market rate</span>
                          <DiffBadge value={cardCostHome - cardCostMarket} homeSym={home.symbol} />
                        </div>
                      )}
                    </>
                  ) : (
                    <p style={{ margin: 0, fontSize: 12, color: "#f87171" }}>
                      Set this card's rate above first
                    </p>
                  )}
                </div>
              )}

              {/* Side-by-side comparison if card selected and both available */}
              {method === "card" && cardRate > 0 && blendedRate > 0 && (
                <div style={{
                  marginTop: 4,
                  padding: "8px 10px",
                  borderRadius: 8,
                  background: cardCostHome < cashCostHome ? "rgba(16,185,129,0.08)" : "rgba(245,158,11,0.08)",
                  border: `1px solid ${cardCostHome < cashCostHome ? "rgba(16,185,129,0.2)" : "rgba(245,158,11,0.2)"}`,
                }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: cardCostHome < cashCostHome ? "#10b981" : "#f59e0b" }}>
                    💡 {cardCostHome < cashCostHome
                      ? `Card saves you ${home.symbol}${fmt(Math.abs(cashCostHome - cardCostHome))}`
                      : `Cash saves you ${home.symbol}${fmt(Math.abs(cardCostHome - cashCostHome))}`
                    }
                  </span>
                </div>
              )}
            </div>
          )}

          <button
            onClick={addPayment}
            disabled={!amt}
            style={{
              width: "100%",
              padding: "12px",
              borderRadius: 12,
              border: "none",
              background: amt ? "linear-gradient(135deg, #6366f1, #818cf8)" : "#1e293b",
              color: amt ? "#fff" : "#475569",
              fontSize: 14,
              fontWeight: 700,
              cursor: amt ? "pointer" : "default",
              fontFamily: "inherit",
            }}
          >
            + Log Spend
          </button>
        </div>
      </Card>

      {/* Spend history */}
      {state.payments.length > 0 && (
        <Card title="Spend History">
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[...state.payments].reverse().map((p) => (
              <div
                key={p.id}
                style={{
                  background: "#1e293b",
                  borderRadius: 10,
                  padding: "10px 12px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>
                    {p.description}
                  </div>
                  <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>
                    {travel.symbol}{fmt(p.amount)} · {p.method === "cash" ? "💵 Cash" : `💳 ${p.cardName || "Card"}`}
                    {p.surcharge > 0 && ` +${p.surcharge}%`}
                    {" · ≈ "}{home.symbol}{fmt(p.costHome)}
                  </div>
                </div>
                <button
                  onClick={() => removePayment(p.id)}
                  style={{ background: "none", border: "none", color: "#475569", fontSize: 16, cursor: "pointer", padding: 4 }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// ─── Wallet Tab ─────────────────────────────────────────────────────────────

function WalletTab({ state, home, travel, marketRate, walletHome, walletTravel, walletRemaining, spentCash, spentCard, spentTotal, blendedRate }) {
  const totalSpentCashHome = state.payments.filter((p) => p.method === "cash").reduce((s, p) => s + (parseFloat(p.costHome) || 0), 0);
  const totalSpentCardHome = state.payments.filter((p) => p.method !== "cash").reduce((s, p) => s + (parseFloat(p.costHome) || 0), 0);
  const totalSpentHome = totalSpentCashHome + totalSpentCardHome;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Wallet summary */}
      <Card>
        <div style={{ textAlign: "center", padding: "8px 0" }}>
          <div style={{ fontSize: 11, color: "#64748b", fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>
            Remaining Cash
          </div>
          <div style={{
            fontSize: 36,
            fontWeight: 800,
            fontFamily: "'JetBrains Mono', monospace",
            background: walletRemaining >= 0
              ? "linear-gradient(135deg, #e2e8f0, #818cf8)"
              : "linear-gradient(135deg, #fca5a5, #ef4444)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}>
            {travel.symbol}{fmt(walletRemaining)}
          </div>
          <div style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>
            ≈ {home.symbol}{blendedRate > 0 ? fmt(walletRemaining / blendedRate) : "—"}
          </div>
        </div>
      </Card>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Card>
          <div style={{ fontSize: 11, color: "#64748b", fontWeight: 600, marginBottom: 4 }}>Total Changed</div>
          <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>
            {home.symbol}{fmt(walletHome)}
          </div>
          <div style={{ fontSize: 12, color: "#94a3b8" }}>
            → {travel.symbol}{fmt(walletTravel)}
          </div>
        </Card>
        <Card>
          <div style={{ fontSize: 11, color: "#64748b", fontWeight: 600, marginBottom: 4 }}>Total Spent (All)</div>
          <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>
            {travel.symbol}{fmt(spentTotal)}
          </div>
          <div style={{ fontSize: 12, color: "#94a3b8" }}>
            ≈ {home.symbol}{fmt(totalSpentHome)}
          </div>
        </Card>
      </div>

      {/* Cash vs Card breakdown */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Card>
          <div style={{ fontSize: 11, color: "#64748b", fontWeight: 600, marginBottom: 4 }}>💵 Spent Cash</div>
          <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>
            {travel.symbol}{fmt(spentCash)}
          </div>
          <div style={{ fontSize: 12, color: "#94a3b8" }}>
            ≈ {home.symbol}{fmt(totalSpentCashHome)}
          </div>
        </Card>
        <Card>
          <div style={{ fontSize: 11, color: "#64748b", fontWeight: 600, marginBottom: 4 }}>💳 Spent Card</div>
          <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>
            {travel.symbol}{fmt(spentCard)}
          </div>
          <div style={{ fontSize: 12, color: "#94a3b8" }}>
            ≈ {home.symbol}{fmt(totalSpentCardHome)}
          </div>
        </Card>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Card>
          <div style={{ fontSize: 11, color: "#64748b", fontWeight: 600, marginBottom: 4 }}>Blended Rate</div>
          <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>
            {blendedRate > 0 ? fmt(blendedRate, 4) : "—"}
          </div>
          <div style={{ fontSize: 12, color: "#94a3b8" }}>
            {travel.code}/{home.code}
          </div>
        </Card>
        <Card>
          <div style={{ fontSize: 11, color: "#64748b", fontWeight: 600, marginBottom: 4 }}>Market Rate</div>
          <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>
            {marketRate > 0 ? fmt(marketRate, 4) : "—"}
          </div>
          <div style={{ fontSize: 12, color: "#94a3b8" }}>
            {travel.code}/{home.code}
          </div>
        </Card>
      </div>

      {/* Rate comparison bar */}
      {blendedRate > 0 && marketRate > 0 && (
        <Card title="Your Rate vs. Market">
          <div style={{ padding: "4px 0" }}>
            {(() => {
              const diff = ((marketRate - blendedRate) / marketRate) * 100;
              const isGood = diff <= 0;
              return (
                <div>
                  <div style={{
                    height: 8,
                    background: "#1e293b",
                    borderRadius: 4,
                    overflow: "hidden",
                    marginBottom: 8,
                  }}>
                    <div style={{
                      width: `${Math.min(100, 100 - Math.abs(diff))}%`,
                      height: "100%",
                      background: Math.abs(diff) < 0.5 ? "#10b981" : Math.abs(diff) < 1.5 ? "#f59e0b" : "#ef4444",
                      borderRadius: 4,
                      transition: "width 0.3s",
                    }} />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                    <span style={{ color: "#94a3b8" }}>
                      {Math.abs(diff).toFixed(2)}% {diff > 0 ? "below" : "above"} market
                    </span>
                    <span style={{
                      color: Math.abs(diff) < 0.5 ? "#10b981" : Math.abs(diff) < 1.5 ? "#f59e0b" : "#ef4444",
                      fontWeight: 600,
                    }}>
                      {diff > 0
                        ? `Cost you ${home.symbol}${fmt(walletHome * (diff / 100))} extra`
                        : `Saved ${home.symbol}${fmt(Math.abs(walletHome * (diff / 100)))}`
                      }
                    </span>
                  </div>
                </div>
              );
            })()}
          </div>
        </Card>
      )}

      {/* Exchanges breakdown */}
      {state.exchanges.length > 0 && (
        <Card title={`${state.exchanges.length} Exchange${state.exchanges.length > 1 ? "s" : ""}`}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {state.exchanges.map((ex) => (
              <div key={ex.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "4px 0", borderBottom: "1px solid #1e293b" }}>
                <span style={{ color: "#94a3b8" }}>{ex.shop}</span>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>
                  {home.symbol}{fmt(ex.homeAmount)} @ {fmt(ex.rate, 4)}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// ─── Data Tab ───────────────────────────────────────────────────────────────

function DataTab({ state, setState, home, travel, fileInputRef }) {
  const exchCount = state.exchanges?.length || 0;
  const payCount = state.payments?.length || 0;
  const cardCount = state.cards?.length || 0;

  const btnStyle = (color, bg) => ({
    width: "100%",
    padding: "14px",
    borderRadius: 12,
    border: "none",
    background: bg,
    color: color,
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "inherit",
    transition: "all 0.15s",
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Summary */}
      <Card title="Your Data">
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
            <span style={{ color: "#94a3b8" }}>Currency pair</span>
            <span style={{ color: "#e2e8f0", fontWeight: 600 }}>{home.code} → {travel.code}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
            <span style={{ color: "#94a3b8" }}>Exchanges recorded</span>
            <span style={{ color: "#e2e8f0", fontWeight: 600 }}>{exchCount}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
            <span style={{ color: "#94a3b8" }}>Payments recorded</span>
            <span style={{ color: "#e2e8f0", fontWeight: 600 }}>{payCount}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
            <span style={{ color: "#94a3b8" }}>Cards configured</span>
            <span style={{ color: "#e2e8f0", fontWeight: 600 }}>{cardCount}</span>
          </div>
        </div>
      </Card>

      {/* Export */}
      <Card title="Export">
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <p style={{ margin: 0, fontSize: 12, color: "#64748b" }}>
            JSON backup can be re-imported later. CSV is for viewing in Excel / Google Sheets.
          </p>
          <button
            onClick={() => exportToJSON(state)}
            style={btnStyle("#c7d2fe", "linear-gradient(135deg, #6366f1, #818cf8)")}
          >
            📦 Export JSON Backup
          </button>
          <button
            onClick={() => exportToCSV(state, home, travel)}
            style={btnStyle("#bbf7d0", "linear-gradient(135deg, #059669, #10b981)")}
          >
            📊 Export to CSV (Excel)
          </button>
        </div>
      </Card>

      {/* Import */}
      <Card title="Import">
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <p style={{ margin: 0, fontSize: 12, color: "#64748b" }}>
            Restore from a JSON backup. This will replace all current data.
          </p>
          <button
            onClick={() => fileInputRef.current?.click()}
            style={btnStyle("#e2e8f0", "#1e293b")}
          >
            📂 Import JSON Backup
          </button>
        </div>
      </Card>

      {/* Reset */}
      <Card title="Danger Zone" style={{ borderColor: "rgba(239,68,68,0.2)" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <p style={{ margin: 0, fontSize: 12, color: "#64748b" }}>
            Permanently delete all exchanges, payments, and settings.
          </p>
          <button
            onClick={() => {
              if (confirm("Reset ALL data? This cannot be undone. Consider exporting a backup first.")) {
                setState(defaultState());
              }
            }}
            style={btnStyle("#fca5a5", "rgba(239,68,68,0.15)")}
          >
            🗑️ Reset All Data
          </button>
        </div>
      </Card>

      {/* Attribution */}
      <p style={{ textAlign: "center", fontSize: 10, color: "#334155", padding: "8px 0" }}>
        Live rates by <a href="https://www.exchangerate-api.com" target="_blank" rel="noopener noreferrer" style={{ color: "#475569" }}>ExchangeRate-API</a> & <a href="https://frankfurter.dev" target="_blank" rel="noopener noreferrer" style={{ color: "#475569" }}>Frankfurter</a>
      </p>
    </div>
  );
}
