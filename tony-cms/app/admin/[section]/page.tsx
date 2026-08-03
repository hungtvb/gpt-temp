import Link from "next/link";
import { notFound } from "next/navigation";
import { Plus } from "lucide-react";
import { EmptyState, PageHeader, StatusPill } from "@/components/admin";
import { listAudit, listEntries, listModels } from "@/lib/cms";

const sections = {
  models: { title: "Content models", description: "Define reusable schemas and validation rules for every content type." },
  entries: { title: "Entries", description: "Create, review and publish structured content across locales." },
  media: { title: "Media library", description: "Manage reusable images, files and metadata in one place." },
  "api-keys": { title: "API keys", description: "Issue scoped credentials for content delivery consumers." },
  webhooks: { title: "Webhooks", description: "Notify downstream systems when content changes lifecycle state." },
  team: { title: "Team", description: "Manage workspace members and role-based permissions." },
  audit: { title: "Audit log", description: "Review security and content operations across the workspace." },
  settings: { title: "Project settings", description: "Configure locales, environments and delivery behavior." },
} as const;

type Section = keyof typeof sections;

export default async function SectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section: rawSection } = await params;
  if (!(rawSection in sections)) notFound();
  const section = rawSection as Section;
  const meta = sections[section];

  return (
    <>
      <PageHeader title={meta.title} description={meta.description} action={<button className="button primary"><Plus size={15} /> New</button>} />
      {section === "models" ? <Models /> : null}
      {section === "entries" ? <Entries /> : null}
      {section === "audit" ? <Audit /> : null}
      {section === "media" ? <EmptyState title="No uploaded assets yet" description="Upload files or connect an external asset source." /> : null}
      {section === "api-keys" ? <ApiKeys /> : null}
      {section === "webhooks" ? <EmptyState title="No webhooks configured" description="Create a signed webhook endpoint for publish and unpublish events." /> : null}
      {section === "team" ? <Team /> : null}
      {section === "settings" ? <Settings /> : null}
    </>
  );
}

async function Models() {
  const models = await listModels();
  return <div className="model-grid">{models.map((model) => <article className="model-card" key={model.id}><div className="model-icon">{model.name.slice(0, 1)}</div><div><div className="model-title"><h2>{model.name}</h2><code>{model.slug}</code></div><p>{model.description}</p><div className="model-meta"><span>{model.fields.length} fields</span><span>{model.entriesCount} entries</span><span>Updated {new Date(model.updatedAt).toLocaleDateString("en-GB")}</span></div></div></article>)}</div>;
}

async function Entries() {
  const entries = await listEntries();
  return <article className="panel"><div className="filters"><input aria-label="Search entries" placeholder="Search entries…" /><select aria-label="Status"><option>All statuses</option><option>Draft</option><option>Published</option></select><select aria-label="Locale"><option>All locales</option><option>English</option><option>Vietnamese</option></select></div><div className="table-wrap"><table><thead><tr><th>Title</th><th>Model</th><th>Status</th><th>Locale</th><th>Version</th><th>Updated</th></tr></thead><tbody>{entries.map((entry) => <tr key={entry.id}><td><Link className="entry-title" href={`/admin/entries/${entry.id}`}>{String(entry.data.title ?? entry.id)}</Link><small>/{String(entry.data.slug ?? "")}</small></td><td>{entry.model}</td><td><StatusPill status={entry.status} /></td><td>{entry.locale.toUpperCase()}</td><td>v{entry.version}</td><td>{new Date(entry.updatedAt).toLocaleString("en-GB")}</td></tr>)}</tbody></table></div></article>;
}

async function Audit() {
  const audit = await listAudit();
  return <article className="panel"><div className="table-wrap"><table><thead><tr><th>Action</th><th>Entity</th><th>Actor</th><th>Timestamp</th></tr></thead><tbody>{audit.map((event) => <tr key={event.id}><td>{event.action}</td><td>{event.entity}</td><td>{event.actor}</td><td>{new Date(event.createdAt).toLocaleString("en-GB")}</td></tr>)}</tbody></table></div></article>;
}

function ApiKeys() {
  return <article className="panel"><div className="table-wrap"><table><thead><tr><th>Name</th><th>Prefix</th><th>Scope</th><th>Last used</th></tr></thead><tbody><tr><td><strong>Production website</strong><small>Created by Hưng</small></td><td><code>tc_live_9d2…</code></td><td>content:read</td><td>4 minutes ago</td></tr><tr><td><strong>Preview environment</strong><small>Created by Hưng</small></td><td><code>tc_test_3a8…</code></td><td>content:read, preview:read</td><td>Yesterday</td></tr></tbody></table></div></article>;
}

function Team() {
  return <article className="panel"><div className="table-wrap"><table><thead><tr><th>Member</th><th>Role</th><th>Status</th></tr></thead><tbody><tr><td><strong>Hưng</strong><small>hung@tony.local</small></td><td>Owner</td><td><StatusPill status="published" /></td></tr></tbody></table></div></article>;
}

function Settings() {
  return <article className="panel settings-form"><label>Project name<input defaultValue="Website" /></label><label>Default locale<select defaultValue="en"><option value="en">English</option><option value="vi">Vietnamese</option></select></label><label>Delivery API base URL<input readOnly value="/api/v1/content" /></label><button className="button primary">Save settings</button></article>;
}
