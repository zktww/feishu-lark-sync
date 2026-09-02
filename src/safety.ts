export function hasControlCharacters(value: string): boolean {
  return Array.from(value).some((char) => char.charCodeAt(0) < 32);
}

export function stripControlCharacters(
  value: string,
  keepWhitespace = false,
): string {
  return Array.from(value)
    .filter(
      (char) =>
        char.charCodeAt(0) >= 32 ||
        (keepWhitespace && ["\t", "\n", "\r"].includes(char)),
    )
    .join("");
}

export function safeError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return stripControlCharacters(raw, true)
    .replace(/https?:\/\/[^\s<>"']+/gi, "[URL redacted]")
    .replace(/\bBearer\s+[^\s,"'}]+/gi, "Bearer [redacted]")
    .replace(
      /((?:app[_-]?secret|(?:access|refresh)[_-]?token|api[_-]?key|device[_-]?code|authorization|cookie)["']?\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;}]+)/gi,
      "$1[redacted]",
    )
    .slice(0, 800);
}

export function abortError(): Error {
  const error = new Error("Cancelled / 已取消");
  error.name = "AbortError";
  return error;
}
export function checkAbort(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortError();
}
export function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}
export function vaultPath(path: string): string {
  if (
    !path ||
    path.startsWith("/") ||
    /^[A-Za-z]:/.test(path) ||
    path.includes("\\")
  )
    throw new Error("Invalid vault-relative path / 无效的知识库相对路径");
  const parts = path.split("/");
  if (
    parts.some(
      (p) =>
        !p ||
        p === "." ||
        p === ".." ||
        p.startsWith(".") ||
        hasControlCharacters(p),
    )
  )
    throw new Error("Unsafe vault path / 不安全的知识库路径");
  return path;
}
