import { z } from "zod";

export type Role = "owner" | "admin" | "editor" | "author" | "viewer";
export type EntryStatus = "draft" | "published" | "archived";
export type FieldType = "text" | "richText" | "number" | "boolean" | "date" | "media" | "relation" | "json" | "slug";

export interface Actor { id: string; name: string; email: string; role: Role }
export interface ContentField {
  id: string; key: string; label: string; type: FieldType; required?: boolean; unique?: boolean;
  defaultValue?: unknown; validation?: { min?: number; max?: number; pattern?: string };
}
export interface ContentModel {
  id: string; name: string; slug: string; description: string; fields: ContentField[];
  entriesCount: number; updatedAt: string;
}
export interface ContentEntry {
  id: string; model: string; locale: string; status: EntryStatus; version: number;
  data: Record<string, unknown>; createdAt: string; updatedAt: string; publishedAt?: string; updatedBy: string;
}
export interface AuditEvent { id: string; action: string; entity: string; actor: string; createdAt: string }

export const demoActor: Actor = { id: "usr_hung", name: "Hưng", email: "hung@tony.local", role: "owner" };

const seededModels: ContentModel[] = [
  {
    id: "mdl_article", name: "Article", slug: "articles",
    description: "Editorial content with cover, summary, body and author.", entriesCount: 18,
    updatedAt: "2026-08-03T00:40:00.000Z",
    fields: [
      { id: "fld_title", key: "title", label: "Title", type: "text", required: true },
      { id: "fld_slug", key: "slug", label: "Slug", type: "slug", required: true, unique: true },
      { id: "fld_excerpt", key: "excerpt", label: "Excerpt", type: "text", validation: { max: 220 } },
      { id: "fld_body", key: "body", label: "Body", type: "richText", required: true },
      { id: "fld_cover", key: "cover", label: "Cover", type: "media" },
      { id: "fld_featured", key: "featured", label: "Featured", type: "boolean", defaultValue: false },
    ],
  },
  {
    id: "mdl_author", name: "Author", slug: "authors",
    description: "People who create and maintain editorial content.", entriesCount: 5,
    updatedAt: "2026-08-02T11:10:00.000Z",
    fields: [
      { id: "fld_name", key: "name", label: "Name", type: "text", required: true },
      { id: "fld_bio", key: "bio", label: "Bio", type: "richText" },
      { id: "fld_avatar", key: "avatar", label: "Avatar", type: "media" },
    ],
  },
  {
    id: "mdl_page", name: "Landing page", slug: "pages",
    description: "Structured landing pages composed from reusable sections.", entriesCount: 7,
    updatedAt: "2026-08-01T09:00:00.000Z",
    fields: [
      { id: "fld_page_title", key: "title", label: "Title", type: "text", required: true },
      { id: "fld_page_slug", key: "slug", label: "Slug", type: "slug", required: true, unique: true },
      { id: "fld_sections", key: "sections", label: "Sections", type: "json", required: true },
    ],
  },
];

export const seededEntries: ContentEntry[] = [
  {
    id: "ent_001", model: "articles", locale: "en", status: "published", version: 4,
    data: { title: "Designing content APIs that age well", slug: "designing-content-apis-that-age-well", excerpt: "Stable contracts, explicit lifecycle rules and predictable delivery APIs.", body: "A content API should evolve without surprising consumers.", featured: true },
    createdAt: "2026-07-25T03:00:00.000Z", updatedAt: "2026-08-03T00:20:00.000Z", publishedAt: "2026-08-03T00:22:00.000Z", updatedBy: "Hưng",
  },
  {
    id: "ent_002", model: "articles", locale: "en", status: "draft", version: 2,
    data: { title: "Tony CMS architecture notes", slug: "tony-cms-architecture-notes", excerpt: "Why the first release separates domain rules from persistence.", body: "The MVP starts with a replaceable repository interface.", featured: false },
    createdAt: "2026-08-02T07:12:00.000Z", updatedAt: "2026-08-03T00:31:00.000Z", updatedBy: "Hưng",
  },
  {
    id: "ent_003", model: "articles", locale: "vi", status: "published", version: 3,
    data: { title: "Quản trị nội dung không nên làm chậm đội phát triển", slug: "quan-tri-noi-dung-khong-nen-lam-cham-doi-phat-trien", excerpt: "Mô hình nội dung rõ ràng giúp editor và developer cùng tiến nhanh hơn.", body: "Tony CMS tập trung vào schema rõ ràng và API dễ dự đoán.", featured: false },
    createdAt: "2026-07-29T05:30:00.000Z", updatedAt: "2026-08-02T15:00:00.000Z", publishedAt: "2026-08-02T15:05:00.000Z", updatedBy: "Hưng",
  },
  {
    id: "ent_004", model: "pages", locale: "en", status: "draft", version: 1,
    data: { title: "Product", slug: "product", sections: [{ type: "hero" }, { type: "features" }] },
    createdAt: "2026-08-01T10:00:00.000Z", updatedAt: "2026-08-01T10:00:00.000Z", updatedBy: "Hưng",
  },
];

const seededAudit: AuditEvent[] = [
  { id: "aud_1", action: "Published", entity: "Designing content APIs that age well", actor: "Hưng", createdAt: "2026-08-03T00:22:00.000Z" },
  { id: "aud_2", action: "Updated model", entity: "Article", actor: "Hưng", createdAt: "2026-08-03T00:05:00.000Z" },
  { id: "aud_3", action: "Created API key", entity: "Production website", actor: "Hưng", createdAt: "2026-08-02T13:40:00.000Z" },
];

export type Permission = "model:read" | "model:write" | "entry:read" | "entry:write" | "entry:publish" | "media:write" | "team:manage" | "settings:manage";
const grants: Record<Role, ReadonlySet<Permission>> = {
  owner: new Set(["model:read", "model:write", "entry:read", "entry:write", "entry:publish", "media:write", "team:manage", "settings:manage"]),
  admin: new Set(["model:read", "model:write", "entry:read", "entry:write", "entry:publish", "media:write", "team:manage", "settings:manage"]),
  editor: new Set(["model:read", "entry:read", "entry:write", "entry:publish", "media:write"]),
  author: new Set(["model:read", "entry:read", "entry:write", "media:write"]),
  viewer: new Set(["model:read", "entry:read"]),
};
export const can = (role: Role, permission: Permission) => grants[role].has(permission);
export function assertCan(role: Role, permission: Permission): void {
  if (!can(role, permission)) throw new Error(`Role ${role} cannot perform ${permission}`);
}

const transitions: Record<EntryStatus, ReadonlySet<EntryStatus>> = {
  draft: new Set(["published", "archived"]), published: new Set(["draft", "archived"]), archived: new Set(["draft"]),
};
export const canTransition = (from: EntryStatus, to: EntryStatus) => from === to || transitions[from].has(to);
export function transitionEntry(entry: ContentEntry, to: EntryStatus, now = new Date()): ContentEntry {
  if (!canTransition(entry.status, to)) throw new Error(`Invalid transition: ${entry.status} -> ${to}`);
  return { ...entry, status: to, version: entry.version + (entry.status === to ? 0 : 1), updatedAt: now.toISOString(), publishedAt: to === "published" ? now.toISOString() : entry.publishedAt };
}

export const entryInputSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(160),
  slug: z.string().trim().min(1).max(180).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase kebab-case"),
  excerpt: z.string().trim().max(220).optional(), body: z.string().trim().min(1, "Body is required"),
  featured: z.boolean().optional().default(false),
});
export function validateModel(model: ContentModel): string[] {
  const errors: string[] = []; const keys = new Set<string>();
  if (!model.name.trim()) errors.push("Model name is required");
  if (!/^[a-z][a-z0-9-]*$/.test(model.slug)) errors.push("Model slug must be lowercase kebab-case");
  for (const field of model.fields) {
    if (!/^[a-z][a-zA-Z0-9_]*$/.test(field.key)) errors.push(`Invalid field key: ${field.key}`);
    if (keys.has(field.key)) errors.push(`Duplicate field key: ${field.key}`);
    keys.add(field.key);
  }
  return errors;
}

interface DemoStore { entries: ContentEntry[]; models: ContentModel[]; audit: AuditEvent[] }
declare global { var __tonyCmsStore: DemoStore | undefined }
const clone = <T,>(value: T): T => structuredClone(value);
function getStore(): DemoStore {
  globalThis.__tonyCmsStore ??= { entries: clone(seededEntries), models: clone(seededModels), audit: clone(seededAudit) };
  return globalThis.__tonyCmsStore;
}
export async function listModels() { return clone(getStore().models); }
export async function listEntries(model?: string) {
  const items = model ? getStore().entries.filter((entry) => entry.model === model) : [...getStore().entries];
  return clone(items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
}
export async function getEntry(id: string) { return clone(getStore().entries.find((entry) => entry.id === id)); }
export async function updateEntry(id: string, data: Record<string, unknown>) {
  const store = getStore(); const index = store.entries.findIndex((entry) => entry.id === id);
  if (index < 0) throw new Error("Entry not found");
  store.entries[index] = { ...store.entries[index], data: { ...store.entries[index].data, ...data }, version: store.entries[index].version + 1, updatedAt: new Date().toISOString(), updatedBy: demoActor.name };
  return clone(store.entries[index]);
}
export async function replaceEntry(entry: ContentEntry) {
  const store = getStore(); const index = store.entries.findIndex((item) => item.id === entry.id);
  if (index < 0) throw new Error("Entry not found"); store.entries[index] = clone(entry);
}
export async function listAudit() { return clone(getStore().audit); }

export function queryPublishedEntries(entries: ContentEntry[], query: { model: string; locale?: string; limit?: number }) {
  const limit = Math.min(Math.max(query.limit ?? 20, 1), 100);
  return entries.filter((entry) => entry.model === query.model && entry.status === "published")
    .filter((entry) => !query.locale || entry.locale === query.locale)
    .sort((a, b) => (b.publishedAt ?? b.updatedAt).localeCompare(a.publishedAt ?? a.updatedAt)).slice(0, limit);
}
