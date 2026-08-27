"use client";

import { useState, useEffect, useCallback } from "react";

const KEY = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("key") || "" : "";
const API = `/api/admin/metrics?key=${encodeURIComponent(KEY)}`;
const MANUAL = (region) => `/api/manual?region=${region}&key=${encodeURIComponent(KEY)}`;

const C = {
  bg: "#0b0f17", panel: "#141a26", panel2: "#1b2230", border: "#263041",
  text: "#e6edf6", muted: "#8b97a8", green: "#22c55e", yellow: "#eab308",
  red: "#ef4444", blue: "#3b82f6", accent: "#6366f1", us: "#3b82f6", eu: "#22c55e", au: "#eab308",
};

const healthColor = (s) => (s === "OPERATIONAL" ? C.green : s === "DEGRADED" ? C.yellow : C.red);
const badge = (label, color, bg) => ({ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 999, fontSize: 12, fontWeight: 600, color, background: bg || "transparent", border: `1px solid ${color}` });

function Card({ title, children, right }) {
  return (
    <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.muted, letterSpacing: 0.4 }}>{title}</div>
        {right}
      </div>
      {children}
    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div style={{ flex: 1, background: C.panel2, borderRadius: 10, padding: 14, textAlign: "center" }}>
      <div style={{ fontSize: 26, fontWeight: 800, color: color || C.text }}>{value}</div>
      <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>{label}</div>
    </div>
  );
}

function Bar({ label, value, max, color }) {
  const pct = max ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: C.muted, marginBottom: 4 }}>
        <span>{label}</span><span>{value}</span>
      </div>
      <div style={{ height: 8, background: C.panel2, borderRadius: 6, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, transition: "width .4s" }} />
      </div>
    </div>
  );
}

function Countdown({ ms }) {
  if (ms == null) return null;
  const h = Math.floor(ms / 36e5), m = Math.floor((ms % 36e5) / 6e4), s = Math.floor((ms % 6e4) / 1000);
  return <span style={{ color: C.blue, fontWeight: 700 }}>{h}h {m}m {s}s</span>;
}

function ActionButton({ label, region, busy, onClick }) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      style={{ padding: "10px 14px", borderRadius: 10, border: `1px solid ${C.border}`, background: busy ? C.panel2 : C.accent, color: "#fff", fontWeight: 600, cursor: busy ? "wait" : "pointer", fontSize: 13, opacity: busy ? 0.6 : 1 }}
    >
      {busy ? "Running…" : label}
    </button>
  );
}

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [tab, setTab] = useState("tech");
  const [busy, setBusy] = useState({});

  const load = useCallback(async () => {
    try {
      const res = await fetch(API);
      const j = await res.json();
      if (!j.ok) { setErr(j.error || "unauthorized"); return; }
      setData(j); setErr(null);
    } catch (e) { setErr(e.message); }
  }, []);

  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, [load]);

  const runRegion = async (region) => {
    setBusy((b) => ({ ...b, [region]: true }));
    try { await fetch(MANUAL(region), { method: "POST", headers: { Authorization: `Bearer ${KEY}` } }); }
    catch (e) {}
    setBusy((b) => ({ ...b, [region]: false }));
    setTimeout(load, 1500);
  };

  if (err) {
    return (
      <main style={{ minHeight: "100vh", background: C.bg, color: C.text, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>⚠ Access Denied</div>
          <div style={{ color: C.muted }}>{err === "unauthorized" ? "Provide ?key=YOUR_CRON_SECRET in the URL." : err}</div>
        </div>
      </main>
    );
  }
  if (!data) {
    return <main style={{ minHeight: "100vh", background: C.bg, color: C.muted, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui" }}>Loading metrics…</main>;
  }

  const { overall, health, probes, business, architecture, cron, leads } = data;
  const overallColor = overall === "FULLY OPERATIONAL" ? C.green : C.yellow;

  return (
    <main style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: "system-ui", padding: 20 }}>
      {/* TOP BAR */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800 }}>Master Pipeline Control Center</div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
            Last sync: {new Date(data.generatedAt).toLocaleTimeString()} · Next cron <Countdown ms={cron.msToNext} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <span style={badge(overall, overallColor, "rgba(34,197,94,.08)")}>● {overall}</span>
        </div>
      </div>

      {/* ACTION PANEL */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 18 }}>
        <ActionButton label="Trigger US" region="us" busy={busy.us} onClick={() => runRegion("us")} />
        <ActionButton label="Trigger EU" region="eu" busy={busy.eu} onClick={() => runRegion("eu")} />
        <ActionButton label="Trigger AU" region="au" busy={busy.au} onClick={() => runRegion("au")} />
        <ActionButton label="Run Full Pipeline" region="all" busy={busy.all} onClick={() => { runRegion("us"); runRegion("eu"); runRegion("au"); }} />
      </div>

      {/* TABS */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, borderBottom: `1px solid ${C.border}` }}>
        {[["tech","Tech & Infra"],["arch","Architecture"],["biz","Business"],["sales","Sales CRM"]].map(([k, v]) => (
          <button key={k} onClick={() => setTab(k)} style={{ padding: "10px 14px", background: "transparent", border: "none", borderBottom: tab === k ? `2px solid ${C.accent}` : "2px solid transparent", color: tab === k ? C.text : C.muted, fontWeight: 600, cursor: "pointer", fontSize: 13 }}>{v}</button>
        ))}
      </div>

      {/* TECH VIEW */}
      {tab === "tech" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 14 }}>
          <Card title="System Health">
            {[
              ["OpenStreetMap Overpass", health.overpass],
              ["Google Sheets API", health.sheets],
              ["Resend API", health.resend],
            ].map(([n, s]) => (
              <div key={n} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${C.border}` }}>
                <span style={{ fontSize: 13 }}>{n}</span>
                <span style={{ ...badge(s, healthColor(s)), border: "none", background: "transparent" }}>● {s}</span>
              </div>
            ))}
          </Card>
          <Card title="API Latency">
            {probes && Object.values(probes).map((p) => (
              <div key={p.name} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0" }}>
                <span style={{ fontSize: 13 }}>{p.name}</span>
                <span style={{ fontSize: 13, color: p.ok ? C.green : C.red }}>{p.ms}ms {p.ok ? "✓" : "✕"}</span>
              </div>
            ))}
          </Card>
          <Card title="Cron Execution">
            <Stat label="Schedule" value="Daily 9:00 UTC" />
            <div style={{ marginTop: 10, fontSize: 13, color: C.muted }}>Next run in <Countdown ms={cron.msToNext} /></div>
          </Card>
          <Card title="Vercel Logs">
            <div style={{ fontSize: 12, color: C.muted, fontFamily: "monospace", background: C.panel2, borderRadius: 8, padding: 10, maxHeight: 140, overflow: "auto" }}>
              {`[${new Date(data.generatedAt).toLocaleTimeString()}] probe overpass=${probes.overpass.ok}\n[${new Date(data.generatedAt).toLocaleTimeString()}] probe sheets=${probes.sheets.ok}\n[${new Date(data.generatedAt).toLocaleTimeString()}] probe resend=${probes.resend.ok}\n[cron] next: ${new Date(cron.nextRunISO).toUTCString()}`}
            </div>
          </Card>
        </div>
      )}

      {/* ARCHITECTURE VIEW */}
      {tab === "arch" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 14 }}>
          <Card title="Fallback Mode">
            <div style={{ ...badge(architecture.fallbackMode, architecture.fallbackMode.includes("Primary") ? C.green : C.yellow), border: "none", background: "transparent", fontSize: 14 }}>
              {architecture.fallbackMode.includes("Primary") ? "●" : "⚠"} {architecture.fallbackMode}
            </div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 8 }}>When Overpass is unreachable the pipeline falls back to seeded mock leads so outreach never stalls.</div>
          </Card>
          <Card title="Deduplication Engine">
            <Stat label="Domains Scanned" value={architecture.dedup.totalScanned} />
            <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
              <Stat label="Duplicates Caught" value={architecture.dedup.duplicatesCaught} color={C.yellow} />
              <Stat label="Clean Appended" value={architecture.dedup.cleanAppended} color={C.green} />
            </div>
          </Card>
          <Card title="Rate-Limit Meter (Overpass)">
            <Bar label="Overpass latency" value={probes.overpass.ms} max={6000} color={C.us} />
            <Bar label="Sheets latency" value={probes.sheets.ms} max={6000} color={C.eu} />
            <Bar label="Resend latency" value={probes.resend.ms} max={6000} color={C.au} />
          </Card>
        </div>
      )}

      {/* BUSINESS VIEW */}
      {tab === "biz" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 14 }}>
          <Card title="Executive Summary">
            <div style={{ display: "flex", gap: 10 }}>
              <Stat label="Total Leads" value={business.total} />
              <Stat label="Contacted" value={business.contacted} color={C.green} />
              <Stat label="Pending" value={business.pending} color={C.yellow} />
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
              <Stat label="Cost / Lead" value={`$${business.costPerLead.toFixed(2)}`} color={C.blue} />
              <Stat label="Delivery Rate" value={business.emailStats ? `${business.emailStats.deliveryRate}%` : "—"} color={C.green} />
            </div>
          </Card>
          <Card title="Regional Distribution">
            <Bar label="US" value={business.regionBreakdown.us} max={Math.max(1, business.regionBreakdown.us, business.regionBreakdown.eu, business.regionBreakdown.au)} color={C.us} />
            <Bar label="EU" value={business.regionBreakdown.eu} max={Math.max(1, business.regionBreakdown.us, business.regionBreakdown.eu, business.regionBreakdown.au)} color={C.eu} />
            <Bar label="AU" value={business.regionBreakdown.au} max={Math.max(1, business.regionBreakdown.us, business.regionBreakdown.eu, business.regionBreakdown.au)} color={C.au} />
          </Card>
          <Card title="Email Performance">
            {business.emailStats ? (
              <div style={{ fontSize: 13 }}>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0" }}><span>Sent</span><span>{business.emailStats.sent}</span></div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0" }}><span>Delivered</span><span style={{ color: C.green }}>{business.emailStats.delivered}</span></div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0" }}><span>Bounced</span><span style={{ color: C.red }}>{business.emailStats.bounced}</span></div>
              </div>
            ) : <div style={{ fontSize: 12, color: C.muted }}>Resend email stats unavailable (key scope / plan).</div>}
          </Card>
        </div>
      )}

      {/* SALES VIEW */}
      {tab === "sales" && (
        <div style={{ display: "grid", gap: 14 }}>
          <Card title={`Live Lead Table (${leads.length})`} right={<a href={`https://docs.google.com/spreadsheets/d/${process.env.NEXT_PUBLIC_SHEET_ID || ""}`} style={{ fontSize: 12, color: C.blue }}>Open Google Sheet ↗</a>}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ textAlign: "left", color: C.muted, borderBottom: `1px solid ${C.border}` }}>
                    <th style={{ padding: 8 }}>Company</th><th style={{ padding: 8 }}>Domain</th><th style={{ padding: 8 }}>Email</th><th style={{ padding: 8 }}>Region</th><th style={{ padding: 8 }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {leads.map((l, i) => (
                    <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
                      <td style={{ padding: 8 }}>{l.company}</td>
                      <td style={{ padding: 8, color: C.muted }}>{l.website}</td>
                      <td style={{ padding: 8 }}>{l.email}</td>
                      <td style={{ padding: 8 }}>{l.location}</td>
                      <td style={{ padding: 8 }}><span style={badge(l.status || "pending", l.status === "contacted" ? C.green : C.yellow, "transparent")}>{l.status || "pending"}</span></td>
                    </tr>
                  ))}
                  {leads.length === 0 && <tr><td colSpan={5} style={{ padding: 16, color: C.muted, textAlign: "center" }}>No leads yet — run the pipeline above.</td></tr>}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
    </main>
  );
}
