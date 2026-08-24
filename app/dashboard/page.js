import { getLeadStats } from "../../lib/dashboard.js";

export const dynamic = "force-dynamic"; // always read fresh sheet data
export const runtime = "nodejs";

export default async function DashboardPage() {
  const stats = await getLeadStats();
  if (!stats) {
    return (
      <main style={{ fontFamily: "Arial, sans-serif", maxWidth: 720, margin: "60px auto", padding: 24 }}>
        <h1>Lead Pipeline — Monitor</h1>
        <p style={{ color: "#888" }}>
          Google Sheets is not configured yet. Set <code>GOOGLE_SHEETS_CREDENTIALS</code> and
          <code> SPREADSHEET_ID</code> in your environment to see live stats.
        </p>
      </main>
    );
  }
  if (stats.error) {
    return (
      <main style={{ fontFamily: "Arial, sans-serif", maxWidth: 720, margin: "60px auto", padding: 24 }}>
        <h1>Lead Pipeline — Monitor</h1>
        <p style={{ color: "#c0392b" }}>Error loading sheet: {stats.error}</p>
      </main>
    );
  }
  const card = { flex: 1, background: "#f8f9fa", borderRadius: 12, padding: 20, textAlign: "center" };
  return (
    <main style={{ fontFamily: "Arial, sans-serif", maxWidth: 920, margin: "60px auto", padding: 24 }}>
      <h1>Lead Pipeline — Monitor</h1>
      <div style={{ display: "flex", gap: 16, marginTop: 24 }}>
        <div style={card}><div style={{ fontSize: 32, fontWeight: 700 }}>{stats.total}</div><div style={{ color: "#666" }}>Total Leads</div></div>
        <div style={card}><div style={{ fontSize: 32, fontWeight: 700, color: "#27ae60" }}>{stats.contacted}</div><div style={{ color: "#666" }}>Contacted</div></div>
        <div style={card}><div style={{ fontSize: 32, fontWeight: 700, color: "#e67e22" }}>{stats.pending}</div><div style={{ color: "#666" }}>Pending</div></div>
      </div>
      <h2 style={{ marginTop: 40 }}>Recent</h2>
      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 8 }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "2px solid #eee" }}>
            <th style={{ padding: 8 }}>Company</th><th style={{ padding: 8 }}>Location</th>
            <th style={{ padding: 8 }}>Email</th><th style={{ padding: 8 }}>Status</th>
          </tr>
        </thead>
        <tbody>
          {stats.recent.map((r, i) => (
            <tr key={i} style={{ borderBottom: "1px solid #f0f0f0" }}>
              <td style={{ padding: 8 }}>{r.company}</td>
              <td style={{ padding: 8 }}>{r.location}</td>
              <td style={{ padding: 8 }}>{r.email}</td>
              <td style={{ padding: 8 }}>{r.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
