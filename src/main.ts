import { FileSystemAdapter, Notice, Plugin } from "obsidian";
import { join } from "node:path";
import { t, ui } from "./i18n";
import { LarkCliClient, type ConnectionStatus } from "./lark-cli";
import { FeishuLarkSyncSettingTab } from "./settings";
import {
  PullSynchronizer,
  type ConflictPreview,
  type RunOptions,
} from "./sync/pull-synchronizer";
import { SyncEngine, type ScanSummary } from "./sync/sync-engine";
import {
  type FeishuLarkSyncSettings,
  type PluginData,
  type SyncRunSummary,
  type SyncProgress,
  type SyncSource,
} from "./types";
import { ObsidianVaultStore } from "./vault/obsidian-store";
import { fileStateIO, migrateData, StateRepository } from "./state";
import { checkAbort, safeError } from "./safety";
import { SyncScheduler } from "./sync/scheduler";
import { StatusView, STATUS_VIEW } from "./status-view";

export default class FeishuLarkSyncPlugin extends Plugin {
  private pluginData: PluginData = migrateData(null);
  settings: FeishuLarkSyncSettings = this.pluginData.settings;
  private repository!: StateRepository;
  private store!: ObsidianVaultStore;
  private controller?: AbortController;
  private unloaded = false;
  private listeners = new Set<() => void>();
  private scheduler = new SyncScheduler(
    () => this.synchronizeWithNotice("scheduled"),
    () => this.emit(),
  );
  private consecutiveFailures = 0;
  recoveryError?: string;
  connection?: ConnectionStatus;
  progress: SyncProgress = { phase: "idle", completed: 0, total: 0 };
  get busy(): boolean {
    return !!this.controller;
  }
  get history() {
    return this.pluginData.history;
  }
  get documents() {
    return this.pluginData.documents;
  }
  get lastSuccessAt() {
    return this.pluginData.lastSuccessAt;
  }
  get nextRunAt() {
    return this.scheduler.nextRunAt;
  }

  async onload(): Promise<void> {
    const adapter = this.app.vault.adapter;
    if (!(adapter instanceof FileSystemAdapter))
      throw new Error("Desktop filesystem vault required");
    const io = fileStateIO(
      join(
        adapter.getBasePath(),
        this.manifest.dir ??
          `${this.app.vault.configDir}/plugins/${this.manifest.id}`,
      ),
    );
    this.repository = new StateRepository(io);
    this.store = new ObsidianVaultStore(this.app.vault, io);
    try {
      this.pluginData = await this.repository.load();
      this.settings = this.pluginData.settings;
    } catch (error) {
      this.recoveryError = safeError(error);
      new Notice(
        ui(
          "同步状态异常，已暂停。请打开同步中心恢复。",
          "Sync state invalid. Open Sync Center to recover.",
        ),
        10_000,
      );
    }
    this.registerView(STATUS_VIEW, (leaf) => new StatusView(leaf, this));
    this.addSettingTab(new FeishuLarkSyncSettingTab(this.app, this));
    this.addRibbonIcon(
      "refresh-cw",
      ui("飞书同步中心", "Feishu Sync Center"),
      () => {
        void this.openStatus();
      },
    );
    this.addCommand({
      id: "open-sync-center",
      name: ui("打开同步中心", "Open Sync Center"),
      callback: () => {
        void this.openStatus();
      },
    });
    this.addCommand({
      id: "cancel-synchronization",
      name: ui("取消当前同步", "Cancel synchronization"),
      callback: () => this.cancel(),
    });
    this.addCommand({
      id: "synchronize-now",
      name: t("command.syncNow"),
      callback: () => {
        void this.synchronizeWithNotice();
      },
    });
    this.addCommand({
      id: "scan-sync-sources",
      name: t("command.scanSources"),
      callback: () => {
        void this.scanSources()
          .then((s) => this.notifyScanSummary(s))
          .catch((e) => new Notice(safeError(e)));
      },
    });
    this.addCommand({
      id: "check-lark-cli-connection",
      name: t("command.checkConnection"),
      callback: () => {
        void this.checkConnection()
          .then(
            (s) =>
              new Notice(
                s.authenticated
                  ? ui("用户身份已验证", "User verified")
                  : (s.detail ??
                      ui("需要用户授权", "User authorization required")),
              ),
          )
          .catch((e) => new Notice(safeError(e)));
      },
    });
    this.configureScheduler();
    this.app.workspace.onLayoutReady(() => {
      if (!this.unloaded && !this.recoveryError && this.settings.syncOnStartup)
        void this.synchronizeWithNotice("startup");
    });
  }
  onunload(): void {
    this.unloaded = true;
    this.scheduler.stop();
    this.controller?.abort();
    this.listeners.clear();
  }
  subscribe(callback: () => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }
  private emit(): void {
    for (const fn of this.listeners) fn();
  }
  async openStatus(): Promise<void> {
    const leaf =
      this.app.workspace.getLeavesOfType(STATUS_VIEW)[0] ??
      this.app.workspace.getRightLeaf(false);
    if (leaf) {
      await leaf.setViewState({ type: STATUS_VIEW, active: true });
      await this.app.workspace.revealLeaf(leaf);
    }
  }
  async savePluginData(): Promise<void> {
    if (this.recoveryError) throw new Error(this.recoveryError);
    this.pluginData.settings = this.settings;
    migrateData(this.pluginData);
    try {
      await this.repository.save(this.pluginData);
    } catch (error) {
      this.recoveryError = safeError(error);
      this.scheduler.stop();
      this.controller?.abort();
      this.emit();
      throw error;
    }
    this.emit();
    if (!this.busy) this.configureScheduler();
  }
  async restoreState(): Promise<void> {
    if (this.busy)
      throw new Error(
        ui("请先取消并等待当前任务结束", "Wait for the current task to finish"),
      );
    this.controller = new AbortController();
    this.scheduler.stop();
    this.emit();
    try {
      this.pluginData = await this.repository.restoreBackup();
      this.settings = this.pluginData.settings;
      // Recovery never starts remote work automatically.
      this.settings.syncOnStartup = false;
      this.settings.scheduleMinutes = 0;
      this.recoveryError = undefined;
      await this.savePluginData();
    } finally {
      this.controller = undefined;
      this.configureScheduler();
      this.emit();
    }
  }
  private async operation<T>(
    action: (
      client: LarkCliClient,
      synchronizer: PullSynchronizer,
      signal: AbortSignal,
    ) => Promise<T>,
  ): Promise<T> {
    if (this.unloaded) throw new Error("Plugin unloaded");
    if (this.recoveryError) throw new Error(this.recoveryError);
    if (this.busy)
      throw new Error(
        ui(
          "已有任务正在运行，请等待或取消",
          "A task is running; wait or cancel it",
        ),
      );
    const controller = (this.controller = new AbortController());
    const settings = structuredClone(this.settings);
    const client = new LarkCliClient(() => settings, controller.signal);
    const synchronizer = new PullSynchronizer({
      engine: new SyncEngine(client, controller.signal),
      client,
      vault: this.store,
      getSettings: () => settings,
      getStates: () => this.pluginData.documents,
      saveState: () => this.savePluginData(),
    });
    this.scheduler.stop();
    this.emit();
    try {
      return await action(client, synchronizer, controller.signal);
    } finally {
      this.controller = undefined;
      this.progress = { phase: "idle", completed: 0, total: 0 };
      this.configureScheduler();
      this.emit();
    }
  }
  cancel(): void {
    if (this.controller) {
      this.progress.phase = "cancelling";
      this.controller.abort();
      this.emit();
    }
  }
  checkConnection(): Promise<ConnectionStatus> {
    return this.operation(async (client) => {
      this.connection = await client.inspectConnection();
      this.emit();
      return this.connection;
    });
  }
  configureApplication(appId: string, secret: string): Promise<void> {
    return this.operation(async (client) => {
      await client.configureApplication(appId, secret, this.settings.brand);
      this.settings.appId = appId.trim();
      this.connection = undefined;
      await this.savePluginData();
    });
  }
  beginAuthorization() {
    return this.operation((client) => client.beginAuthorization());
  }
  completeAuthorization(code: string) {
    return this.operation(async (client) => {
      await client.completeAuthorization(code);
      this.connection = await client.inspectConnection();
      if (!this.connection.authenticated)
        throw new Error(
          ui("授权未通过验证，请重新检查", "Authorization was not verified"),
        );
    });
  }
  inspectSourceUrl(url: string) {
    return this.operation((client) => client.inspectSourceUrl(url));
  }
  scanSources(
    sources: SyncSource[] = this.settings.sources,
  ): Promise<ScanSummary> {
    const snapshot = structuredClone(sources);
    return this.operation((client, _s, signal) =>
      new SyncEngine(client, signal).scanSources(snapshot),
    );
  }
  synchronize(options: RunOptions = {}): Promise<SyncRunSummary> {
    return this.operation(async (_client, synchronizer, signal) => {
      let report: SyncRunSummary;
      try {
        report = await synchronizer.run({
          ...options,
          signal,
          onProgress: (p) => {
            this.progress = p;
            this.emit();
          },
        });
      } catch (error) {
        this.consecutiveFailures++;
        // Persist a redacted fatal report when the state store is still healthy.
        if (!this.recoveryError) {
          this.pluginData.history.push({
            sources: 0,
            discovered: 0,
            created: 0,
            updated: 0,
            unchanged: 0,
            conflicts: 0,
            inaccessible: 1,
            skippedUnsupported: 0,
            failedSources: 0,
            errors: [safeError(error)],
            results: [],
            finishedAt: new Date().toISOString(),
            trigger: options.trigger ?? "manual",
          });
          this.pluginData.history = this.pluginData.history.slice(-10);
          await this.savePluginData();
        }
        throw error;
      }
      const failed = report.errors.length > 0 || report.failedSources > 0;
      this.consecutiveFailures = failed ? this.consecutiveFailures + 1 : 0;
      if (
        !failed &&
        !report.cancelled &&
        !report.conflicts &&
        !report.results?.some((r) =>
          ["missing-local", "paused"].includes(r.action),
        )
      )
        this.pluginData.lastSuccessAt = report.finishedAt;
      this.pluginData.history.push(report);
      this.pluginData.history = this.pluginData.history.slice(-10);
      await this.savePluginData();
      return report;
    });
  }
  retryFailed(report = this.history.at(-1)) {
    const retry =
      report?.results
        ?.filter(
          (item) =>
            item.action === "failed" ||
            (item.token && this.documents[item.token]?.mediaIncomplete),
        )
        .map((item) => ({ ...item, action: "failed" as const })) ?? [];
    if (!retry.length)
      return Promise.reject(
        new Error(ui("没有可重试的失败项", "No failed items to retry")),
      );
    return this.synchronize({ retry, trigger: "retry" });
  }
  previewConflict(token: string) {
    return this.operation((_c, s, signal) => s.previewConflict(token, signal));
  }
  resolveConflict(
    preview: ConflictPreview,
    choice: "pause" | "preserve" | "remote",
  ) {
    return this.operation((_c, s, signal) =>
      s.resolveConflict(preview, choice, signal),
    );
  }
  relink(token: string, path: string) {
    return this.operation((_c, s) => s.relink(token, path));
  }
  restoreNote(token: string) {
    return this.synchronize({ restoreToken: token });
  }
  resumeNote(token: string) {
    return this.operation(async (_c, _s, signal) => {
      checkAbort(signal);
      const state = this.documents[token];
      if (state?.status === "paused") {
        state.status = "conflict";
        await this.savePluginData();
      }
    });
  }
  configureScheduler(): void {
    if (
      this.unloaded ||
      this.busy ||
      this.recoveryError ||
      !this.settings.sources.some((s) => s.enabled)
    ) {
      this.scheduler.stop();
      return;
    }
    this.scheduler.arm(this.settings.scheduleMinutes, this.consecutiveFailures);
  }
  notifyScanSummary(summary: ScanSummary): void {
    new Notice(
      t("notice.scanSummary", {
        nodes: summary.nodeCount,
        documents: summary.documentCount,
        failures: summary.sources.some((s) => s.error)
          ? t("notice.failedSources", {
              count: summary.sources.filter((s) => s.error).length,
            })
          : "",
      }),
    );
    for (const source of summary.sources.filter((s) => s.error))
      new Notice(safeError(source.error), 10_000);
  }
  errorMessage(error: unknown): string {
    return safeError(error);
  }
  async synchronizeWithNotice(
    trigger: "manual" | "scheduled" | "startup" = "manual",
  ): Promise<void> {
    if (!this.settings.sources.some((s) => s.enabled)) {
      if (trigger === "manual") new Notice(t("notice.noSources"));
      return;
    }
    try {
      const report = await this.synchronize({ trigger });
      const attention =
        report.errors.length ||
        report.conflicts ||
        report.results?.some((r) => ["missing-local"].includes(r.action));
      if (
        trigger === "manual" ||
        report.created ||
        report.updated ||
        attention
      ) {
        new Notice(
          report.cancelled
            ? ui(
                "同步已取消；已完成的文档已保存",
                "Cancelled; completed documents were saved",
              )
            : t("notice.syncSummary", {
                created: report.created,
                updated: report.updated,
                unchanged: report.unchanged,
                conflicts: report.conflicts,
                errors: report.errors.length,
              }),
          8_000,
        );
      }
    } catch (error) {
      if (!this.unloaded)
        new Notice(t("notice.syncFailed", { error: safeError(error) }), 10_000);
    }
  }
}
