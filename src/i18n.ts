import { getLanguage } from "obsidian";

const EN = {
  "command.checkConnection": "Check lark-cli connection",
  "command.scanSources": "Scan configured synchronization sources",
  "command.syncNow": "Synchronize Feishu & Lark now",
  "settings.milestone":
    "Synchronizes Docx documents from Wiki and Drive folders into the vault, including media, incremental updates, conflict protection, and scheduling.",
  "connection.heading": "Connection",
  "connection.cli.name": "lark-cli executable",
  "connection.cli.desc":
    "Executable name or absolute path. Commands are executed without a shell.",
  "connection.profile.name": "Profile name",
  "connection.profile.desc":
    "A dedicated lark-cli profile keeps this plugin isolated from other workflows.",
  "connection.brand.name": "Brand",
  "connection.brand.desc":
    "Use Feishu for mainland China tenants and Lark for international tenants.",
  "connection.appId.name": "App ID",
  "connection.appId.desc":
    "Stored locally in plugin settings. App Secret is never persisted by this plugin.",
  "connection.environment.name": "Environment",
  "connection.environment.desc":
    "Check whether lark-cli is installed and whether the user session is valid.",
  "connection.environment.check": "Check",
  "connection.environment.authorized": "Authorized{{user}}",
  "connection.environment.unauthorized": "Not authorized",
  "connection.bind.name": "Bind Feishu application",
  "connection.bind.desc":
    "The App Secret is passed to lark-cli through stdin and is never saved in Obsidian settings.",
  "connection.bind.button": "Configure",
  "connection.auth.name": "User authorization",
  "connection.auth.desc":
    "Request only three read-only scopes: Wiki, Docs, and Drive. No create, update, move, delete, or member-management permission is requested.",
  "connection.auth.button": "Authorize",
  "sources.heading": "Sync sources",
  "sources.desc":
    "Synchronizes Docx documents from Wiki spaces, Drive folders, or individual document links. Other resource types are discovered and skipped safely.",
  "sources.unnamed": "Unnamed source",
  "sources.defaultName": "Feishu Wiki",
  "sources.remove": "Remove source",
  "sources.name": "Name",
  "sources.link": "Feishu or Lark link",
  "sources.linkDesc":
    "The source type and internal tokens were resolved automatically from this URL.",
  "sources.changeLink": "Change link",
  "sources.type": "Source type",
  "sources.type.wiki": "Wiki",
  "sources.type.drive": "Drive folder",
  "sources.type.document": "Document",
  "sources.wikiSpaceId": "Wiki space ID",
  "sources.remoteToken": "Remote token",
  "sources.rootNode": "Root node token",
  "sources.rootNodeDesc":
    "Optional. Leave empty to scan the complete Wiki space.",
  "sources.vaultFolder": "Vault folder",
  "sources.add.name": "Add a synchronization source",
  "sources.add.wiki": "Add from link",
  "sources.scan": "Synchronize now",
  "schedule.heading": "Schedule",
  "schedule.startup.name": "Sync on startup",
  "schedule.startup.desc":
    "Synchronize enabled sources after the Obsidian workspace is ready.",
  "schedule.interval.name": "Synchronization interval",
  "schedule.interval.desc":
    "Synchronize enabled sources at this interval while Obsidian is open.",
  "schedule.interval.manual": "Manual only",
  "schedule.interval.15": "Every 15 minutes",
  "schedule.interval.30": "Every 30 minutes",
  "schedule.interval.60": "Every hour",
  "modal.bind.title": "Bind Feishu application",
  "modal.bind.desc":
    "The App Secret stays in memory only and is sent to lark-cli through stdin.",
  "modal.bind.appId": "App ID",
  "modal.bind.appSecret": "App Secret",
  "modal.bind.secretPlaceholder": "Not stored",
  "common.cancel": "Cancel",
  "modal.bind.action": "Bind",
  "notice.bindSuccess": "Feishu application profile configured.",
  "modal.auth.title": "Authorize Feishu Lark Sync",
  "modal.auth.desc":
    "Open the link and approve the three read-only Wiki, Docs, and Drive scopes, then return here to complete authorization.",
  "modal.auth.copy": "Copy link",
  "modal.auth.complete": "Complete authorization",
  "modal.source.title": "Add synchronization source",
  "modal.source.desc":
    "Paste a Wiki page, Drive folder, or document URL. The plugin will resolve its type, title, and internal tokens automatically.",
  "modal.source.link": "Feishu or Lark URL",
  "modal.source.placeholder": "https://example.feishu.cn/wiki/...",
  "modal.source.action": "Resolve and add",
  "notice.sourceAdded": "Synchronization source added: {{name}}",
  "notice.sourceUpdated": "Synchronization source updated: {{name}}",
  "notice.sourceResolveFailed": "Unable to resolve this link: {{error}}",
  "notice.linkCopied": "Authorization link copied.",
  "notice.authSuccess": "User authorization completed.",
  "notice.noSources": "No enabled synchronization sources.",
  "notice.scanning": "Scanning Feishu & Lark sources…",
  "notice.synchronizing": "Synchronizing Feishu & Lark documents…",
  "notice.scanSummary":
    "Scanned {{nodes}} nodes and found {{documents}} documents{{failures}}.",
  "notice.failedSources": "; {{count}} source(s) failed",
  "notice.scanSourceFailure": "Source “{{name}}” failed: {{error}}",
  "notice.syncSummary":
    "Synchronization complete: {{created}} created, {{updated}} updated, {{unchanged}} unchanged, {{conflicts}} conflicts, {{errors}} errors.",
  "notice.syncError": "Synchronization detail: {{error}}",
  "notice.syncFailed": "Synchronization failed: {{error}}",
  "notice.authorizedVersion": "{{version}}: authorized{{user}}.",
  "notice.authorizationRequired": "{{version}}: user authorization required.",
  "notice.cliNotInstalled": "lark-cli is not installed.",
  "common.userSuffix": " as {{name}}",
} as const;

type TranslationKey = keyof typeof EN;

const ZH_CN: Record<TranslationKey, string> = {
  "command.checkConnection": "检查 lark-cli 连接",
  "command.scanSources": "扫描已配置的同步源",
  "command.syncNow": "立即同步飞书和 Lark",
  "settings.milestone":
    "将 Wiki 和云盘文件夹中的 Docx 文档同步到知识库，支持媒体本地化、增量更新、冲突保护和定时调度。",
  "connection.heading": "连接",
  "connection.cli.name": "lark-cli 可执行文件",
  "connection.cli.desc":
    "填写可执行文件名称或绝对路径。插件不会通过 Shell 执行命令。",
  "connection.profile.name": "配置名称",
  "connection.profile.desc":
    "使用独立的 lark-cli Profile，将本插件与其他工作流隔离。",
  "connection.brand.name": "服务品牌",
  "connection.brand.desc": "中国大陆租户选择飞书，国际租户选择 Lark。",
  "connection.appId.name": "App ID",
  "connection.appId.desc":
    "App ID 保存在本地插件设置中，App Secret 不会被插件持久化。",
  "connection.environment.name": "运行环境",
  "connection.environment.desc":
    "检查 lark-cli 是否安装，以及当前用户登录是否有效。",
  "connection.environment.check": "检查",
  "connection.environment.authorized": "已授权{{user}}",
  "connection.environment.unauthorized": "尚未授权",
  "connection.bind.name": "绑定飞书应用",
  "connection.bind.desc":
    "App Secret 只会通过标准输入传给 lark-cli，不会保存在 Obsidian 设置中。",
  "connection.bind.button": "配置",
  "connection.auth.name": "用户授权",
  "connection.auth.desc":
    "仅申请知识库、文档和云盘三项只读权限，不申请创建、更新、移动、删除或成员管理权限。",
  "connection.auth.button": "授权",
  "sources.heading": "同步源",
  "sources.desc":
    "支持从 Wiki、云盘文件夹或单篇文档链接同步 Docx；其他资源类型会被发现并安全跳过。",
  "sources.unnamed": "未命名同步源",
  "sources.defaultName": "飞书知识库",
  "sources.remove": "移除同步源",
  "sources.name": "名称",
  "sources.link": "飞书或 Lark 链接",
  "sources.linkDesc": "插件已根据该链接自动解析同步源类型和内部 Token。",
  "sources.changeLink": "更换链接",
  "sources.type": "同步源类型",
  "sources.type.wiki": "知识库 Wiki",
  "sources.type.drive": "云盘文件夹",
  "sources.type.document": "单篇文档",
  "sources.wikiSpaceId": "Wiki 空间 ID",
  "sources.remoteToken": "远端 Token",
  "sources.rootNode": "根节点 Token",
  "sources.rootNodeDesc": "可选。留空表示扫描整个 Wiki 空间。",
  "sources.vaultFolder": "知识库目标目录",
  "sources.add.name": "添加同步源",
  "sources.add.wiki": "通过链接添加",
  "sources.scan": "立即同步",
  "schedule.heading": "定时同步",
  "schedule.startup.name": "启动时同步",
  "schedule.startup.desc": "Obsidian 工作区加载完成后同步所有已启用的同步源。",
  "schedule.interval.name": "同步间隔",
  "schedule.interval.desc":
    "仅在 Obsidian 打开时，按此间隔同步所有已启用的同步源。",
  "schedule.interval.manual": "仅手动",
  "schedule.interval.15": "每 15 分钟",
  "schedule.interval.30": "每 30 分钟",
  "schedule.interval.60": "每小时",
  "modal.bind.title": "绑定飞书应用",
  "modal.bind.desc":
    "App Secret 只短暂保留在内存中，并通过标准输入发送给 lark-cli。",
  "modal.bind.appId": "App ID",
  "modal.bind.appSecret": "App Secret",
  "modal.bind.secretPlaceholder": "不会保存",
  "common.cancel": "取消",
  "modal.bind.action": "绑定",
  "notice.bindSuccess": "飞书应用配置已完成。",
  "modal.auth.title": "授权 Feishu Lark Sync",
  "modal.auth.desc":
    "打开链接并确认知识库、文档和云盘三项只读权限，然后返回这里完成授权。",
  "modal.auth.copy": "复制链接",
  "modal.auth.complete": "完成授权",
  "modal.source.title": "添加同步源",
  "modal.source.desc":
    "粘贴 Wiki 页面、云盘文件夹或文档链接，插件会自动解析类型、标题和内部 Token。",
  "modal.source.link": "飞书或 Lark 链接",
  "modal.source.placeholder": "https://example.feishu.cn/wiki/...",
  "modal.source.action": "解析并添加",
  "notice.sourceAdded": "已添加同步源：{{name}}",
  "notice.sourceUpdated": "已更新同步源：{{name}}",
  "notice.sourceResolveFailed": "无法解析该链接：{{error}}",
  "notice.linkCopied": "授权链接已复制。",
  "notice.authSuccess": "用户授权已完成。",
  "notice.noSources": "没有已启用的同步源。",
  "notice.scanning": "正在扫描飞书和 Lark 同步源……",
  "notice.synchronizing": "正在同步飞书和 Lark 文档……",
  "notice.scanSummary":
    "已扫描 {{nodes}} 个节点，找到 {{documents}} 篇文档{{failures}}。",
  "notice.failedSources": "；{{count}} 个同步源失败",
  "notice.scanSourceFailure": "同步源“{{name}}”扫描失败：{{error}}",
  "notice.syncSummary":
    "同步完成：新建 {{created}}，更新 {{updated}}，未变化 {{unchanged}}，冲突 {{conflicts}}，错误 {{errors}}。",
  "notice.syncError": "同步详情：{{error}}",
  "notice.syncFailed": "同步失败：{{error}}",
  "notice.authorizedVersion": "{{version}}：已授权{{user}}。",
  "notice.authorizationRequired": "{{version}}：需要完成用户授权。",
  "notice.cliNotInstalled": "未安装或无法运行 lark-cli。",
  "common.userSuffix": "：{{name}}",
};

type TranslationVariables = Record<string, string | number>;

export function isSimplifiedChinese(language = getLanguage()): boolean {
  const normalized = language.toLowerCase().replace("_", "-");
  return (
    normalized === "zh" || normalized === "zh-cn" || normalized === "zh-hans"
  );
}

/** Bilingual labels for the status/recovery UI, following Obsidian's language. */
export function ui(zh: string, en: string): string {
  return isSimplifiedChinese() ? zh : en;
}

export function t(
  key: TranslationKey,
  variables: TranslationVariables = {},
): string {
  const template = isSimplifiedChinese() ? ZH_CN[key] : EN[key];
  return template.replace(/\{\{(\w+)\}\}/g, (_match: string, name: string) =>
    variables[name] === undefined ? "" : String(variables[name]),
  );
}
