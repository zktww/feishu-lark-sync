import { beforeEach, expect, it, vi } from "vitest";
import { JSDOM } from "jsdom";
import { FeishuLarkSyncSettingTab } from "../src/settings";
import { DEFAULT_SETTINGS } from "../src/types";

const runtime = vi.hoisted(() => ({ modern: false, update: vi.fn() }));
vi.mock("obsidian", () => {
  class Setting {
    constructor(parent) {
      this.settingEl = parent.createDiv();
    }
    setName(name) {
      this.settingEl.createEl("label", { text: name });
      return this;
    }
    setDesc(desc) {
      this.settingEl.createEl("p", { text: desc });
      return this;
    }
    setHeading() {
      this.settingEl.classList.add("setting-item-heading");
      return this;
    }
    addButton(fn) {
      return this.control("button", fn);
    }
    addText(fn) {
      return this.control("input", fn);
    }
    addDropdown(fn) {
      return this.control("select", fn);
    }
    addToggle(fn) {
      return this.control("input", fn);
    }
    control(tag, fn) {
      const el = this.settingEl.createEl(tag);
      const control = {
        inputEl: el,
        setValue(v) {
          el.value = String(v);
          return control;
        },
        getValue() {
          return el.value;
        },
        setPlaceholder(v) {
          el.placeholder = v;
          return control;
        },
        addOption(value, text) {
          const option = el.createEl("option", { text });
          option.value = value;
          return control;
        },
        onChange() {
          return control;
        },
        setButtonText(text) {
          el.textContent = text;
          return control;
        },
        setCta() {
          return control;
        },
        setDisabled(value) {
          el.disabled = value;
          return control;
        },
        onClick(fn) {
          el.addEventListener("click", fn);
          return control;
        },
      };
      fn(control);
      return this;
    }
  }
  return {
    App: class {},
    Notice: class {},
    Modal: class {},
    TextComponent: class {},
    getLanguage: () => "zh",
    requireApiVersion: () => runtime.modern,
    Setting,
    PluginSettingTab: class {
      containerEl = document.createElement("div");
      update() {
        runtime.update();
      }
    },
  };
});
beforeEach(() => {
  runtime.modern = false;
  runtime.update.mockClear();
  const dom = new JSDOM("<!doctype html><body></body>");
  vi.stubGlobal("document", dom.window.document);
  Object.assign(dom.window.HTMLElement.prototype, {
    createEl(tag, options = {}) {
      const el = document.createElement(tag);
      el.textContent = options.text ?? "";
      el.className = options.cls ?? "";
      this.append(el);
      return el;
    },
    createDiv(options) {
      return this.createEl("div", options);
    },
    empty() {
      this.replaceChildren();
    },
    addClass(name) {
      this.classList.add(name);
    },
  });
});
function fixture() {
  const plugin = {
    settings: structuredClone(DEFAULT_SETTINGS),
    checkConnection: vi.fn(async () => ({
      installed: true,
      authenticated: false,
    })),
    recoveryError: undefined,
    savePluginData: vi.fn(async () => {}),
  };
  return { plugin, tab: new FeishuLarkSyncSettingTab({}, plugin) };
}
it("renders all legacy settings in Chinese using native heading styles", () => {
  const { tab } = fixture();
  tab.display();
  expect(
    tab.containerEl.querySelectorAll(".setting-item-heading"),
  ).toHaveLength(4);
  expect(tab.containerEl.querySelector("h2,h3")).toBeNull();
  expect(tab.containerEl.textContent).toContain("打开同步中心");
  expect(
    tab.containerEl.querySelector('input[placeholder="lark-cli"]'),
  ).not.toBeNull();
});
it("provides searchable sections on 1.13+ and safely renders each", () => {
  const { tab } = fixture();
  const definitions = tab.getSettingDefinitions();
  expect(definitions).toHaveLength(5);
  expect(definitions.flatMap((s) => s.aliases)).toContain("授权");
  for (const section of definitions) {
    const settingEl = document.createElement("div");
    section.render({ settingEl });
    expect(settingEl.textContent.length).toBeGreaterThan(0);
    expect(settingEl.classList.contains("feishu-sync-settings-section")).toBe(
      true,
    );
  }
});
it.each([false, true])(
  "refreshes using the supported API (modern=%s)",
  async (modern) => {
    runtime.modern = modern;
    const { tab, plugin } = fixture();
    tab.display();
    const check = [...tab.containerEl.querySelectorAll("button")].find(
      (b) => b.textContent === "检查",
    );
    expect(check).toBeDefined();
    check.click();
    await vi.waitFor(() => expect(plugin.checkConnection).toHaveBeenCalled());
    expect(runtime.update).toHaveBeenCalledTimes(modern ? 1 : 0);
  },
);
it("recovery blocks configuration in both rendering paths", () => {
  const { tab, plugin } = fixture();
  plugin.recoveryError = "状态损坏";
  tab.display();
  expect(tab.containerEl.textContent).toContain("状态损坏");
  expect(tab.containerEl.querySelector("input")).toBeNull();
  expect(tab.getSettingDefinitions().map((d) => d.visible())).toEqual([
    true,
    false,
    false,
    false,
    false,
  ]);
});
