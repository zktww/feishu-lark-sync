import { beforeEach, expect, it, vi } from "vitest";
import { JSDOM } from "jsdom";
import { StatusView } from "../src/status-view";
import type FeishuLarkSyncPlugin from "../src/main";
import type { WorkspaceLeaf } from "obsidian";
import { migrateData } from "../src/state";

vi.mock("obsidian", () => ({
  getLanguage: () => "zh",
  TFile: class {},
  Notice: class {},
  ItemView: class {
    contentEl = document.createElement("div");
    app = {};
    constructor() {
      document.body.append(this.contentEl);
    }
  },
  Modal: class {
    contentEl = document.createElement("div");
    modalEl = this.contentEl;
    open() {
      document.body.append(this.contentEl);
    }
    close() {
      this.contentEl.remove();
    }
  },
  Setting: class {
    el: HTMLElement;
    constructor(parent: HTMLElement) {
      this.el = parent.createDiv();
    }
    setName(name: string) {
      this.el.createEl("label", { text: name });
      return this;
    }
    addDropdown(fn: (control: unknown) => void) {
      const select = this.el.createEl("select");
      const control = {
        addOption(value: string, text: string) {
          const option = document.createElement("option");
          option.value = value;
          option.textContent = text;
          select.append(option);
          return control;
        },
        setValue(value: string) {
          select.value = value;
          return control;
        },
        onChange(callback: (value: string) => void) {
          select.addEventListener("change", () => callback(select.value));
          return control;
        },
      };
      fn(control);
      return this;
    }
  },
}));

beforeEach(() => {
  const dom = new JSDOM("<!DOCTYPE html><body></body>");
  vi.stubGlobal("document", dom.window.document);
  const proto = dom.window.HTMLElement.prototype;
  Object.assign(proto, {
    createEl(
      this: HTMLElement,
      tag: string,
      options: { text?: string; cls?: string } = {},
    ) {
      const el = document.createElement(tag);
      if (options.text) el.textContent = options.text;
      if (options.cls) el.className = options.cls;
      this.append(el);
      return el;
    },
    createDiv(this: HTMLElement, options: { cls?: string } = {}) {
      return this.createEl("div", options);
    },
    createSpan(this: HTMLElement, options: { text?: string } = {}) {
      return this.createEl("span", options);
    },
    empty(this: HTMLElement) {
      this.replaceChildren();
    },
    addClass(this: HTMLElement, name: string) {
      this.classList.add(name);
    },
  });
});
function fixture() {
  const data = migrateData(null);
  let changed = () => {};
  const plugin = {
    settings: data.settings,
    documents: data.documents,
    history: [
      {
        sources: 1,
        discovered: 2,
        created: 1,
        updated: 0,
        unchanged: 0,
        conflicts: 0,
        inaccessible: 1,
        skippedUnsupported: 0,
        failedSources: 0,
        errors: ["read failed"],
        results: [
          {
            sourceId: "s",
            title: '<img src="x" onerror="evil()">',
            action: "failed",
          },
          { sourceId: "s", title: "Created note", action: "created" },
        ],
      },
    ],
    progress: { phase: "syncing", completed: 1, total: 2, title: "One" },
    busy: false,
    recoveryError: undefined as string | undefined,
    subscribe: (fn: () => void) => {
      changed = fn;
      return () => {};
    },
    synchronizeWithNotice: vi.fn(async () => {}),
    retryFailed: vi.fn(async () => {}),
    cancel: vi.fn(),
    restoreState: vi.fn(async () => {}),
  };
  const view = new StatusView(
    {} as WorkspaceLeaf,
    plugin as unknown as FeishuLarkSyncPlugin,
  );
  return { view, plugin, changed: () => changed() };
}
it("renders Chinese status and untrusted titles as text, and retries the selected run", async () => {
  const f = fixture();
  await f.view.onOpen();
  expect(document.body.textContent).toContain("飞书同步中心");
  expect(document.body.querySelector("img")).toBeNull();
  const retry = [...document.querySelectorAll("button")].find(
    (b) => b.textContent === "仅重试失败项",
  )!;
  retry.click();
  await vi.waitFor(() =>
    expect(f.plugin.retryFailed).toHaveBeenCalledWith(f.plugin.history[0]),
  );
  const filter = document.querySelectorAll("select")[1];
  filter.value = "failed";
  filter.dispatchEvent(new document.defaultView!.Event("change"));
  expect(document.body.textContent).not.toContain("Created note");
});
it("disables new work during a run, shows progress and permits cancellation", async () => {
  const f = fixture();
  f.plugin.busy = true;
  await f.view.onOpen();
  const sync = [...document.querySelectorAll("button")].find(
    (b) => b.textContent === "立即同步",
  )!;
  expect(sync.disabled).toBe(true);
  expect(document.querySelector("progress")?.value).toBe(1);
  [...document.querySelectorAll("button")]
    .find((b) => b.textContent === "取消任务")!
    .click();
  await vi.waitFor(() => expect(f.plugin.cancel).toHaveBeenCalledTimes(1));
  f.plugin.busy = false;
  f.changed();
  expect(document.querySelector("progress")).toBeNull();
});
it("requires explicit confirmation before restoring state", async () => {
  const f = fixture();
  f.plugin.recoveryError = "状态损坏";
  await f.view.onOpen();
  expect(document.body.textContent).not.toContain("立即同步");
  document.querySelector("button")!.click();
  await vi.waitFor(() => expect(document.body.textContent).toContain("确认"));
  expect(f.plugin.restoreState).not.toHaveBeenCalled();
  [...document.querySelectorAll("button")]
    .find((b) => b.textContent === "确认")!
    .click();
  await vi.waitFor(() =>
    expect(f.plugin.restoreState).toHaveBeenCalledTimes(1),
  );
});
