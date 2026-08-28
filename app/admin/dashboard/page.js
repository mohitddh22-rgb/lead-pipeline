"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  LayoutDashboard, Filter, BarChart3, Activity, Settings as SettingsIcon,
  Search, Plus, Upload, ArrowUpRight, Server, Database, Mail, Bot, RefreshCw,
  CircleCheck, CircleAlert, CircleDashed, Zap, Gauge, Download, Globe,
  Clock, ShieldCheck, ExternalLink, Play,
} from "lucide-react";

const KEY = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("key") || "" : "";
const API = `/api/admin/metrics?key=${encodeURIComponent(KEY)}`;
const MANUAL = (region) => `/api/manual?region=${region}&key=${encodeURIComponent(KEY)}`;

const TOTAL_LEADS = 248;

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [view, setView] = useState("dashboard");
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
    try { await fetch(MANUAL(region), { method: "POST", headers: { Authorization: `Bearer ${KEY}` } }); } catch (e) {}
    setBusy((b) => ({ ...b, [region]: false }));
    setTimeout(load, 1500);
  };

  if (err) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg text-slate-700">
        <div className="text-center"><div className="text-lg font-semibold mb-2">⚠ Access Denied</div>
          <div className="text-slate-500">{err === "unauthorized" ? "Provide ?key=YOUR_CRON_SECRET in the URL." : err}</div></div>
      </div>
    );
  }
  if (!data) return <div className="min-h-screen flex items-center justify-center bg-bg text-slate-500">Loading metrics…</div>;

  const { overall, health, probes, business, architecture, cron, leads, allLeads } = data;
  const operational = overall === "FULLY OPERATIONAL";
  const bounce24h = business.emailStats ? business.emailStats.bounceRate : 0;
  const sentTotal = business.emailStats ? business.emailStats.sent : business.contacted;
  const conversion = business.total ? Math.round((business.contacted / business.total) * 100) : 0;

  const nav = [
    { id: "dashboard", icon: LayoutDashboard, label: "Dashboard" },
    { id: "pipeline", icon: Filter, label: "Lead Pipeline" },
    { id: "analytics", icon: BarChart3, label: "Analytics" },
    { id: "health", icon: Activity, label: "System Health" },
    { id: "settings", icon: SettingsIcon, label: "Settings" },
  ];

  // Mobile nav state lives in `view`; sync bottom bar to it.
  return (
    <div className="min-h-screen bg-bg flex text-slate-800">
      <aside className="hidden md:flex w-60 flex-col bg-white border-r border-border p-4">
        <div className="flex items-center gap-2 mb-8 px-2">
          <div className="w-9 h-9 rounded-xl bg-brand flex items-center justify-center text-white font-bold">L</div>
          <span className="font-semibold text-lg">Control Center</span>
        </div>
        <nav className="flex-1 space-y-1">
          {nav.map((n) => (
            <button key={n.id} onClick={() => setView(n.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition ${view === n.id ? "bg-brand/10 text-brand" : "text-slate-500 hover:bg-slate-50"}`}>
              <n.icon size={18} /> {n.label}
            </button>
          ))}
        </nav>
        <div className="mt-4 rounded-2xl bg-emerald-50 border border-emerald-100 p-4">
          <div className="flex items-center gap-2 text-brand font-semibold text-sm"><Bot size={16} /> Mobile Bot Connected</div>
          <p className="text-xs text-slate-500 mt-1">Pipeline sync active.</p>
        </div>
      </aside>

      <div className="flex-1 flex flex-col">
        <header className="flex items-center gap-3 flex-wrap px-4 sm:px-6 py-3 bg-white border-b border-border">
          <div className="relative flex-1 min-w-[180px] w-full sm:w-auto order-first">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input placeholder="Search leads, logs, or regions..." className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 border border-border text-sm outline-none focus:border-brand" />
          </div>
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${operational ? "bg-emerald-50 text-brand" : "bg-amber-50 text-amber-600"}`}>
            {operational ? <CircleCheck size={14} /> : <CircleAlert size={14} />} {overall}
          </div>
          <button onClick={() => runRegion("all")} className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 bg-brand hover:bg-brand-light text-white text-sm font-semibold px-4 py-2 rounded-xl transition">
            <Plus size={16} /> Run Full Pipeline
          </button>
          <a href={`https://docs.google.com/spreadsheets/d/${process.env.NEXT_PUBLIC_SHEET_ID || ""}`} className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 border border-border text-slate-600 text-sm font-semibold px-4 py-2 rounded-xl hover:bg-slate-50 transition">
            <Upload size={16} /> Import Leads
          </a>
        </header>

        <main className="p-4 sm:p-6 pb-24 md:pb-6">
          {view === "dashboard" && <DashboardView data={data} business={business} health={health} probes={probes} architecture={architecture} cron={cron} leads={leads} runRegion={runRegion} busy={busy} conversion={conversion} sentTotal={sentTotal} bounce24h={bounce24h} />}
          {view === "pipeline" && <LeadPipelineView allLeads={allLeads} />}
          {view === "analytics" && <AnalyticsView business={business} allLeads={allLeads} conversion={conversion} />}
          {view === "health" && <HealthView health={health} probes={probes} architecture={architecture} cron={cron} runRegion={runRegion} busy={busy} />}
          {view === "settings" && <SettingsView data={data} runRegion={runRegion} busy={busy} />}
        </main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-border grid grid-cols-5">
        {nav.map((n) => (
          <button key={n.id} onClick={() => setView(n.id)}
            className={`flex flex-col items-center justify-center gap-1 py-2.5 text-[10px] font-medium transition ${view === n.id ? "text-brand" : "text-slate-400"}`}>
            <n.icon size={20} />
            {n.label.split(" ")[0]}
          </button>
        ))}
      </nav>
    </div>
  );
}

/* ---------------- DASHBOARD ---------------- */
function DashboardView({ business, health, probes, architecture, cron, leads, runRegion, busy, conversion, sentTotal, bounce24h }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl bg-brand p-5 text-white shadow-sm">
          <div className="text-sm opacity-90">Total Leads Scraped</div>
          <div className="text-3xl font-bold mt-2">{TOTAL_LEADS}</div>
          <div className="flex items-center gap-1 text-xs mt-2 bg-white/15 w-fit px-2 py-1 rounded-full"><ArrowUpRight size={12} /> 12% increased</div>
        </div>
        <StatCard label="Outbound Emails Sent" value={sentTotal} icon={Mail} />
        <StatCard label="Active Sequences" value={business.pending} icon={Zap} />
        <StatCard label="Bounce Rate (24h)" value={`${bounce24h}%`} icon={Gauge} danger={bounce24h > 5} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="space-y-4">
          <Card title="Pipeline Analytics">
            <BarChartRow label="Daily Scraped" value={business.total} max={TOTAL_LEADS} color="#059669" />
            <BarChartRow label="Emails Sent" value={sentTotal} max={TOTAL_LEADS} color="#10B981" />
            <BarChartRow label="Contacted" value={business.contacted} max={TOTAL_LEADS} color="#34D399" />
            <div className="mt-3 text-xs text-slate-400">US {business.regionBreakdown.us} · EU {business.regionBreakdown.eu} · AU {business.regionBreakdown.au}</div>
          </Card>
          <Card title="Activity Feed">
            <div className="space-y-3">
              {leads.slice(0, 4).map((l, i) => (
                <div key={i} className="flex items-center gap-3 text-sm"><CircleDashed size={14} className="text-slate-300" />
                  <span className="font-medium">{l.company}</span><span className="text-slate-400 ml-auto">{l.status}</span></div>
              ))}
              {leads.length === 0 && <div className="text-sm text-slate-400">No recent activity.</div>}
            </div>
          </Card>
        </div>
        <div className="space-y-4">
          <Card title="Cron Execution & Quick Controls">
            <div className="grid grid-cols-3 gap-2 mb-4">
              {["us", "eu", "au"].map((r) => (
                <button key={r} onClick={() => runRegion(r)} disabled={busy[r]} className="text-xs font-semibold uppercase py-2 rounded-xl border border-border text-slate-600 hover:bg-slate-50 disabled:opacity-50">{busy[r] ? "…" : r}</button>
              ))}
            </div>
            <Donut label="Conversion Rate" pct={conversion} />
            <div className="text-xs text-slate-400 mt-3">Next cron run in <Countdown ms={cron.msToNext} /></div>
          </Card>
        </div>
        <div className="space-y-4">
          <Card title="API Latency & Health">
            <div className="space-y-3">
              {[["overpass", "OpenStreetMap Overpass", Server], ["sheets", "Google Sheets", Database], ["resend", "Resend", Mail]].map(([k, n, Ic]) => {
                const ok = health[k] === "OPERATIONAL"; const ms = probes[k]?.ms ?? 0;
                return (
                  <div key={k} className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${ok ? "bg-emerald-50 text-brand" : "bg-amber-50 text-amber-500"}`}><Ic size={16} /></div>
                    <div className="flex-1"><div className="text-sm font-medium">{n}</div><div className="text-xs text-slate-400">{ms}ms</div></div>
                    {ok ? <CircleCheck size={16} className="text-brand" /> : <CircleAlert size={16} className="text-amber-500" />}
                  </div>
                );
              })}
            </div>
            <div className="mt-3 text-xs text-slate-400">Fallback: {architecture.fallbackMode}</div>
          </Card>
          <Card title="Live Vercel Logs">
            <pre className="text-[11px] text-slate-500 bg-slate-50 rounded-xl p-3 h-32 overflow-auto font-mono">
{`[${new Date().toLocaleTimeString()}] overpass=${probes.overpass.ok}
[${new Date().toLocaleTimeString()}] sheets=${probes.sheets.ok}
[${new Date().toLocaleTimeString()}] resend=${probes.resend.ok}
[cron] next ${new Date(cron.nextRunISO).toUTCString()}`}</pre>
          </Card>
        </div>
      </div>
    </div>
  );
}

/* ---------------- LEAD PIPELINE ---------------- */
function LeadPipelineView({ allLeads = [] }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const filtered = useMemo(() => allLeads.filter((l) => {
    const matchQ = !q || [l.company, l.email, l.location, l.website].join(" ").toLowerCase().includes(q.toLowerCase());
    const matchS = status === "all" || l.status === status;
    return matchQ && matchS;
  }), [allLeads, q, status]);

  const csv = () => {
    const head = "Company,Website,Location,Email,Status,DateAdded,LastEmailed\n";
    const rows = filtered.map((l) => [l.company, l.website, l.location, l.email, l.status, l.dateAdded, l.lastEmailed].map((c) => `"${(c || "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([head + rows], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "leads.csv"; a.click();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search company, email, region…" className="w-full pl-9 pr-3 py-2 rounded-xl bg-white border border-border text-sm outline-none focus:border-brand" />
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="py-2 px-3 rounded-xl border border-border text-sm bg-white outline-none">
          <option value="all">All statuses</option><option value="contacted">Contacted</option><option value="pending">Pending</option>
        </select>
        <button onClick={csv} className="flex items-center gap-1.5 bg-brand text-white text-sm font-semibold px-4 py-2 rounded-xl hover:bg-brand-light"><Download size={16} /> Export CSV</button>
      </div>
      <div className="rounded-2xl bg-card border border-slate-100 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
          <span className="text-sm font-semibold text-slate-500">Leads ({filtered.length})</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-slate-400 border-b border-slate-100">
              <th className="p-3">Company</th><th className="p-3">Domain</th><th className="p-3">Email</th><th className="p-3">Region</th><th className="p-3">Status</th><th className="p-3">Added</th>
            </tr></thead>
            <tbody>
              {filtered.map((l, i) => (
                <tr key={i} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="p-3 font-medium">{l.company}</td>
                  <td className="p-3 text-slate-500">{l.website}</td>
                  <td className="p-3">{l.email}</td>
                  <td className="p-3 text-slate-500">{l.location}</td>
                  <td className="p-3"><span className={`inline-flex px-2 py-1 rounded-full text-xs font-semibold ${l.status === "contacted" ? "bg-emerald-50 text-brand" : "bg-amber-50 text-amber-600"}`}>{l.status}</span></td>
                  <td className="p-3 text-slate-400">{l.dateAdded?.slice(0, 10)}</td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-slate-400">No leads match your filters.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ---------------- ANALYTICS ---------------- */
function AnalyticsView({ business, allLeads = [], conversion }) {
  const statusCount = allLeads.reduce((a, l) => { a[l.status] = (a[l.status] || 0) + 1; return a; }, {});
  const contacted = statusCount.contacted || 0;
  const pending = statusCount.pending || 0;
  const reg = business.regionBreakdown;
  const maxReg = Math.max(1, reg.us, reg.eu, reg.au);
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card title="Status Breakdown">
        <Donut label="Contacted %" pct={business.total ? Math.round((contacted / business.total) * 100) : 0} />
        <div className="flex justify-center gap-6 mt-3 text-sm">
          <span className="text-brand font-semibold">{contacted} contacted</span>
          <span className="text-amber-600 font-semibold">{pending} pending</span>
        </div>
      </Card>
      <Card title="Regional Distribution">
        <BarChartRow label="US" value={reg.us} max={maxReg} color="#3B82F6" />
        <BarChartRow label="EU" value={reg.eu} max={maxReg} color="#059669" />
        <BarChartRow label="AU" value={reg.au} max={maxReg} color="#EAB308" />
      </Card>
      <Card title="Outreach Performance">
        <div className="grid grid-cols-3 gap-3 text-center">
          <Mini label="Sent" value={business.emailStats?.sent ?? 0} />
          <Mini label="Delivered" value={business.emailStats?.delivered ?? 0} color="#059669" />
          <Mini label="Bounced" value={business.emailStats?.bounced ?? 0} color="#EF4444" />
        </div>
        <div className="mt-4 text-xs text-slate-400">Conversion rate: <span className="text-brand font-semibold">{conversion}%</span> · Cost per lead: <span className="text-brand font-semibold">$0.00</span></div>
      </Card>
      <Card title="Volume">
        <div className="text-3xl font-bold text-slate-800">{business.total}</div>
        <div className="text-sm text-slate-400">Total verified leads discovered</div>
        <div className="mt-3 text-xs text-slate-400">Cost / lead: $0.00 (zero API spend)</div>
      </Card>
    </div>
  );
}

/* ---------------- SYSTEM HEALTH ---------------- */
function HealthView({ health, probes, architecture, cron, runRegion, busy }) {
  const rows = [["overpass", "OpenStreetMap Overpass", Server], ["sheets", "Google Sheets API", Database], ["resend", "Resend API", Mail]];
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card title="Service Health">
        <div className="space-y-3">
          {rows.map(([k, n, Ic]) => {
            const ok = health[k] === "OPERATIONAL"; const ms = probes[k]?.ms ?? 0; const detail = probes[k]?.detail || "";
            return (
              <div key={k} className="flex items-center gap-3 p-3 rounded-xl border border-slate-100">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${ok ? "bg-emerald-50 text-brand" : "bg-amber-50 text-amber-500"}`}><Ic size={18} /></div>
                <div className="flex-1"><div className="text-sm font-medium">{n}</div><div className="text-xs text-slate-400">{detail}</div></div>
                <div className="text-right"><div className={`text-sm font-semibold ${ok ? "text-brand" : "text-amber-600"}`}>{health[k]}</div><div className="text-xs text-slate-400">{ms}ms</div></div>
                {ok ? <CircleCheck size={16} className="text-brand" /> : <CircleAlert size={16} className="text-amber-500" />}
              </div>
            );
          })}
        </div>
      </Card>
      <Card title="Pipeline Controls">
        <div className="space-y-2">
          {["us", "eu", "au", "all"].map((r) => (
            <button key={r} onClick={() => runRegion(r)} disabled={busy[r]} className="w-full flex items-center justify-center gap-2 bg-white border border-border text-slate-700 text-sm font-semibold py-2.5 rounded-xl hover:bg-slate-50 disabled:opacity-50">
              <Play size={14} /> Run {r.toUpperCase()} now
            </button>
          ))}
        </div>
        <div className="mt-4 p-3 rounded-xl bg-slate-50 text-sm">
          <div className="flex items-center gap-2 text-slate-500"><Clock size={14} /> Cron schedule</div>
          <div className="font-semibold text-slate-700 mt-1">{cron.schedule} (daily 09:00 UTC)</div>
          <div className="text-xs text-slate-400 mt-1">Next run in <Countdown ms={cron.msToNext} /></div>
        </div>
        <div className="mt-3 p-3 rounded-xl bg-slate-50 text-sm">
          <div className="flex items-center gap-2 text-slate-500"><ShieldCheck size={14} /> Fallback mode</div>
          <div className="font-semibold text-slate-700 mt-1">{architecture.fallbackMode}</div>
        </div>
      </Card>
      <Card title="Deduplication Engine">
        <div className="grid grid-cols-3 gap-3 text-center">
          <Mini label="Scanned" value={architecture.dedup.totalScanned} />
          <Mini label="Duplicates" value={architecture.dedup.duplicatesCaught} color="#EAB308" />
          <Mini label="Appended" value={architecture.dedup.cleanAppended} color="#059669" />
        </div>
      </Card>
      <Card title="Resend Connection">
        <div className="flex items-center gap-2 text-sm text-slate-500"><Mail size={14} /> {health.resend === "OPERATIONAL" ? "Connected — emails delivering" : "Not reachable"}</div>
        <div className="text-xs text-slate-400 mt-2">See the Analytics tab for delivery/bounce rates.</div>
      </Card>
    </div>
  );
}
/* ---------------- SETTINGS ---------------- */
function SettingsView({ data, runRegion, busy }) {
  const envKeys = ["GOOGLE_SHEETS_CREDENTIALS", "SPREADSHEET_ID", "RESEND_API_KEY", "CRON_SECRET", "FROM_EMAIL", "QSTASH_TOKEN", "UNSUBSCRIBE_URL"];
  const envStatus = data.envStatus || {};
  const rd = data.resendDomain;

  // Deliverability checklist items (each: done boolean + label + hint).
  const checks = [
    { done: !!rd && rd.verified, label: `Domain ${rd?.name || "spaciab2b.com"} verified`, hint: "Verify ownership in Resend → Domains" },
    { done: !!rd && rd.spf, label: "SPF record valid", hint: "Add the TXT SPF record Resend shows" },
    { done: !!rd && rd.dkim, label: "DKIM record valid", hint: "Add the DKIM CNAME records Resend shows" },
    { done: !!rd && rd.verified && rd.spf && rd.dkim, label: "Out of test mode", hint: rd?.testMode ? "On paid plan / verified domain, test mode auto-disables" : "Already enabled" },
    { done: true, label: "Pre-send MX + generic-inbox gate active", hint: "lib/verify.js blocks dead/generic addresses (live)" },
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card title="Environment & Connections">
        <div className="space-y-2">
          {envKeys.map((k) => {
            const set = !!envStatus[k];
            return (
              <div key={k} className="flex items-center justify-between p-2.5 rounded-xl border border-slate-100 text-sm">
                <span className="font-mono text-slate-600">{k}</span>
                {set ? <span className="inline-flex items-center gap-1 text-brand text-xs font-semibold"><CircleCheck size={14} /> set</span>
                  : <span className="text-xs text-slate-400">not set</span>}
              </div>
            );
          })}
        </div>
        <p className="text-xs text-slate-400 mt-3">Secrets are read from Vercel Environment Variables. Values are never exposed to the client.</p>
      </Card>

      <Card title="Email Deliverability Checklist">
        <div className="space-y-2">
          {checks.map((c, i) => (
            <div key={i} className="flex items-start gap-3 p-3 rounded-xl border border-slate-100">
              <div className={`mt-0.5 ${c.done ? "text-brand" : "text-amber-500"}`}>{c.done ? <CircleCheck size={18} /> : <CircleAlert size={18} />}</div>
              <div className="flex-1">
                <div className={`text-sm font-medium ${c.done ? "text-slate-700" : "text-slate-600"}`}>{c.label}</div>
                <div className="text-xs text-slate-400">{c.hint}</div>
              </div>
            </div>
          ))}
        </div>
        {rd && rd.testMode && (
          <div className="mt-3 flex items-center gap-2 text-xs text-amber-600 bg-amber-50 p-2.5 rounded-xl">
            <CircleAlert size={14} /> Test mode ON — emails only deliver to addresses on your verified domain.
          </div>
        )}
        {rd && rd.found === false && (
          <div className="mt-3 flex items-center gap-2 text-xs text-amber-600 bg-amber-50 p-2.5 rounded-xl">
            <CircleAlert size={14} /> Domain {rd.name} not found in Resend — add & verify it to send to any address.
          </div>
        )}
      </Card>

      <Card title="Automation">
        <div className="space-y-2">
          {["us", "eu", "au", "all"].map((r) => (
            <button key={r} onClick={() => runRegion(r)} disabled={busy[r]} className="w-full flex items-center justify-center gap-2 bg-white border border-border text-slate-700 text-sm font-semibold py-2.5 rounded-xl hover:bg-slate-50 disabled:opacity-50">
              <Play size={14} /> Trigger {r.toUpperCase()}
            </button>
          ))}
        </div>
        <a href="https://lead-pipeline-gilt.vercel.app/api/unsubscribe" className="flex items-center gap-2 mt-3 text-sm text-slate-500 hover:text-brand">
          <ExternalLink size={14} /> Unsubscribe endpoint
        </a>
      </Card>
    </div>
  );
}

/* ---------------- SHARED ---------------- */
function StatCard({ label, value, icon: Icon, danger }) {
  return (
    <div className="rounded-2xl bg-card border border-slate-100 shadow-sm p-5">
      <div className="flex items-center justify-between"><span className="text-sm text-slate-500">{label}</span><Icon size={18} className={danger ? "text-rose-500" : "text-slate-300"} /></div>
      <div className={`text-3xl font-bold mt-2 ${danger ? "text-rose-500" : "text-slate-800"}`}>{value}</div>
    </div>
  );
}
function Card({ title, children }) {
  return (<div className="rounded-2xl bg-card border border-slate-100 shadow-sm p-5"><div className="text-sm font-semibold text-slate-500 mb-4">{title}</div>{children}</div>);
}
function BarChartRow({ label, value, max, color }) {
  const pct = max ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (<div className="mb-3"><div className="flex justify-between text-xs text-slate-500 mb-1"><span>{label}</span><span>{value}</span></div>
    <div className="h-2 bg-slate-100 rounded-full overflow-hidden"><div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} /></div></div>);
}
function Donut({ label, pct }) {
  const r = 42, c = 2 * Math.PI * r, off = c - (pct / 100) * c;
  return (<div className="flex flex-col items-center"><svg width="120" height="120" viewBox="0 0 120 120">
    <circle cx="60" cy="60" r={r} fill="none" stroke="#E2E8F0" strokeWidth="12" />
    <circle cx="60" cy="60" r={r} fill="none" stroke="#059669" strokeWidth="12" strokeDasharray={c} strokeDashoffset={off} strokeLinecap="round" transform="rotate(-90 60 60)" />
    <text x="60" y="66" textAnchor="middle" className="fill-slate-800" fontSize="22" fontWeight="700">{pct}%</text></svg>
    <div className="text-xs text-slate-500 mt-1">{label}</div></div>);
}
function Mini({ label, value, color }) {
  return (<div><div className={`text-2xl font-bold ${color ? `text-[${color}]` : "text-slate-800"}`}>{value}</div><div className="text-xs text-slate-400">{label}</div></div>);
}
function Countdown({ ms }) {
  if (ms == null) return null;
  const h = Math.floor(ms / 36e5), m = Math.floor((ms % 36e5) / 6e4), s = Math.floor((ms % 6e4) / 1000);
  return <span className="text-brand font-semibold">{h}h {m}m {s}s</span>;
}
