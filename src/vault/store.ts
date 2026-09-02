import { sanitizePathSegment } from "../transform/markdown";

export interface MediaOptions {
  signal?: AbortSignal;
  maxBytes?: number;
  extraHosts?: string[];
  kind?: "image" | "attachment";
}

export interface VaultStore {
  exists(path: string): boolean;
  read(path: string): Promise<string | undefined>;
  write(path: string, content: string): Promise<void>;
  process(
    path: string,
    update: (latest: string | undefined) => string,
  ): Promise<void>;
  backup(path: string, content: string): Promise<string>;
  saveRemoteMedia(
    url: string,
    desiredPath: string,
    options?: MediaOptions,
  ): Promise<string>;
}

export function attachmentFileName(name: string, fallback: string): string {
  const sanitized = sanitizePathSegment(name);
  return sanitized === "Untitled" ? fallback : sanitized;
}
