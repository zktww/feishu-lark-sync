import { fromMarkdown } from "mdast-util-from-markdown";
import { randomUUID } from "node:crypto";
import { stripControlCharacters } from "../safety";

export type MediaKind = "image" | "attachment";

export interface MediaReference {
  kind: MediaKind;
  url: string;
  name?: string;
  index: number;
}

export type MediaLocalizer = (
  reference: MediaReference,
) => Promise<string | undefined>;

export async function normalizeFeishuMarkdown(
  input: string,
  localizeMedia: MediaLocalizer,
): Promise<string> {
  let markdown = input.replace(/\r\n?/g, "\n").trim();
  // Parse Markdown first: markup inside examples must never become a download
  // or be transformed as exported Feishu HTML.
  const originals: string[] = [];
  const prefix = `FEISHUCODE${randomUUID().replace(/-/g, "")}X`;
  const ranges: Array<{ start: number; end: number }> = [];
  const visit = (
    node:
      | ReturnType<typeof fromMarkdown>
      | ReturnType<typeof fromMarkdown>["children"][number],
  ): void => {
    if (node.type === "code" || node.type === "inlineCode") {
      if (
        node.position?.start.offset !== undefined &&
        node.position.end.offset !== undefined
      ) {
        ranges.push({
          start: node.position.start.offset,
          end: node.position.end.offset,
        });
      }
    } else if ("children" in node) {
      for (const child of node.children) visit(child);
    }
  };
  visit(fromMarkdown(markdown));
  for (const range of ranges.sort((a, b) => b.start - a.start)) {
    const index = originals.push(markdown.slice(range.start, range.end)) - 1;
    markdown =
      markdown.slice(0, range.start) +
      `${prefix}${index}END` +
      markdown.slice(range.end);
  }
  let mediaIndex = 0;

  markdown = await replaceAsync(
    markdown,
    /!\[([^\]]*)\]\((https:\/\/[^)\s]+)\)/g,
    async (_match, alt: string, url: string) => {
      const localPath = await localizeMedia({
        kind: "image",
        url,
        name: alt || undefined,
        index: mediaIndex++,
      });
      return localPath ? `![[${localPath}]]` : `![${alt}](${url})`;
    },
  );

  markdown = await replaceAsync(
    markdown,
    /<img\b([^>]*)\/?>(?:<\/img>)?/gi,
    async (match, rawAttributes: string) => {
      const attributes = parseAttributes(rawAttributes);
      const url = attributes.url;
      if (!url) {
        return match;
      }
      const localPath = await localizeMedia({
        kind: "image",
        url,
        name: attributes.alt,
        index: mediaIndex++,
      });
      return localPath
        ? `![[${localPath}]]`
        : remoteLink(url, attributes.alt ?? "image", true);
    },
  );

  markdown = await replaceAsync(
    markdown,
    /<source\b([^>]*)\/?>(?:<\/source>)?/gi,
    async (match, rawAttributes: string) => {
      const attributes = parseAttributes(rawAttributes);
      const url = attributes.url;
      if (!url) {
        return match;
      }
      const name = attributes.name || `attachment-${mediaIndex + 1}`;
      const localPath = await localizeMedia({
        kind: "attachment",
        url,
        name,
        index: mediaIndex++,
      });
      return localPath
        ? `[[${localPath}|${escapeWikilinkLabel(name)}]]`
        : remoteLink(url, name, false);
    },
  );

  markdown = markdown
    .replace(
      /<cite\b([^>]*)\/?>(?:<\/cite>)?/gi,
      (_match, rawAttributes: string) => {
        const attributes = parseAttributes(rawAttributes);
        const label =
          attributes["user-name"] ?? attributes.name ?? attributes.title;
        return label ? `@${label}` : "飞书引用";
      },
    )
    .replace(
      /<whiteboard\b[^>]*\/?>(?:<\/whiteboard>)?/gi,
      "> [!note] 飞书画板（请在原文中查看）",
    )
    .replace(
      /<chat_card\b([^>]*)\/?>(?:<\/chat_card>)?/gi,
      (_match, rawAttributes: string) => {
        const attributes = parseAttributes(rawAttributes);
        return `> [!info] 飞书群聊${attributes.name ? `：${attributes.name}` : ""}`;
      },
    )
    .replace(/<\/?(?:grid|column)\b[^>]*>/gi, "")
    .replace(/<p\b[^>]*>([\s\S]*?)<\/p>/gi, "$1\n")
    .replace(/<li\b[^>]*>([\s\S]*?)<\/li>/gi, "- $1\n")
    .replace(/<\/?ul\b[^>]*>/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  markdown = markdown.replace(
    new RegExp(`${prefix}(\\d+)END`, "g"),
    (_, index: string) => originals[Number(index)],
  );
  return `${markdown}\n`;
}

export function sanitizePathSegment(value: string): string {
  const sanitized = stripControlCharacters(value)
    .replace(/[\\/:*?"<>|#[\]]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/^\.+|\.+$/g, "")
    .trim();
  return sanitized || "Untitled";
}

export function sanitizeRelativePath(value: string): string {
  return value.split("/").filter(Boolean).map(sanitizePathSegment).join("/");
}

function parseAttributes(input: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  for (const match of input.matchAll(/([\w-]+)=(?:"([^"]*)"|'([^']*)')/g)) {
    attributes[match[1]] = decodeEntities(match[2] ?? match[3] ?? "");
  }
  return attributes;
}

function decodeEntities(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function escapeWikilinkLabel(value: string): string {
  return value.replace(/\|/g, "-").replace(/\]/g, "");
}

function remoteLink(url: string, name: string, image: boolean): string {
  try {
    if (new URL(url).protocol !== "https:") return "[Unsupported media URL]";
  } catch {
    return "[Invalid media URL]";
  }
  return `${image ? "!" : ""}[${name.replace(/[[\]\\]/g, "")}](<${url.replace(/</g, "%3C").replace(/>/g, "%3E")}>)`;
}

async function replaceAsync(
  input: string,
  pattern: RegExp,
  replacer: (match: string, ...groups: string[]) => Promise<string>,
): Promise<string> {
  const matches = [...input.matchAll(pattern)];
  if (matches.length === 0) {
    return input;
  }
  let output = "";
  let cursor = 0;
  for (const match of matches) {
    const index = match.index ?? 0;
    output += input.slice(cursor, index);
    output += await replacer(match[0], ...match.slice(1));
    cursor = index + match[0].length;
  }
  return output + input.slice(cursor);
}
