import { afterEach, beforeEach, expect, it, vi } from "vitest";
import Plugin from "../src/main";
import { migrateData } from "../src/state";
import { abortError } from "../src/safety";

const mock = vi.hoisted(() => ({
  files: new Map<string, string>(),
  notes: new Map<string, string>(),
  fetch: vi.fn(),
  notice: vi.fn(),
  list: vi.fn(),
}));
vi.mock("obsidian", () => {
  class Adapter {
    getBasePath() {
      return "/test-vault";
    }
  }
  return {
    getLanguage: () => "zh",
    FileSystemAdapter: Adapter,
    Notice: class {
      constructor(text: string) {
        mock.notice(text);
      }
    },
    Plugin: class {
      app = {
        vault: { adapter: new Adapter(), configDir: ".obsidian" },
        workspace: { onLayoutReady: () => {} },
      };
      manifest = { id: "feishu-lark-sync" };
      addSettingTab() {}
      addRibbonIcon() {}
      addCommand() {}
      registerView() {}
    },
  };
});
vi.mock("../src/settings", () => ({ FeishuLarkSyncSettingTab: class {} }));
vi.mock("../src/status-view", () => ({
  StatusView: class {},
  STATUS_VIEW: "status",
}));
vi.mock("../src/state", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/state")>()),
  fileStateIO: () => ({
    read: async (name: string) => mock.files.get(name),
    writeAtomic: async (name: string, text: string) => {
      mock.files.set(name, text);
    },
  }),
}));
vi.mock("../src/vault/obsidian-store", () => ({
  ObsidianVaultStore: class {
    exists(path: string) {
      return mock.notes.has(path);
    }
    async read(path: string) {
      return mock.notes.get(path);
    }
    async process(path: string, update: (s: string | undefined) => string) {
      mock.notes.set(path, update(mock.notes.get(path)));
    }
  },
}));
vi.mock("../src/lark-cli", () => ({
  LarkCliClient: class {
    constructor(
      readonly settings: () => unknown,
      readonly signal: AbortSignal,
    ) {}
    async listDriveFolderPage() {
      return mock.list();
    }
    async fetchDocumentMarkdown(token: string) {
      return mock.fetch(token, this.signal, this.settings());
    }
  },
}));

beforeEach(() => {
  vi.useFakeTimers();
  mock.files.clear();
  mock.notes.clear();
  mock.notice.mockReset();
  mock.fetch.mockReset();
  mock.list.mockReset();
  const data = migrateData(null);
  data.settings.scheduleMinutes = 15;
  data.settings.sources = [
    {
      id: "s",
      name: "Source",
      type: "drive-folder",
      remoteId: "folder",
      rootNodeToken: "",
      targetFolder: "Feishu",
      enabled: true,
    },
  ];
  mock.files.set("data.json", JSON.stringify(data));
  mock.list.mockResolvedValue({
    items: [{ token: "doc1", name: "One", type: "docx", modifiedAt: 1 }],
    hasMore: false,
  });
  mock.fetch.mockResolvedValue({
    token: "doc1",
    revision: "1",
    markdown: "Body",
  });
});
afterEach(() => vi.useRealTimers());
it("arms and stops scheduling when a source is enabled or disabled", async () => {
  const data = migrateData(JSON.parse(mock.files.get("data.json")!));
  data.settings.sources[0].enabled = false;
  mock.files.set("data.json", JSON.stringify(data));
  const p = new Plugin({} as never, {} as never);
  await p.onload();
  expect(p.nextRunAt).toBeUndefined();
  p.settings.sources[0].enabled = true;
  await p.savePluginData();
  expect(p.nextRunAt).toBe(Date.now() + 15 * 60_000);
  p.settings.sources[0].enabled = false;
  await p.savePluginData();
  expect(p.nextRunAt).toBeUndefined();
  p.onunload();
});
it("persists completed history and stays quiet for an unchanged scheduled run", async () => {
  const p = new Plugin({} as never, {} as never);
  await p.onload();
  await p.synchronize();
  expect(p.history.at(-1)?.created).toBe(1);
  expect(p.lastSuccessAt).toBeTruthy();
  mock.notice.mockClear();
  await p.synchronizeWithNotice("scheduled");
  expect(mock.notice).not.toHaveBeenCalled();
  expect(p.history.at(-1)?.unchanged).toBe(1);
  expect(JSON.parse(mock.files.get("data.json")!).history).toHaveLength(2);
  expect(p.nextRunAt).toBe(Date.now() + 15 * 60_000);
  p.onunload();
});
it("aborts in-flight work on unload, rejects concurrent runs and never schedules afterward", async () => {
  const p = new Plugin({} as never, {} as never);
  await p.onload();
  let entered!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  mock.fetch.mockImplementation(
    (_token: string, signal: AbortSignal) =>
      new Promise((_resolve, reject) => {
        entered();
        signal.addEventListener("abort", () => reject(abortError()), {
          once: true,
        });
      }),
  );
  const running = p.synchronize();
  await started;
  await expect(p.synchronize()).rejects.toThrow("已有任务");
  p.onunload();
  const report = await running;
  expect(report.cancelled).toBe(true);
  expect(mock.notes.size).toBe(0);
  expect(p.nextRunAt).toBeUndefined();
  await vi.advanceTimersByTimeAsync(120 * 60_000);
  expect(mock.fetch).toHaveBeenCalledTimes(1);
});
it("fails closed on damaged state without resetting settings or writing notes", async () => {
  mock.files.set("data.json", "damaged");
  const p = new Plugin({} as never, {} as never);
  await p.onload();
  expect(p.recoveryError).toBeTruthy();
  await expect(p.synchronize()).rejects.toThrow();
  expect(mock.files.get("data.json")).toBe("damaged");
  expect(mock.notes.size).toBe(0);
  expect(p.nextRunAt).toBeUndefined();
  p.onunload();
});
