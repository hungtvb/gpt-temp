"use server";

import { revalidatePath } from "next/cache";
import { demoActor } from "@/lib/cms";
import { assertCan } from "@/lib/cms";
import { transitionEntry } from "@/lib/cms";
import { entryInputSchema } from "@/lib/cms";
import { getEntry, replaceEntry, updateEntry } from "@/lib/cms";

export async function saveEntryAction(formData: FormData): Promise<void> {
  assertCan(demoActor.role, "entry:write");
  const id = String(formData.get("id") ?? "");
  const parsed = entryInputSchema.parse({
    title: formData.get("title"),
    slug: formData.get("slug"),
    excerpt: formData.get("excerpt") || undefined,
    body: formData.get("body"),
    featured: formData.get("featured") === "on",
  });
  await updateEntry(id, parsed);
  revalidatePath(`/admin/entries/${id}`);
  revalidatePath("/admin/entries");
}

export async function publishEntryAction(formData: FormData): Promise<void> {
  assertCan(demoActor.role, "entry:publish");
  const id = String(formData.get("id") ?? "");
  const entry = await getEntry(id);
  if (!entry) throw new Error("Entry not found");
  await replaceEntry(transitionEntry(entry, "published"));
  revalidatePath(`/admin/entries/${id}`);
  revalidatePath("/admin/entries");
}

export async function unpublishEntryAction(formData: FormData): Promise<void> {
  assertCan(demoActor.role, "entry:publish");
  const id = String(formData.get("id") ?? "");
  const entry = await getEntry(id);
  if (!entry) throw new Error("Entry not found");
  await replaceEntry(transitionEntry(entry, "draft"));
  revalidatePath(`/admin/entries/${id}`);
  revalidatePath("/admin/entries");
}
