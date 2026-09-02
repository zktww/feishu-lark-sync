import {
  App,
  Modal,
  Notice,
  PluginSettingTab,
  Setting,
  TextComponent,
  requireApiVersion,
  type SettingDefinitionItem,
} from "obsidian";
import type FeishuLarkSyncPlugin from "./main";
import { t, ui } from "./i18n";
import { vaultPath } from "./safety";
import type { AuthorizationRequest } from "./lark-cli";
import type { ResolvedSyncSource, SyncSource, SyncSourceType } from "./types";

// Executable names and identifier examples are not prose to be capitalized.
const CLI_EXECUTABLE = "lark-cli";
const APP_ID_EXAMPLE = "cli_xxxxxxxxx";

export class FeishuLarkSyncSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    private readonly plugin: FeishuLarkSyncPlugin,
  ) {
    super(app, plugin);
  }

  display(): void {
    this.renderLegacy();
  }

  private renderLegacy(): void {
    const { containerEl } = this;
    containerEl.empty();
    this.displayOverview(containerEl);
    if (this.plugin.recoveryError) return;
    this.displayConnectionSettings(containerEl);
    this.displaySourceSettings(containerEl);
    this.displayMediaSettings(containerEl);
    this.displayScheduleSettings(containerEl);
  }

  private refresh(): void {
    if (requireApiVersion("1.13.0")) this.update();
    else this.renderLegacy();
  }

  getSettingDefinitions(): SettingDefinitionItem[] {
    const sections: [string, string[], (el: HTMLElement) => void][] = [
      [
        ui("同步状态", "Sync status"),
        ["recovery", "恢复"],
        (el) => this.displayOverview(el),
      ],
      [
        t("connection.heading"),
        ["lark-cli", "profile", "authorization", "授权"],
        (el) => this.displayConnectionSettings(el),
      ],
      [
        t("sources.heading"),
        ["URL", "Wiki", "Drive", "链接", "目录"],
        (el) => this.displaySourceSettings(el),
      ],
      [
        ui("图片与附件", "Images and attachments"),
        ["media", "download", "下载"],
        (el) => this.displayMediaSettings(el),
      ],
      [
        t("schedule.heading"),
        ["timer", "interval", "定时"],
        (el) => this.displayScheduleSettings(el),
      ],
    ];
    return sections.map(([name, aliases, render], index) => ({
      name,
      aliases,
      visible: () => index === 0 || !this.plugin.recoveryError,
      render: (setting) => {
        setting.settingEl.empty();
        setting.settingEl.addClass("feishu-sync-settings-section");
        render(setting.settingEl);
      },
    }));
  }

  private displayOverview(containerEl: HTMLElement): void {
    containerEl.createEl("p", {
      cls: "feishu-lark-sync-status",
      text: t("settings.milestone"),
    });
    new Setting(containerEl)
      .setName(ui("同步状态与问题处理", "Sync status and recovery"))
      .setDesc(
        ui(
          "查看逐篇结果、取消任务、重试失败项，以及比较和处理冲突。",
          "View per-document results, cancel, retry failures, and resolve conflicts.",
        ),
      )
      .addButton((b) =>
        b.setButtonText(ui("打开同步中心", "Open Sync Center")).onClick(() => {
          void this.plugin.openStatus();
        }),
      );
    if (this.plugin.recoveryError) {
      containerEl.createEl("p", {
        text: this.plugin.recoveryError,
        cls: "feishu-sync-error",
      });
      return;
    }
    containerEl.createEl("p", {
      text: ui(
        "当前任务使用启动时的配置快照；修改配置从下次同步生效。",
        "Running tasks use a settings snapshot; changes apply on the next sync.",
      ),
    });
  }

  private displayConnectionSettings(containerEl: HTMLElement): void {
    new Setting(containerEl)
      .setName(`1. ${t("connection.heading")}`)
      .setHeading();
    containerEl.createEl("p", {
      text: ui(
        "先检查 lark-cli → 绑定自建应用 → 用户只读授权 → 再次检查身份。macOS 找不到命令时，请填写 lark-cli 的绝对路径。",
        "Check lark-cli → bind your app → authorize read-only user access → verify identity. On macOS, use an absolute CLI path if the executable is not found.",
      ),
    });
    if (this.plugin.connection)
      containerEl.createEl("p", {
        text: `${ui("当前用户", "Current user")}: ${this.plugin.connection.userName ?? "—"} · ${this.plugin.settings.profileName} · ${this.plugin.connection.authenticated ? ui("验证通过", "Verified") : ui("未验证", "Not verified")}`,
      });

    new Setting(containerEl)
      .setName(t("connection.cli.name"))
      .setDesc(t("connection.cli.desc"))
      .addText((text) =>
        text
          .setPlaceholder(CLI_EXECUTABLE)
          .setValue(this.plugin.settings.cliPath)
          .onChange(async (value) => {
            this.plugin.settings.cliPath = value.trim() || "lark-cli";
            this.plugin.connection = undefined;
            await this.plugin.savePluginData();
          }),
      );

    new Setting(containerEl)
      .setName(t("connection.profile.name"))
      .setDesc(t("connection.profile.desc"))
      .addText((text) =>
        text
          .setValue(this.plugin.settings.profileName)
          .onChange(async (value) => {
            this.plugin.settings.profileName =
              value.trim() || "feishu-lark-sync";
            this.plugin.connection = undefined;
            await this.plugin.savePluginData();
          }),
      );

    new Setting(containerEl)
      .setName(t("connection.brand.name"))
      .setDesc(t("connection.brand.desc"))
      .addDropdown((dropdown) =>
        dropdown
          .addOption("feishu", "Feishu")
          .addOption("lark", "Lark")
          .setValue(this.plugin.settings.brand)
          .onChange(async (value) => {
            this.plugin.settings.brand = value === "lark" ? "lark" : "feishu";
            this.plugin.connection = undefined;
            await this.plugin.savePluginData();
          }),
      );

    new Setting(containerEl)
      .setName(t("connection.appId.name"))
      .setDesc(t("connection.appId.desc"))
      .addText((text) =>
        text
          .setPlaceholder(APP_ID_EXAMPLE)
          .setValue(this.plugin.settings.appId)
          .onChange(async (value) => {
            this.plugin.settings.appId = value.trim();
            this.plugin.connection = undefined;
            await this.plugin.savePluginData();
          }),
      );

    new Setting(containerEl)
      .setName(t("connection.environment.name"))
      .setDesc(t("connection.environment.desc"))
      .addButton((button) =>
        button
          .setButtonText(t("connection.environment.check"))
          .onClick(async () => {
            button.setDisabled(true);
            try {
              const status = await this.plugin.checkConnection();
              const auth = status.authenticated
                ? t("connection.environment.authorized", {
                    user: status.userName
                      ? t("common.userSuffix", { name: status.userName })
                      : "",
                  })
                : t("connection.environment.unauthorized");
              new Notice(
                status.installed
                  ? `${status.version ?? "lark-cli"}: ${auth}`
                  : (status.detail ?? "lark-cli not found"),
              );
              this.refresh();
            } catch (error) {
              new Notice(this.plugin.errorMessage(error));
            } finally {
              button.setDisabled(false);
            }
          }),
      );

    new Setting(containerEl)
      .setName(t("connection.bind.name"))
      .setDesc(t("connection.bind.desc"))
      .addButton((button) =>
        button.setButtonText(t("connection.bind.button")).onClick(() => {
          new ConfigureApplicationModal(this.app, this.plugin).open();
        }),
      );

    new Setting(containerEl)
      .setName(t("connection.auth.name"))
      .setDesc(t("connection.auth.desc"))
      .addButton((button) =>
        button
          .setCta()
          .setButtonText(t("connection.auth.button"))
          .onClick(async () => {
            button.setDisabled(true);
            try {
              const request = await this.plugin.beginAuthorization();
              new AuthorizationModal(this.app, this.plugin, request).open();
            } catch (error) {
              new Notice(this.plugin.errorMessage(error));
            } finally {
              button.setDisabled(false);
            }
          }),
      );
  }

  private displaySourceSettings(containerEl: HTMLElement): void {
    new Setting(containerEl).setName(`2. ${t("sources.heading")}`).setHeading();
    containerEl.createEl("p", {
      text: ui(
        "新同步源默认关闭。预览后设置目标目录，再开启并手动同步一次。只读取远端，不回写或删除远端文档。",
        "New sources start disabled. Preview, choose a destination, then enable and run manually. Remote documents are read-only, never updated or deleted.",
      ),
    });
    containerEl.createEl("p", {
      cls: "setting-item-description",
      text: t("sources.desc"),
    });

    for (const source of this.plugin.settings.sources) {
      const wrapper = containerEl.createDiv({ cls: "feishu-lark-sync-source" });
      new Setting(wrapper)
        .setName(source.name || t("sources.unnamed"))
        .setHeading()
        .addToggle((toggle) =>
          toggle.setValue(source.enabled).onChange(async (value) => {
            source.enabled = value;
            await this.plugin.savePluginData();
          }),
        )
        .addExtraButton((button) =>
          button
            .setIcon("trash-2")
            .setTooltip(t("sources.remove"))
            .onClick(async () => {
              this.plugin.settings.sources =
                this.plugin.settings.sources.filter(
                  (item) => item.id !== source.id,
                );
              await this.plugin.savePluginData();
              this.refresh();
            }),
        );

      this.addSourceText(
        wrapper,
        t("sources.name"),
        source.name,
        async (value) => {
          source.name = value;
          await this.plugin.savePluginData();
        },
      );

      if (source.sourceUrl) {
        new Setting(wrapper)
          .setName(t("sources.link"))
          .setDesc(source.sourceUrl)
          .addButton((button) =>
            button.setButtonText(t("sources.changeLink")).onClick(() => {
              new AddSourceFromUrlModal(
                this.app,
                this.plugin,
                async (resolved) => {
                  this.applyResolvedSource(source, resolved);
                  await this.plugin.savePluginData();
                  this.refresh();
                },
                source.sourceUrl,
              ).open();
            }),
          );
        new Setting(wrapper)
          .setName(t("sources.type"))
          .setDesc(this.sourceTypeLabel(source.type));
      } else {
        new Setting(wrapper)
          .setName(t("sources.type"))
          .addDropdown((dropdown) =>
            dropdown
              .addOption("wiki", t("sources.type.wiki"))
              .addOption("drive-folder", t("sources.type.drive"))
              .addOption("document", t("sources.type.document"))
              .setValue(source.type)
              .onChange(async (value) => {
                source.type = value as SyncSourceType;
                await this.plugin.savePluginData();
                this.refresh();
              }),
          );

        this.addSourceText(
          wrapper,
          source.type === "wiki"
            ? t("sources.wikiSpaceId")
            : t("sources.remoteToken"),
          source.remoteId,
          async (value) => {
            source.remoteId = value;
            await this.plugin.savePluginData();
          },
        );

        if (source.type === "wiki") {
          this.addSourceText(
            wrapper,
            t("sources.rootNode"),
            source.rootNodeToken,
            async (value) => {
              source.rootNodeToken = value;
              await this.plugin.savePluginData();
            },
            t("sources.rootNodeDesc"),
          );
        }
      }

      this.addSourceText(
        wrapper,
        t("sources.vaultFolder"),
        source.targetFolder,
        async (value) => {
          source.targetFolder = vaultPath(value || "Feishu");
          await this.plugin.savePluginData();
        },
        ui(
          "仅影响新建笔记；已同步的笔记保持原路径，不自动搬移。",
          "Affects new notes only; existing notes keep their paths and are not moved automatically.",
        ),
      );
      new Setting(wrapper)
        .setName(ui("只读预览", "Read-only preview"))
        .addButton((b) =>
          b
            .setButtonText(ui("扫描数量与类型", "Preview count and types"))
            .onClick(async () => {
              b.setDisabled(true);
              try {
                const scan = await this.plugin.scanSources([
                  { ...source, enabled: true },
                ]);
                const modal = new Modal(this.app);
                new Setting(modal.contentEl).setName(source.name).setHeading();
                renderPreview(modal.contentEl, scan);
                modal.open();
              } catch (error) {
                new Notice(this.plugin.errorMessage(error));
              } finally {
                b.setDisabled(false);
              }
            }),
        );
    }

    new Setting(containerEl)
      .setName(t("sources.add.name"))
      .addButton((button) =>
        button.setButtonText(t("sources.add.wiki")).onClick(() => {
          new AddSourceFromUrlModal(this.app, this.plugin, async (resolved) => {
            this.plugin.settings.sources.push(this.createSource(resolved));
            await this.plugin.savePluginData();
            this.refresh();
          }).open();
        }),
      )
      .addButton((button) =>
        button.setButtonText(t("sources.scan")).onClick(async () => {
          button.setDisabled(true);
          try {
            const summary = await this.plugin.synchronize();
            new Notice(
              t("notice.syncSummary", {
                created: summary.created,
                updated: summary.updated,
                unchanged: summary.unchanged,
                conflicts: summary.conflicts,
                errors: summary.errors.length,
              }),
              10_000,
            );
            for (const error of summary.errors.slice(0, 3)) {
              new Notice(t("notice.syncError", { error }), 10_000);
            }
          } catch (error) {
            new Notice(this.plugin.errorMessage(error));
          } finally {
            button.setDisabled(false);
          }
        }),
      );
  }

  private displayMediaSettings(containerEl: HTMLElement): void {
    new Setting(containerEl)
      .setName(ui("3. 图片与附件", "3. Images and attachments"))
      .setHeading();
    new Setting(containerEl)
      .setName(ui("图片与附件策略", "Media strategy"))
      .setDesc(
        ui(
          "保留远端链接可节省空间，但链接可能过期。更改策略仅影响后续拉取的内容；不会清理或重写已同步图片。",
          "Remote links save disk space but may expire. Changes affect future fetches only; existing media is not rewritten or cleaned up.",
        ),
      )
      .addDropdown((d) =>
        d
          .addOption("local", ui("下载到本地", "Download locally"))
          .addOption("remote", ui("保留远端链接", "Keep remote links"))
          .setValue(this.plugin.settings.mediaMode ?? "local")
          .onChange(async (value) => {
            this.plugin.settings.mediaMode =
              value === "remote" ? "remote" : "local";
            try {
              await this.plugin.savePluginData();
            } catch (error) {
              new Notice(this.plugin.errorMessage(error));
            }
          }),
      );
    this.addSourceText(
      containerEl,
      ui("单个文件上限（MB）", "Per-file limit (MB)"),
      String(this.plugin.settings.maxMediaMB ?? 20),
      async (value) => {
        const size = Number(value);
        if (!Number.isInteger(size) || size < 1 || size > 100)
          throw new Error(
            ui("请输入 1–100 的整数", "Enter an integer between 1 and 100"),
          );
        this.plugin.settings.maxMediaMB = size;
        await this.plugin.savePluginData();
      },
      ui(
        "超过上限或校验失败会保留远端链接，可在同步中心重试。",
        "Oversized or invalid files retain the remote link and can be retried in Sync Center.",
      ),
    );
    this.addSourceText(
      containerEl,
      ui("额外可信图片域名", "Additional trusted media domains"),
      (this.plugin.settings.extraMediaHosts ?? []).join(", "),
      async (value) => {
        const hosts = value
          .split(",")
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean);
        if (
          hosts.some(
            (h) => !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(h),
          )
        )
          throw new Error(
            ui(
              "只填可信域名，以逗号分隔；不要填写 URL",
              "Enter trusted hostnames separated by commas, not URLs",
            ),
          );
        this.plugin.settings.extraMediaHosts = hosts;
        await this.plugin.savePluginData();
      },
      ui(
        "默认允许飞书/Lark 常见 CDN。仅在错误提示确有需要时添加，包含子域名。私有网络地址始终禁止。",
        "Common Feishu/Lark CDNs are allowed by default. Add domains only when needed; subdomains are included. Private network addresses remain blocked.",
      ),
    );
  }

  private displayScheduleSettings(containerEl: HTMLElement): void {
    new Setting(containerEl)
      .setName(`4. ${t("schedule.heading")}`)
      .setHeading();
    containerEl.createEl("p", {
      text: ui(
        "需保持 Obsidian 和插件运行。上次任务结束后再计时；连续失败会延后重试（最长 6 小时）。未变化的定时同步不弹通知。",
        "Obsidian and this plugin must stay running. The next interval starts after completion; failures back off up to 6 hours. Unchanged scheduled runs stay quiet.",
      ),
    });

    new Setting(containerEl)
      .setName(t("schedule.startup.name"))
      .setDesc(t("schedule.startup.desc"))
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.syncOnStartup)
          .onChange(async (value) => {
            this.plugin.settings.syncOnStartup = value;
            await this.plugin.savePluginData();
          }),
      );

    new Setting(containerEl)
      .setName(t("schedule.interval.name"))
      .setDesc(t("schedule.interval.desc"))
      .addDropdown((dropdown) =>
        dropdown
          .addOption("0", t("schedule.interval.manual"))
          .addOption("15", t("schedule.interval.15"))
          .addOption("30", t("schedule.interval.30"))
          .addOption("60", t("schedule.interval.60"))
          .setValue(String(this.plugin.settings.scheduleMinutes))
          .onChange(async (value) => {
            this.plugin.settings.scheduleMinutes = Number(value);
            await this.plugin.savePluginData();
            this.plugin.configureScheduler();
          }),
      );
  }

  private addSourceText(
    containerEl: HTMLElement,
    name: string,
    value: string,
    onChange: (value: string) => Promise<void>,
    description?: string,
  ): void {
    const setting = new Setting(containerEl).setName(name);
    if (description) {
      setting.setDesc(description);
    }
    setting.addText((text) => {
      text.setValue(value);
      text.inputEl.addEventListener("blur", () => {
        if (text.getValue().trim() === value) return;
        void onChange(text.getValue().trim()).catch((error) => {
          text.setValue(value);
          new Notice(this.plugin.errorMessage(error));
        });
      });
    });
  }

  private createSource(resolved: ResolvedSyncSource): SyncSource {
    return {
      id: `source-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: resolved.name || t("sources.defaultName"),
      type: resolved.type,
      sourceUrl: resolved.sourceUrl,
      objectType: resolved.objectType,
      remoteId: resolved.remoteId,
      rootNodeToken: resolved.rootNodeToken,
      targetFolder: "Feishu",
      enabled: false,
    };
  }

  private applyResolvedSource(
    source: SyncSource,
    resolved: ResolvedSyncSource,
  ): void {
    source.name = resolved.name || source.name;
    source.type = resolved.type;
    source.sourceUrl = resolved.sourceUrl;
    source.objectType = resolved.objectType;
    source.remoteId = resolved.remoteId;
    source.rootNodeToken = resolved.rootNodeToken;
  }

  private sourceTypeLabel(type: SyncSourceType): string {
    if (type === "wiki") {
      return t("sources.type.wiki");
    }
    if (type === "drive-folder") {
      return t("sources.type.drive");
    }
    return t("sources.type.document");
  }
}

class AddSourceFromUrlModal extends Modal {
  private sourceUrl: string;
  private readonly updating: boolean;

  constructor(
    app: App,
    private readonly plugin: FeishuLarkSyncPlugin,
    private readonly onResolved: (source: ResolvedSyncSource) => Promise<void>,
    initialUrl = "",
  ) {
    super(app);
    this.sourceUrl = initialUrl;
    this.updating = initialUrl.length > 0;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl("h2", { text: t("modal.source.title") });
    contentEl.createEl("p", { text: t("modal.source.desc") });

    const previewEl = contentEl.createDiv();
    new Setting(contentEl).setName(t("modal.source.link")).addText((text) =>
      text
        .setPlaceholder(t("modal.source.placeholder"))
        .setValue(this.sourceUrl)
        .onChange((value) => {
          this.sourceUrl = value.trim();
          previewEl.empty();
        }),
    );

    new Setting(contentEl)
      .addButton((button) =>
        button.setButtonText(t("common.cancel")).onClick(() => this.close()),
      )
      .addButton((button) =>
        button
          .setCta()
          .setButtonText(ui("解析并预览", "Resolve and preview"))
          .onClick(async () => {
            button.setDisabled(true);
            try {
              const inputUrl = this.sourceUrl;
              const resolved = await this.plugin.inspectSourceUrl(inputUrl);
              const scan = await this.plugin.scanSources([
                {
                  ...resolved,
                  id: "preview",
                  targetFolder: "Feishu",
                  enabled: true,
                },
              ]);
              if (inputUrl !== this.sourceUrl) return;
              previewEl.empty();
              renderPreview(previewEl, scan);
              if (!scan.sources.some((s) => s.error))
                new Setting(previewEl).addButton((confirm) =>
                  confirm
                    .setCta()
                    .setButtonText(ui("确认保存同步源", "Save source"))
                    .onClick(async () => {
                      confirm.setDisabled(true);
                      try {
                        await this.onResolved(resolved);
                        new Notice(
                          t(
                            this.updating
                              ? "notice.sourceUpdated"
                              : "notice.sourceAdded",
                            { name: resolved.name },
                          ),
                        );
                        this.close();
                      } catch (error) {
                        new Notice(this.plugin.errorMessage(error));
                        confirm.setDisabled(false);
                      }
                    }),
                );
            } catch (error) {
              new Notice(
                t("notice.sourceResolveFailed", {
                  error: this.plugin.errorMessage(error),
                }),
              );
            } finally {
              button.setDisabled(false);
            }
          }),
      );
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

function renderPreview(
  el: HTMLElement,
  scan: Awaited<ReturnType<FeishuLarkSyncPlugin["scanSources"]>>,
): void {
  const supported = scan.documents.filter((d) =>
    ["doc", "docx"].includes(d.objectType),
  );
  el.createEl("p", {
    text: `${ui("可同步正文", "Supported documents")}: ${supported.length} · ${ui("暂不支持", "Unsupported")}: ${scan.documents.length - supported.length}`,
  });
  el.createEl("p", {
    text: ui(
      "只读扫描，不会写入笔记。当前支持 doc/docx；表格、多维表格、幻灯片等只展示，不同步正文。",
      "Read-only scan; no notes are written. Only doc/docx content is synced; sheets, bases, and slides are listed but not imported.",
    ),
  });
  const counts = new Map<string, number>();
  for (const d of scan.documents)
    counts.set(d.objectType, (counts.get(d.objectType) ?? 0) + 1);
  el.createEl("p", {
    text: [...counts].map(([kind, count]) => `${kind}: ${count}`).join(" · "),
  });
  for (const error of scan.sources.filter((s) => s.error))
    el.createEl("p", { text: error.error, cls: "feishu-sync-error" });
}

class ConfigureApplicationModal extends Modal {
  private appId: string;
  private appSecret = "";

  constructor(
    app: App,
    private readonly plugin: FeishuLarkSyncPlugin,
  ) {
    super(app);
    this.appId = plugin.settings.appId;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl("h2", { text: t("modal.bind.title") });
    contentEl.createEl("p", {
      text: t("modal.bind.desc"),
    });

    new Setting(contentEl).setName(t("modal.bind.appId")).addText((text) =>
      text
        .setPlaceholder(APP_ID_EXAMPLE)
        .setValue(this.appId)
        .onChange((value) => {
          this.appId = value.trim();
        }),
    );

    new Setting(contentEl)
      .setName(t("modal.bind.appSecret"))
      .addText((text: TextComponent) => {
        text.inputEl.type = "password";
        text
          .setPlaceholder(t("modal.bind.secretPlaceholder"))
          .onChange((value) => {
            this.appSecret = value;
          });
      });

    new Setting(contentEl)
      .addButton((button) =>
        button.setButtonText(t("common.cancel")).onClick(() => this.close()),
      )
      .addButton((button) =>
        button
          .setCta()
          .setButtonText(t("modal.bind.action"))
          .onClick(async () => {
            button.setDisabled(true);
            try {
              await this.plugin.configureApplication(
                this.appId,
                this.appSecret,
              );
              new Notice(t("notice.bindSuccess"));
              this.close();
            } catch (error) {
              new Notice(this.plugin.errorMessage(error));
              button.setDisabled(false);
            }
          }),
      );
  }

  onClose(): void {
    this.appSecret = "";
    this.contentEl.empty();
  }
}

class AuthorizationModal extends Modal {
  constructor(
    app: App,
    private readonly plugin: FeishuLarkSyncPlugin,
    private readonly request: AuthorizationRequest,
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl("h2", { text: t("modal.auth.title") });
    contentEl.createEl("p", {
      text: t("modal.auth.desc"),
    });
    const link = contentEl.createEl("a", {
      cls: "feishu-lark-sync-auth-link",
      text: this.request.verificationUrl,
      href: this.request.verificationUrl,
    });
    link.target = "_blank";
    link.rel = "noopener noreferrer";

    new Setting(contentEl)
      .addButton((button) =>
        button.setButtonText(t("modal.auth.copy")).onClick(async () => {
          await navigator.clipboard.writeText(this.request.verificationUrl);
          new Notice(t("notice.linkCopied"));
        }),
      )
      .addButton((button) =>
        button
          .setCta()
          .setButtonText(t("modal.auth.complete"))
          .onClick(async () => {
            button.setDisabled(true);
            try {
              await this.plugin.completeAuthorization(this.request.deviceCode);
              new Notice(t("notice.authSuccess"));
              this.close();
            } catch (error) {
              new Notice(this.plugin.errorMessage(error));
              button.setDisabled(false);
            }
          }),
      );
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
