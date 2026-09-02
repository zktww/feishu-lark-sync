# Privacy and data handling / 隐私与数据处理

## 简体中文

本插件将飞书/Lark 文档拉取到你选择的 Obsidian 知识库。使用时需要你自己的飞书/Lark 应用、用户授权，以及单独安装的官方 `lark-cli`。插件不提供中转服务器，不包含分析统计、广告或遥测代码，也不会自动安装或更新 CLI。Obsidian、CLI、飞书/Lark 和知识库同步服务各有自己的隐私政策。

### 网络与授权

- 插件通过 CLI 联系飞书/Lark 的开放 API 和授权服务；完成绑定、用户登录是显式操作。**文档操作只读**，不更新或删除远端文档。
- 请求的用户权限为 `wiki:wiki:readonly`、`docx:document:readonly`、`drive:drive:readonly`。应用管理员也需开通相应权限；以前由其他工具授予的更大权限不会被本插件自动撤销。
- 本地下载模式下，插件直接请求文档中引用的 HTTPS 图片/附件地址，仅允许内置可信 CDN 域名或用户明确添加的域名，重定向也校验。远端链接模式下，Obsidian 显示图片时仍可能联系对应服务器。
- 网络请求会向对应服务暴露 IP 地址和请求的资源。插件不会把笔记发送到维护者或 AI 服务。

### 本地文件、凭据与知识库外访问

- App Secret 通过子进程标准输入交给 CLI，插件本身不将 App Secret 或 OAuth Access/Refresh Token 保存到设置。**CLI 会在知识库之外管理自己的配置、Profile 和凭据**；具体位置与平台/CLI 版本有关，官方 CLI 使用系统原生凭据存储。不要把“插件不保存密钥”理解为电脑上完全不保存凭据。
- 插件会执行配置的本地 CLI 程序，使用 `shell: false`，继承必要的进程环境并调整其 PATH。该程序拥有当前用户的权限；请仅使用可信的官方可执行文件。
- `data.json` 保存 App ID、CLI 路径、Profile 名、同步源 URL/资源标识、文件映射、版本/哈希和最近 10 次运行结果。`data.backup.json`、迁移/恢复文件保留旧状态，`note-backup-*.md` 可包含完整私人笔记。
- 正文、标题、Frontmatter、附件写入所选目标目录；插件目录保存状态和冲突备份。官方 CLI 自己的 Profile、配置及凭据是本插件使用流程中明确涉及的知识库外存储。
- 远端 URL 可能带签名参数，笔记/元数据可能含私人文档链接。错误信息会脱敏，但这不等于将整个知识库匿名化。不要公开完整工作目录、诊断转储或未经检查的截图。

### 停止与删除

关闭自动同步并停用插件可停止后续同步；停用会取消进行中的 CLI/下载，但已经提交的写入不会回滚。笔记、下载附件、状态和备份不会自动删除。卸载插件并不等于撤销飞书授权或删除外部 CLI 凭据：如需撤销，请按官方 CLI 的对应 Profile 退出流程以及飞书/Lark 的应用授权管理操作，注意不要影响其他工作流。知识库同步/备份软件可能已经复制这些文件，需另外管理。

## English

This desktop plugin pulls Feishu/Lark documents into your selected vault. It requires your own app, user authorization and a separately installed official `lark-cli`. There is no maintainer-operated relay, analytics, advertising or telemetry code in the plugin. It does not install or update the CLI automatically. Obsidian, the CLI, Feishu/Lark and your backup services have their own policies.

- **Network:** the CLI contacts Feishu/Lark APIs and authorization services. App binding/login are explicit actions; document operations are read-only. Requested scopes are `wiki:wiki:readonly`, `docx:document:readonly`, `drive:drive:readonly`. Existing broader grants are not automatically revoked. Local media mode downloads from validated HTTPS CDN hosts (including explicitly trusted extra domains); rendering remote images may also make network requests. Destination services see your IP and requested resources. Notes are not sent to the maintainer or AI providers.
- **Outside-vault access:** App Secret is passed through stdin, not persisted by this plugin. The CLI owns its external profiles/configuration and credential storage; its official documentation describes OS-native credential storage. Exact locations vary by CLI version/platform. The configured executable runs with your user privileges and inherited process environment, without a shell; use only a trusted official binary.
- **Vault data:** settings include App ID, CLI path, profile, source URLs/identifiers, mappings, revisions/hashes and the last 10 runs. State backups and complete conflict-note backups live in the plugin directory. Notes and attachments live in source destination folders. URLs can contain access-bearing signatures; redacted errors do not make the vault anonymous. Do not share raw state, backups or private screenshots.
- **Retention:** disabling the plugin cancels pending CLI/download work, not already committed writes. Notes/media/backups are not automatically deleted. Uninstalling does not revoke remote authorization or remove external CLI credentials. Use the official profile-specific logout/revocation procedures, taking care of other workflows. Manage copies held by backup/sync software separately.

For security reports, see [SECURITY.md](SECURITY.md).
