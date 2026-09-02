import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { LarkCliClient } from "../src/lark-cli";
import { DEFAULT_SETTINGS } from "../src/types";

const mocks = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock("node:child_process", () => ({ spawn: mocks.spawn }));
let responses: Array<{
  stdout?: string;
  stderr?: string;
  code?: number;
  hang?: boolean;
}>;
let killed: string[];
beforeEach(() => {
  responses = [];
  killed = [];
  mocks.spawn.mockReset();
  mocks.spawn.mockImplementation(() => {
    const child = new EventEmitter() as EventEmitter & {
      stdout: PassThrough;
      stderr: PassThrough;
      stdin: PassThrough;
      kill: (signal: string) => void;
    };
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.stdin = new PassThrough();
    child.kill = (signal) => {
      killed.push(signal);
      queueMicrotask(() => child.emit("close", null));
    };
    const response = responses.shift() ?? {};
    child.stdin.on("finish", () => {
      if (!response.hang)
        queueMicrotask(() => {
          child.stdout.write(response.stdout ?? "");
          child.stderr.write(response.stderr ?? "");
          child.emit("close", response.code ?? 0);
        });
    });
    return child;
  });
});
afterEach(() => vi.useRealTimers());
it.each([
  [
    {
      identity: "user",
      verified: false,
      identities: { user: { status: "authenticated", userName: "Test" } },
    },
    false,
  ],
  [
    {
      identity: "user",
      verified: true,
      identities: { user: { status: "authenticated", userName: "Test" } },
    },
    true,
  ],
  [
    { identity: "user", identities: { user: { status: "authenticated" } } },
    false,
  ],
  [{ identity: "bot", verified: true }, false],
])("requires verified user authorization: %j", async (response, expected) => {
  responses.push({ stdout: "1.0.0" }, { stdout: JSON.stringify(response) });
  const status = await new LarkCliClient(
    () => DEFAULT_SETTINGS,
  ).inspectConnection();
  expect(status.authenticated).toBe(expected);
  expect(mocks.spawn.mock.calls[1][1]).toContain("--verify");
  expect(mocks.spawn.mock.calls[1][2].shell).toBe(false);
});
it("cancels a running CLI and propagates AbortError", async () => {
  responses.push({ hang: true });
  const controller = new AbortController();
  const promise = new LarkCliClient(
    () => DEFAULT_SETTINGS,
    controller.signal,
  ).fetchDocumentMarkdown("doc1");
  controller.abort();
  await expect(promise).rejects.toMatchObject({ name: "AbortError" });
  expect(killed).toContain("SIGTERM");
});
it("times out a hung CLI and redacts CLI error payloads", async () => {
  vi.useFakeTimers();
  responses.push({ hang: true });
  const rejected = expect(
    new LarkCliClient(() => DEFAULT_SETTINGS).fetchDocumentMarkdown("doc1"),
  ).rejects.toThrow("timed out");
  await vi.advanceTimersByTimeAsync(30_000);
  await rejected;
  responses.push({
    code: 1,
    stderr: "access_token=private-value https://example.com/private",
  });
  try {
    await new LarkCliClient(() => DEFAULT_SETTINGS).fetchDocumentMarkdown(
      "doc1",
    );
    throw new Error("should reject");
  } catch (error) {
    expect(String(error)).not.toContain("private-value");
    expect(String(error)).not.toContain("https://");
  }
});
