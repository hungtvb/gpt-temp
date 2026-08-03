import { describe, expect, it } from "vitest";
import { can, canTransition, entryInputSchema, queryPublishedEntries, seededEntries, transitionEntry, validateModel, listModels } from "@/lib/cms";

describe("Tony CMS domain", () => {
  it("enforces role permissions", () => {
    expect(can("editor", "entry:publish")).toBe(true);
    expect(can("editor", "team:manage")).toBe(false);
    expect(can("author", "entry:publish")).toBe(false);
  });

  it("publishes drafts and rejects archived-to-published", () => {
    const draft = seededEntries.find((entry) => entry.status === "draft")!;
    const published = transitionEntry(draft, "published", new Date("2026-08-03T01:00:00.000Z"));
    expect(published.status).toBe("published");
    expect(published.version).toBe(draft.version + 1);
    expect(canTransition("archived", "published")).toBe(false);
  });

  it("validates models and entry slugs", async () => {
    expect(validateModel((await listModels())[0])).toEqual([]);
    expect(entryInputSchema.safeParse({ title: "Hello", slug: "Hello World", body: "Body" }).success).toBe(false);
  });

  it("delivers published localized content only", () => {
    const result = queryPublishedEntries(seededEntries, { model: "articles", locale: "vi", limit: 999 });
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe("published");
  });
});
