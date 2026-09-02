import * as timers from "node:timers";
import { request } from "node:https";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { extname } from "node:path";
import { abortError, checkAbort } from "../safety";
import type { MediaOptions } from "./store";

const HOSTS = [
  "feishu.cn",
  "larksuite.com",
  "feishu.net",
  "feishucdn.com",
  "byteimg.com",
  "larksuitecdn.com",
];
export function allowedMediaUrl(raw: string, extraHosts: string[] = []): URL {
  const url = new URL(raw);
  const hosts = [...HOSTS, ...extraHosts.map((h) => h.toLowerCase())];
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443") ||
    isIP(url.hostname) ||
    !hosts.some((h) => url.hostname === h || url.hostname.endsWith(`.${h}`))
  ) {
    throw new Error(
      `Media host blocked / 图片域名未在允许列表中: ${url.hostname}`,
    );
  }
  return url;
}
export function isPublicIPv4(address: string): boolean {
  if (isIP(address) !== 4) return false;
  const [a, b] = address.split(".").map(Number);
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 168 || b === 0)) ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 198 && (b === 18 || b === 19))
  );
}
export function mediaExtension(
  type: string,
  data: Buffer,
  pathname: string,
  kind?: MediaOptions["kind"],
): string {
  const head = data.subarray(0, 512).toString("utf8").trimStart().toLowerCase();
  if (
    !data.length ||
    type.includes("html") ||
    /^(?:<!doctype|<html|<\?xml|<svg|\{|\[)/.test(head)
  )
    throw new Error("Media response is empty or unsafe (HTML/JSON/SVG/XML)");
  const hex = data.subarray(0, 12).toString("hex");
  const image = hex.startsWith("89504e470d0a1a0a")
    ? ".png"
    : hex.startsWith("ffd8ff")
      ? ".jpg"
      : /^(474946383761|474946383961)/.test(hex)
        ? ".gif"
        : data.toString("ascii", 0, 4) === "RIFF" &&
            data.toString("ascii", 8, 12) === "WEBP"
          ? ".webp"
          : undefined;
  if (image) return image;
  if (kind === "image" || type.startsWith("image/"))
    throw new Error("Unsupported image format or invalid image data");
  if (head.startsWith("%pdf-")) return ".pdf";
  if (hex.startsWith("504b0304")) {
    const ext = extname(pathname).toLowerCase();
    return [".docx", ".xlsx", ".pptx"].includes(ext) ? ext : ".zip";
  }
  if (type === "text/plain" || type === "text/csv")
    return type === "text/csv" ? ".csv" : ".txt";
  throw new Error("Unsupported attachment type; original link retained");
}

export async function downloadMedia(
  raw: string,
  options: MediaOptions = {},
  redirects = 0,
): Promise<{ data: Buffer; extension: string }> {
  checkAbort(options.signal);
  const url = allowedMediaUrl(raw, options.extraHosts);
  if (redirects > 3) throw new Error("Too many media redirects");
  // Pin a validated public address to prevent DNS rebinding.
  const addresses = await new Promise<
    Array<{ address: string; family: number }>
  >((resolve, reject) => {
    const cancel = () => {
      cleanup();
      reject(abortError());
    };
    const timer = timers.setTimeout(() => {
      cleanup();
      reject(new Error("Media DNS lookup timed out"));
    }, 10_000);
    const cleanup = () => {
      timers.clearTimeout(timer);
      options.signal?.removeEventListener("abort", cancel);
    };
    options.signal?.addEventListener("abort", cancel, { once: true });
    if (options.signal?.aborted) {
      cancel();
      return;
    }
    void lookup(url.hostname, { all: true, family: 4 }).then(
      (result) => {
        cleanup();
        resolve(result);
      },
      (error) => {
        cleanup();
        reject(
          error instanceof Error ? error : new Error("Media DNS lookup failed"),
        );
      },
    );
  });
  checkAbort(options.signal);
  if (
    !addresses.length ||
    addresses.some((item) => !isPublicIPv4(item.address))
  )
    throw new Error("Private or invalid media address blocked");
  const max = options.maxBytes ?? 20 * 1024 * 1024;
  const response = await new Promise<{
    data: Buffer;
    type: string;
    redirect?: string;
  }>((resolve, reject) => {
    const req = request(
      url,
      {
        signal: options.signal,
        lookup: (_host, _options, callback) => {
          if (_options.all)
            callback(null, [{ address: addresses[0].address, family: 4 }]);
          else callback(null, addresses[0].address, 4);
        },
      },
      (res) => {
        if (
          res.statusCode &&
          [301, 302, 303, 307, 308].includes(res.statusCode) &&
          res.headers.location
        ) {
          const redirect = new URL(res.headers.location, url).href;
          res.destroy();
          resolve({ data: Buffer.alloc(0), type: "", redirect });
          return;
        }
        if (
          res.statusCode !== 200 ||
          Number(res.headers["content-length"] ?? 0) > max
        ) {
          res.destroy();
          reject(
            new Error("Media download rejected (HTTP status or size limit)"),
          );
          return;
        }
        const chunks: Buffer[] = [];
        let bytes = 0;
        res.on("data", (chunk: Buffer) => {
          bytes += chunk.length;
          if (bytes > max) {
            req.destroy(new Error("Media size limit exceeded"));
            return;
          }
          chunks.push(chunk);
        });
        res.on("error", reject);
        res.on("end", () =>
          resolve({
            data: Buffer.concat(chunks),
            type: String(res.headers["content-type"] ?? "")
              .split(";")[0]
              .toLowerCase(),
          }),
        );
      },
    );
    const timer = timers.setTimeout(
      () => req.destroy(new Error("Media download timed out")),
      30_000,
    );
    req.on("close", () => timers.clearTimeout(timer));
    req.on("error", (error) =>
      reject(options.signal?.aborted ? abortError() : error),
    );
    req.end();
  });
  checkAbort(options.signal);
  if (response.redirect)
    return downloadMedia(response.redirect, options, redirects + 1);
  return {
    data: response.data,
    extension: mediaExtension(
      response.type,
      response.data,
      url.pathname,
      options.kind,
    ),
  };
}
