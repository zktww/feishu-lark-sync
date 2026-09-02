# 开源准备度与后续路线

## 结论

当前项目适合保持“小型 TypeScript 单包 Obsidian 插件”结构：已有传输、同步、转换、存储、状态和 UI 边界，不需要为了开源改成 monorepo、独立后端或微服务。1.0.0 工程骨架已补齐；真实兼容性验收、仓库治理和发布身份仍需维护者确认。

## 已具备的结构

```text
src/                      生命周期、UI、授权传输、模型
  sync/                   扫描、增量同步、调度
  transform/              Markdown 转换
  vault/                  合并、存储适配、媒体安全
tests/                    合成数据的单元、集成与 DOM 回归测试
scripts/                  版本检查、许可证、白名单打包
docs/                     实际架构与发布验收清单
.github/                  跨平台 CI、依赖更新、Issue/PR 模板
README.md / README.zh-CN.md
CONTRIBUTING.md / SECURITY.md / PRIVACY.md
LICENSE / THIRD_PARTY_NOTICES.txt / CHANGELOG.md
manifest.json / versions.json / package-lock.json
.editorconfig / .nvmrc / eslint.config.mjs
```

许可证跟随实际安装的 `main.js`；CI/打包只输出白名单文件。运行状态、备份和凭据不属于源码或发布内容。贡献指南说明测试知识库、隐私检查和升级边界，安全政策不虚构维护者联系方式。

## 公开发布前必须完成

| 优先级 | 事项                                                         | 为什么不能由本地构建代替          |
| ------ | ------------------------------------------------------------ | --------------------------------- |
| P0     | 隔离 Vault 中完成飞书与 Lark 验收，记录 CLI/Obsidian/OS 版本 | 模拟 API/DOM 不等于真实兼容性     |
| P0     | 确认 GitHub 归属、提交邮箱，审查暂存文件及历史               | 邮箱和误加的文件会随提交公开      |
| P0     | 远端三系统 CI，核对 tag 和独立附件                           | 本机通过不等于 Windows/Linux 通过 |
| P0     | 启用私密漏洞报告，设置实际安全联系途径                       | 文档不能开启 GitHub 功能          |
| P0     | 按官方流程提交 Obsidian 审核                                 | lint 通过不保证完整商店审核通过   |
| P1     | 填真实仓库/问题页链接，启用分支保护和 required checks        | 需要已有仓库及维护者权限          |
| P1     | 合成数据截图、安装演示和已验证兼容矩阵                       | 降低配置成本，避免暴露私人信息    |

## 后续值得做，但不必阻塞公开测试版本

- 逐步将 `main.ts` 的冲突处理和任务编排拆成服务；先保留行为测试再拆，不同时改状态格式。
- 用 `i18n.ts` 逐步统一散落的双语 `ui()` 文案；支持更多语言时再扩展字典结构。
- 覆盖率基线、真实 CLI 输出的脱敏契约样本和兼容矩阵；未验证的版本明确标注。
- 大库/慢网压力测试和升级/回滚演练；孤立附件清理等破坏性功能必须可恢复并明确确认。
- 维护者确定后增加 `CODEOWNERS`、正式行为准则及执行联系渠道；不填虚假账号或空联系人。

暂不增加双向回写、云端中转、自动安装 CLI、AI/MCP 服务或自动清理私人备份：它们改变产品边界，不是开源目录结构的必需项。

执行路径见 [release-checklist.md](release-checklist.md)，模块细节见 [architecture.md](architecture.md)。
