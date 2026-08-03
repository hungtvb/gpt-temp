import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Eye, History, Save } from "lucide-react";
import { PageHeader, StatusPill } from "@/components/admin";
import { getEntry } from "@/lib/cms";
import { publishEntryAction, saveEntryAction, unpublishEntryAction } from "../../actions";

export default async function EntryEditorPage({ params }: { params: Promise<{ entryId: string }> }) {
  const { entryId } = await params;
  const entry = (await getEntry(entryId)) ?? notFound();

  return (
    <>
      <Link href="/admin/entries" className="back-link"><ArrowLeft size={15} /> Back to entries</Link>
      <PageHeader title={String(entry.data.title)} description={`${entry.model} · ${entry.locale.toUpperCase()} · Version ${entry.version}`} action={<div className="header-actions"><button className="button"><Eye size={15} /> Preview</button>{entry.status === "published" ? <form action={unpublishEntryAction}><input type="hidden" name="id" value={entry.id} /><button className="button">Unpublish</button></form> : <form action={publishEntryAction}><input type="hidden" name="id" value={entry.id} /><button className="button primary">Publish</button></form>}</div>} />

      <div className="editor-grid">
        <form action={saveEntryAction} className="panel editor-form">
          <input type="hidden" name="id" value={entry.id} />
          <label>Title<input name="title" required maxLength={160} defaultValue={String(entry.data.title ?? "")} /></label>
          <label>Slug<div className="slug-input"><span>/</span><input name="slug" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" defaultValue={String(entry.data.slug ?? "")} /></div></label>
          <label>Excerpt<textarea name="excerpt" rows={3} maxLength={220} defaultValue={String(entry.data.excerpt ?? "")} /></label>
          <label>Body<textarea name="body" required rows={13} defaultValue={String(entry.data.body ?? "")} /></label>
          <label className="check-row"><input type="checkbox" name="featured" defaultChecked={Boolean(entry.data.featured)} /><span>Feature this entry</span></label>
          <div className="form-footer"><span>Changes are validated on the server.</span><button className="button primary" type="submit"><Save size={15} /> Save draft</button></div>
        </form>

        <aside className="editor-aside">
          <article className="panel meta-panel"><h2>Entry status</h2><div className="meta-row"><span>Status</span><StatusPill status={entry.status} /></div><div className="meta-row"><span>Updated by</span><strong>{entry.updatedBy}</strong></div><div className="meta-row"><span>Last updated</span><strong>{new Date(entry.updatedAt).toLocaleString("en-GB")}</strong></div>{entry.publishedAt ? <div className="meta-row"><span>Published</span><strong>{new Date(entry.publishedAt).toLocaleString("en-GB")}</strong></div> : null}</article>
          <article className="panel meta-panel"><h2><History size={17} /> Version history</h2><div className="history-item"><span>v{entry.version}</span><div><strong>Current version</strong><small>{entry.updatedBy}</small></div></div>{entry.version > 1 ? <div className="history-item"><span>v{entry.version - 1}</span><div><strong>Previous version</strong><small>Restorable snapshot</small></div></div> : null}</article>
        </aside>
      </div>
    </>
  );
}
