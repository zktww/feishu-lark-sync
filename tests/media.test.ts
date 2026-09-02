import { describe, expect, it } from "vitest";
import {
  allowedMediaUrl,
  isPublicIPv4,
  mediaExtension,
} from "../src/vault/media";
import { safeError } from "../src/safety";
describe("media and diagnostics safety", () => {
  it.each([
    "http://cdn.feishu.cn/a",
    "https://cdn.feishu.cn.evil.test/a",
    "https://127.0.0.1/a",
    "https://user:pass@cdn.feishu.cn/a",
    "https://cdn.feishu.cn:444/a",
  ])("blocks unsafe media URL %s", (url) => {
    expect(() => allowedMediaUrl(url)).toThrow();
  });
  it("allows explicit trusted CDN domains and their subdomains", () => {
    expect(allowedMediaUrl("https://cdn.feishu.cn/a").hostname).toBe(
      "cdn.feishu.cn",
    );
    expect(
      allowedMediaUrl("https://cdn.example.com/a", ["example.com"]).hostname,
    ).toBe("cdn.example.com");
  });
  it.each([
    "127.0.0.1",
    "10.2.3.4",
    "169.254.169.254",
    "172.16.0.1",
    "192.168.2.1",
    "100.64.0.1",
    "::1",
    "::ffff:127.0.0.1",
  ])("blocks non-public IP %s", (ip) => expect(isPublicIPv4(ip)).toBe(false));
  it("validates image signatures and refuses HTML/JSON/SVG and executable attachments", () => {
    expect(
      mediaExtension(
        "image/png",
        Buffer.from("89504e470d0a1a0a", "hex"),
        "/wrong.jpg",
        "image",
      ),
    ).toBe(".png");
    for (const data of [
      "<html>login</html>",
      '{"error":true}',
      '<svg onload="alert(1)">',
      "MZexecutable",
    ])
      expect(() =>
        mediaExtension(
          "application/octet-stream",
          Buffer.from(data),
          "/image.png",
          "image",
        ),
      ).toThrow();
    expect(() =>
      mediaExtension(
        "image/png",
        Buffer.from("invalid"),
        "/image.png",
        "image",
      ),
    ).toThrow();
  });
  it("redacts bearer tokens, credentials, codes and signed URLs", () => {
    const result = safeError(
      'Bearer private-value app_secret="private-value" refresh_token=private-value device_code=private-value https://cdn.feishu.cn/a?signature=private-value',
    );
    expect(result).not.toContain("private-value");
    expect(result).not.toContain("https://");
  });
});
