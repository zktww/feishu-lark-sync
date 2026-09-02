import {
  App,
  ItemView,
  Modal,
  Notice,
  Setting,
  TFile,
  WorkspaceLeaf,
} from "obsidian";
import type FeishuLarkSyncPlugin from "./main";
import { ui } from "./i18n";
import type { SyncAction } from "./types";
import type { ConflictPreview } from "./sync/pull-synchronizer";
import { extractManagedBody } from "./vault/managed-note";
import { normalizeFeishuMarkdown } from "./transform/markdown";

export const STATUS_VIEW = "feishu-lark-sync-status";
const label = (action: string): string =>
  ({
    created: ui("新建", "Created"),
    updated: ui("更新", "Updated"),
    unchanged: ui("未变化", "Unchanged"),
    conflict: ui("冲突", "Conflict"),
    failed: ui("失败", "Failed"),
    unsupported: ui("暂不支持", "Unsupported"),
    "missing-local": ui("本地缺失", "Missing local"),
    paused: ui("已暂停", "Paused"),
    missing: ui("远端不可见", "Remote not visible"),
  })[action] ?? action;

function button(
  parent: HTMLElement,
  text: string,
  action: () => unknown,
  disabled = false,
): HTMLButtonElement {
  const el = parent.createEl("button", { text });
  el.disabled = disabled;
  el.addEventListener("click", () => {
    el.disabled = true;
    void Promise.resolve()
      .then(action)
      .catch(
        (error) =>
          new Notice(
            String(error instanceof Error ? error.message : error),
            10_000,
          ),
      )
      .finally(() => {
        el.disabled = disabled;
      });
  });
  return el;
}
export function confirmAction(
  app: App,
  message: string,
  action: () => Promise<unknown>,
): void {
  const modal = new Modal(app);
  modal.contentEl.createEl("p", { text: message });
  button(modal.contentEl, ui("取消", "Cancel"), () => modal.close());
  button(modal.contentEl, ui("确认", "Confirm"), async () => {
    await action();
    modal.close();
  });
  modal.open();
}
export class StatusView extends ItemView {
  private unsubscribe?: () => void;
  private reportIndex = -1;
  private filter = "all";
  private page = 0;
  constructor(
    leaf: WorkspaceLeaf,
    private readonly plugin: FeishuLarkSyncPlugin,
  ) {
    super(leaf);
  }
  getViewType(): string {
    return STATUS_VIEW;
  }
  getDisplayText(): string {
    return ui("飞书同步中心", "Feishu Sync Center");
  }
  getIcon(): string {
    return "refresh-cw";
  }
  async onOpen(): Promise<void> {
    this.unsubscribe = this.plugin.subscribe(() => this.render());
    this.render();
  }
  async onClose(): Promise<void> {
    this.unsubscribe?.();
  }
  private render(): void {
    const el = this.contentEl;
    el.empty();
    el.addClass("feishu-sync-center");
    el.createEl("h2", { text: this.getDisplayText() });
    const p = this.plugin;
    if (p.recoveryError) {
      el.createEl("p", { text: p.recoveryError, cls: "feishu-sync-error" });
      button(
        el,
        ui("从状态备份恢复", "Restore state backup"),
        () =>
          confirmAction(
            this.app,
            ui(
              "将保留当前损坏文件并恢复上一份状态备份。恢复后自动同步关闭，需要手动检查。",
              "Preserve the current file and restore the previous state backup. Automatic sync will be disabled.",
            ),
            () => p.restoreState(),
          ),
        p.busy,
      );
      return;
    }
    const date = (value?: string | number) =>
      value ? new Date(value).toLocaleString() : "—";
    el.createEl("p", {
      text: `${ui("上次成功", "Last success")}: ${date(p.lastSuccessAt)} · ${ui("下次计划", "Next scheduled")}: ${date(p.nextRunAt)}`,
    });
    el.createEl("p", {
      text: `${ui("配置", "Profile")}: ${p.settings.profileName} · ${p.connection?.userName ?? ui("尚未检查用户身份", "User not checked yet")}`,
    });
    const controls = el.createDiv({ cls: "feishu-sync-controls" });
    button(
      controls,
      ui("立即同步", "Sync now"),
      () => p.synchronizeWithNotice(),
      p.busy,
    );
    button(controls, ui("取消任务", "Cancel task"), () => p.cancel(), !p.busy);
    const selected =
      this.reportIndex < 0 ? p.history.at(-1) : p.history[this.reportIndex];
    const hasRetry = selected?.results?.some(
      (r) =>
        r.action === "failed" ||
        (r.token && p.documents[r.token]?.mediaIncomplete),
    );
    button(
      controls,
      ui("仅重试失败项", "Retry failed only"),
      () => p.retryFailed(selected),
      p.busy || !hasRetry,
    );
    if (p.busy) {
      const progress = p.progress;
      el.createEl("p", {
        text: `${progress.phase === "cancelling" ? ui("正在取消", "Cancelling") : progress.phase === "scanning" ? ui("正在扫描", "Scanning") : ui("正在处理", "Working")}: ${progress.completed}/${progress.total || "?"} ${progress.title ?? ""}`,
      });
      const bar = el.createEl("progress");
      bar.max = Math.max(1, progress.total);
      bar.value = progress.completed;
    }
    const attention = Object.values(p.documents).filter((s) =>
      ["conflict", "paused", "missing-local", "missing"].includes(s.status),
    );
    if (attention.length) {
      const details = el.createEl("details");
      details.open = true;
      details.createEl("summary", {
        text: `${ui("待处理文档", "Documents needing attention")} (${attention.length})`,
      });
      for (const state of attention) {
        const row = details.createDiv({ cls: "feishu-sync-row" });
        row.createEl("p", {
          text: `${label(state.status)} · ${state.remote?.title ?? state.localPath}`,
        });
        if (state.status !== "missing-local")
          button(row, ui("打开笔记", "Open note"), () =>
            this.openNote(state.localPath),
          );
        if (state.status === "conflict")
          button(
            row,
            ui("比较并处理", "Compare / resolve"),
            async () => {
              const preview = await p.previewConflict(state.token);
              new ConflictModal(this.app, p, preview).open();
            },
            p.busy,
          );
        if (state.status === "paused")
          button(
            row,
            ui("恢复为待处理冲突", "Resume conflict review"),
            () => p.resumeNote(state.token),
            p.busy,
          );
        if (state.status === "missing-local") {
          button(
            row,
            ui("恢复原路径笔记", "Restore at original path"),
            () =>
              confirmAction(
                this.app,
                ui(
                  "确认从远端恢复？如果笔记只是被移动了，请先用“关联已有笔记”避免产生副本。",
                  "Restore from remote? If the note was moved, relink it instead to avoid a duplicate.",
                ),
                () => p.restoreNote(state.token),
              ),
            p.busy,
          );
          button(
            row,
            ui("关联已有笔记", "Relink existing note"),
            () => new RelinkModal(this.app, p, state.token).open(),
            p.busy,
          );
        }
      }
    }
    el.createEl("h3", { text: ui("最近 10 次同步", "Last 10 runs") });
    if (!selected) {
      el.createEl("p", {
        text: ui("还没有同步记录。", "No sync history yet."),
      });
      return;
    }
    new Setting(el).setName(ui("运行记录", "Run")).addDropdown((d) => {
      d.addOption("-1", ui("最新", "Latest"));
      p.history.forEach((r, i) => {
        d.addOption(String(i), date(r.finishedAt ?? r.startedAt));
      });
      d.setValue(String(this.reportIndex)).onChange((v) => {
        this.reportIndex = Number(v);
        this.page = 0;
        this.render();
      });
    });
    el.createEl("p", {
      text: `${date(selected.finishedAt)} · ${ui("新建", "Created")} ${selected.created} / ${ui("更新", "Updated")} ${selected.updated} / ${ui("冲突", "Conflicts")} ${selected.conflicts}${selected.cancelled ? ui(" · 已取消", " · Cancelled") : ""}`,
    });
    new Setting(el)
      .setName(ui("结果筛选", "Filter results"))
      .addDropdown((d) => {
        d.addOption("all", ui("全部", "All"));
        for (const action of [
          "created",
          "updated",
          "unchanged",
          "conflict",
          "failed",
          "unsupported",
          "missing-local",
          "paused",
        ] satisfies SyncAction[])
          d.addOption(action, label(action));
        d.setValue(this.filter).onChange((v) => {
          this.filter = v;
          this.page = 0;
          this.render();
        });
      });
    const results = (selected.results ?? []).filter(
      (r) =>
        this.filter === "all" ||
        r.action === this.filter ||
        (this.filter === "failed" &&
          !!r.error &&
          ["created", "updated"].includes(r.action)),
    );
    this.page = Math.min(
      this.page,
      Math.max(0, Math.ceil(results.length / 100) - 1),
    );
    el.createEl("p", {
      text: `${results.length} ${ui("项", "items")} · ${this.page + 1}/${Math.max(1, Math.ceil(results.length / 100))}`,
    });
    for (const item of results.slice(this.page * 100, (this.page + 1) * 100)) {
      const row = el.createDiv({ cls: "feishu-sync-row" });
      row.createSpan({ text: `${label(item.action)} · ${item.title}` });
      if (item.localPath)
        button(row, ui("打开", "Open"), () => this.openNote(item.localPath!));
      if (item.error)
        row.createEl("p", { text: item.error, cls: "feishu-sync-error" });
    }
    button(
      el,
      ui("上一页", "Previous"),
      () => {
        this.page--;
        this.render();
      },
      this.page <= 0,
    );
    button(
      el,
      ui("下一页", "Next"),
      () => {
        this.page++;
        this.render();
      },
      (this.page + 1) * 100 >= results.length,
    );
    if (selected.errors.length) {
      const errors = el.createEl("details");
      errors.createEl("summary", {
        text: `${ui("完整错误记录", "All errors")} (${selected.errors.length})`,
      });
      for (const error of selected.errors)
        errors.createEl("p", { text: error });
    }
  }
  private async openNote(path: string): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile))
      throw new Error(ui("笔记不存在或已移动", "Note missing or moved"));
    await this.app.workspace.getLeaf(false).openFile(file);
  }
}

class RelinkModal extends Modal {
  constructor(
    app: App,
    private readonly plugin: FeishuLarkSyncPlugin,
    private readonly token: string,
  ) {
    super(app);
  }
  onOpen(): void {
    let path = "";
    this.contentEl.createEl("p", {
      text: ui(
        "输入移动后的知识库相对路径（包含 .md）。会验证飞书文档标识，正文有改动则进入冲突处理。",
        "Enter the moved note's vault-relative path, including .md. Document identity is verified; edits trigger conflict review.",
      ),
    });
    new Setting(this.contentEl)
      .setName(ui("笔记路径", "Note path"))
      .addText((t) =>
        t.onChange((v) => {
          path = v.trim();
        }),
      );
    button(this.contentEl, ui("关联", "Relink"), async () => {
      await this.plugin.relink(this.token, path);
      this.close();
    });
  }
}
class ConflictModal extends Modal {
  constructor(
    app: App,
    private readonly plugin: FeishuLarkSyncPlugin,
    private readonly preview: ConflictPreview,
  ) {
    super(app);
  }
  async onOpen(): Promise<void> {
    this.modalEl.addClass("feishu-conflict-modal");
    this.contentEl.createEl("h2", {
      text: ui("比较本地与远端正文", "Compare local and remote content"),
    });
    this.contentEl.createEl("p", {
      text: ui(
        "这里只显示正文文本，不执行 HTML 或加载远端图片。应用远端前会备份完整本地笔记；预览后本地发生变化将中止操作。",
        "Text-only preview: no HTML execution or remote images. The entire local note is backed up before applying remote content. Local changes after this preview abort the operation.",
      ),
    });
    const columns = this.contentEl.createDiv({
      cls: "feishu-conflict-columns",
    });
    for (const [name, content] of [
      [
        ui("本地管理区", "Local managed region"),
        extractManagedBody(this.preview.local) ?? this.preview.local,
      ],
      [
        ui("远端版本", "Remote version"),
        await normalizeFeishuMarkdown(
          this.preview.remote,
          async () => undefined,
        ),
      ],
    ]) {
      const col = columns.createDiv();
      col.createEl("h3", { text: name });
      col.createEl("pre", { text: content });
    }
    const controls = this.contentEl.createDiv({ cls: "feishu-sync-controls" });
    for (const [choice, text] of [
      ["pause", ui("保留本地，暂停此文档", "Keep local; pause this document")],
      [
        "preserve",
        ui(
          "保留到本地笔记区，并应用远端",
          "Preserve local section; apply remote",
        ),
      ],
      ["remote", ui("备份后采用远端", "Back up and use remote")],
    ] as const)
      button(controls, text, async () => {
        const backup = await this.plugin.resolveConflict(this.preview, choice);
        new Notice(
          backup
            ? `${ui("已处理。备份位于插件目录", "Resolved. Backup in plugin directory")}: ${backup}`
            : ui("已暂停此文档", "Document paused"),
          10_000,
        );
        this.close();
      });
  }
}
