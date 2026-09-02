import { createHash } from "node:crypto";
import { isMap, parseDocument } from "yaml";

export const MANAGED_START = "<!-- feishu-sync:start -->";
export const MANAGED_END = "<!-- feishu-sync:end -->";

export interface ManagedMetadata {
  token: string;
  sourceId: string;
  sourceUrl?: string;
  revision?: string;
  modifiedAt?: number;
}

export function managedContentHash(content: string): string {
  return createHash("sha256")
    .update(normalizeManagedBody(content))
    .digest("hex");
}

export function extractManagedBody(note: string): string | undefined {
  const start = note.indexOf(MANAGED_START);
  const end = note.indexOf(MANAGED_END, start + MANAGED_START.length);
  if (
    start < 0 ||
    end < 0 ||
    note.indexOf(MANAGED_START, start + MANAGED_START.length) >= 0 ||
    note.indexOf(MANAGED_END, end + MANAGED_END.length) >= 0
  ) {
    return undefined;
  }
  return normalizeManagedBody(note.slice(start + MANAGED_START.length, end));
}

export function noteBelongsToToken(note: string, token: string): boolean {
  try {
    const document = parseDocument(readFrontmatter(note));
    return document.errors.length === 0 && document.get("feishu_id") === token;
  } catch {
    return false;
  }
}

export function writeManagedNote(
  existing: string | undefined,
  metadata: ManagedMetadata,
  managedBody: string,
): string {
  if (managedBody.includes(MANAGED_START) || managedBody.includes(MANAGED_END))
    throw new Error(
      "Remote content contains reserved sync markers; note was not modified",
    );
  const frontmatter = updateFrontmatter(existing ?? "", metadata);
  const region = `${MANAGED_START}\n${normalizeManagedBody(managedBody)}\n${MANAGED_END}`;
  const body = stripFrontmatter(existing ?? "");
  const start = body.indexOf(MANAGED_START);
  const end = body.indexOf(MANAGED_END, start + MANAGED_START.length);

  if (start >= 0 && end >= 0) {
    const after = end + MANAGED_END.length;
    return (
      `${frontmatter}${body.slice(0, start)}${region}${body.slice(after)}`.trimEnd() +
      "\n"
    );
  }

  const preserved = body.trim();
  const localSection = preserved || "## 本地笔记\n\n";
  return `${frontmatter}${region}\n\n${localSection}`.trimEnd() + "\n";
}

function updateFrontmatter(note: string, metadata: ManagedMetadata): string {
  const document = parseDocument(readFrontmatter(note));
  if (
    document.errors.length ||
    (document.contents && !isMap(document.contents))
  ) {
    throw new Error(
      "Invalid YAML frontmatter; note was not modified / YAML 属性无效，未修改笔记",
    );
  }
  if (isMap(document.contents))
    for (const key of [
      "feishu_id",
      "feishu_source",
      "feishu_url",
      "feishu_revision",
      "feishu_modified_at",
      "feishu_managed",
    ])
      document.delete(key);
  document.set("feishu_id", metadata.token);
  document.set("feishu_source", metadata.sourceId);
  if (metadata.sourceUrl) document.set("feishu_url", metadata.sourceUrl);
  if (metadata.revision) document.set("feishu_revision", metadata.revision);
  if (metadata.modifiedAt !== undefined)
    document.set("feishu_modified_at", metadata.modifiedAt);
  document.set("feishu_managed", true);
  return `---\n${document.toString({ flowCollectionPadding: false })}---\n\n`;
}

function readFrontmatter(note: string): string {
  if (/^---\r?\n/.test(note) && !frontmatterPattern.test(note))
    throw new Error("Unclosed YAML frontmatter");
  return note.match(frontmatterPattern)?.[1] ?? "";
}

const frontmatterPattern = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;
function stripFrontmatter(note: string): string {
  return note.replace(frontmatterPattern, "").replace(/^\r?\n+/, "");
}

function normalizeManagedBody(content: string): string {
  return content.replace(/\r\n?/g, "\n").trim();
}
