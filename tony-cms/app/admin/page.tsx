import Link from "next/link";
import { ArrowUpRight, CheckCircle2, Clock3, Database, FileText, Layers3, Zap } from "lucide-react";
import { PageHeader, StatusPill } from "@/components/admin";
import { listAudit, listEntries, listModels } from "@/lib/cms";

export default async function DashboardPage() {
  const [models, entries, audit] = await Promise.all([listModels(), listEntries(), listAudit()]);
  const published = entries.filter((entry) => entry.status === "published").length;
  const drafts = entries.filter((entry) => entry.status === "draft").length;

  return (
    <>
      <PageHeader eyebrow="Tony Labs / Website" title="Content operations" description="Model, edit and deliver content from one developer-friendly workspace." action={<Link className="button primary" href="/admin/entries">Create entry <ArrowUpRight size={15} /></Link>} />

      <section className="metric-grid" aria-label="Workspace metrics">
        <article className="metric-card"><span><Layers3 size={18} /> Content models</span><strong>{models.length}</strong><small>Schema-first structures</small></article>
        <article className="metric-card"><span><FileText size={18} /> Total entries</span><strong>{entries.length}</strong><small>{drafts} currently in draft</small></article>
        <article className="metric-card"><span><Zap size={18} /> Published</span><strong>{published}</strong><small>Available via delivery API</small></article>
        <article className="metric-card"><span><Database size={18} /> API requests</span><strong>12.8k</strong><small>99.98% successful this month</small></article>
      </section>

      <section className="dashboard-grid">
        <article className="panel">
          <div className="panel-heading"><div><h2>Recent entries</h2><p>Latest content activity across every model.</p></div><Link href="/admin/entries">View all</Link></div>
          <div className="table-wrap"><table><thead><tr><th>Entry</th><th>Model</th><th>Status</th><th>Locale</th><th>Updated</th></tr></thead><tbody>
            {entries.slice(0, 5).map((entry) => <tr key={entry.id}><td><Link className="entry-title" href={`/admin/entries/${entry.id}`}>{String(entry.data.title ?? entry.id)}</Link><small>v{entry.version} · {entry.updatedBy}</small></td><td>{entry.model}</td><td><StatusPill status={entry.status} /></td><td>{entry.locale.toUpperCase()}</td><td>{new Date(entry.updatedAt).toLocaleDateString("en-GB")}</td></tr>)}
          </tbody></table></div>
        </article>

        <aside className="panel launch-panel">
          <div className="panel-heading"><div><h2>Launch checklist</h2><p>Core setup for a production project.</p></div><span className="progress-label">3 / 5</span></div>
          <div className="progress"><span style={{ width: "60%" }} /></div>
          <ul className="checklist">
            <li className="done"><CheckCircle2 size={18} /><span><strong>Create a content model</strong><small>Article schema is ready</small></span></li>
            <li className="done"><CheckCircle2 size={18} /><span><strong>Add your first entry</strong><small>Demo content seeded</small></span></li>
            <li className="done"><CheckCircle2 size={18} /><span><strong>Publish content</strong><small>Delivery endpoint active</small></span></li>
            <li><Clock3 size={18} /><span><strong>Connect production database</strong><small>Apply Supabase migration</small></span></li>
            <li><Clock3 size={18} /><span><strong>Invite the team</strong><small>Configure roles and access</small></span></li>
          </ul>
        </aside>
      </section>

      <section className="panel activity-panel">
        <div className="panel-heading"><div><h2>Activity</h2><p>Auditable changes from your workspace.</p></div></div>
        <div className="activity-list">{audit.map((event) => <div key={event.id}><span className="activity-dot" /><div><strong>{event.actor}</strong> {event.action.toLowerCase()} <b>{event.entity}</b><small>{new Date(event.createdAt).toLocaleString("en-GB")}</small></div></div>)}</div>
      </section>
    </>
  );
}
