export type SourceUrlKind = "wiki" | "drive-folder" | "document";

export interface ParsedSourceUrl {
  kind: SourceUrlKind;
  url: string;
  token: string;
  objectType: string;
}

const DOCUMENT_PATH_TYPES: Record<string, string> = {
  doc: "doc",
  docs: "doc",
  docx: "docx",
  sheets: "sheet",
  sheet: "sheet",
  base: "bitable",
  bitable: "bitable",
  mindnotes: "mindnote",
  mindnote: "mindnote",
  slides: "slides",
  file: "file",
};

export function parseSourceUrl(input: string): ParsedSourceUrl {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("A Feishu or Lark URL is required.");
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("Enter a complete https:// Feishu or Lark URL.");
  }
  if (parsed.protocol !== "https:") {
    throw new Error("Only https:// Feishu or Lark URLs are supported.");
  }

  const nestedUrl = parsed.searchParams.get("url");
  if (nestedUrl && parsed.pathname.includes("/client/docs/open")) {
    return parseSourceUrl(nestedUrl);
  }

  const segments = parsed.pathname.split("/").filter(Boolean);
  const wikiIndex = segments.indexOf("wiki");
  if (wikiIndex >= 0 && segments[wikiIndex + 1]) {
    return {
      kind: "wiki",
      url: trimmed,
      token: segments[wikiIndex + 1],
      objectType: "wiki",
    };
  }

  const driveIndex = segments.indexOf("drive");
  if (
    driveIndex >= 0 &&
    segments[driveIndex + 1] === "folder" &&
    segments[driveIndex + 2]
  ) {
    return {
      kind: "drive-folder",
      url: trimmed,
      token: segments[driveIndex + 2],
      objectType: "folder",
    };
  }

  const folderIndex = segments.indexOf("folder");
  if (folderIndex >= 0 && segments[folderIndex + 1]) {
    return {
      kind: "drive-folder",
      url: trimmed,
      token: segments[folderIndex + 1],
      objectType: "folder",
    };
  }

  for (const [pathType, objectType] of Object.entries(DOCUMENT_PATH_TYPES)) {
    const typeIndex = segments.indexOf(pathType);
    if (typeIndex >= 0 && segments[typeIndex + 1]) {
      return {
        kind: "document",
        url: trimmed,
        token: segments[typeIndex + 1],
        objectType,
      };
    }
  }

  throw new Error(
    "This link is not a supported Wiki, Drive folder, or document URL.",
  );
}
