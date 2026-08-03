import Link from "next/link";
import type { ReactNode } from "react";
import { Activity, Boxes, ChevronDown, FileText, FolderOpen, Gauge, KeyRound, Library, Search, Settings, Users, Webhook } from "lucide-react";
import { demoActor } from "@/lib/cms";

const navigation = [
  ["/admin", "Overview", Gauge], ["/admin/models", "Content models", Boxes], ["/admin/entries", "Entries", FileText],
  ["/admin/media", "Media", Library], ["/admin/api-keys", "API keys", KeyRound], ["/admin/webhooks", "Webhooks", Webhook],
  ["/admin/team", "Team", Users], ["/admin/audit", "Audit log", Activity], ["/admin/settings", "Settings", Settings],
] as const;

export function AdminShell({ children }: { children: ReactNode }) {
  return <div className="app-shell"><aside className="sidebar">
    <Link className="brand" href="/admin"><span className="brand-mark">T</span><span><strong>Tony CMS</strong><small>Headless content</small></span></Link>
    <button className="workspace-switcher" type="button"><span className="workspace-icon"><FolderOpen size={16} /></span><span><small>Workspace</small><strong>Tony Labs</strong></span><ChevronDown size={16} /></button>
    <nav>{navigation.map(([href, label, Icon]) => <Link href={href} key={href} className="nav-item"><Icon size={17} /><span>{label}</span></Link>)}</nav>
    <div className="sidebar-footer"><div className="user-avatar">H</div><div><strong>{demoActor.name}</strong><small>{demoActor.role}</small></div></div>
  </aside><main className="main-area"><header className="topbar"><button className="command" type="button"><Search size={16} /><span>Search content</span><kbd>⌘ K</kbd></button><div className="environment"><span /> Development</div></header><div className="page-container">{children}</div></main></div>;
}

export function PageHeader({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description: string; action?: ReactNode }) {
  return <div className="page-header"><div>{eyebrow ? <div className="eyebrow">{eyebrow}</div> : null}<h1>{title}</h1><p>{description}</p></div>{action ? <div>{action}</div> : null}</div>;
}
export const StatusPill = ({ status }: { status: string }) => <span className={`status status-${status}`}>{status}</span>;
export function EmptyState({ title, description }: { title: string; description: string }) {
  return <div className="empty-state"><div className="empty-icon">+</div><h2>{title}</h2><p>{description}</p><button className="button primary">Create first item</button></div>;
}
