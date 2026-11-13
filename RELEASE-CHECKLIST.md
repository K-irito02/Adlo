# 发布前必做清单

> 本文件只列「发布前必须做完、且容易在收尾时遗忘」的事项。构建/测试门禁以
> [`.agents/rules/quality-gates.md`](.agents/rules/quality-gates.md) 为唯一真源，此处不复述全量命令。
> 勾选即视为已完成并已验证；未完成项不得跳过发布。

## 1. 法务与声明

- [ ] 根目录 [`LICENSE`](./LICENSE) 存在（MIT，2026 K-irito02），且随安装包一起分发
- [ ] **第三方声明（全量生成，最容易漏）**：构建期扫描 `Cargo.lock` 与 `adlo/pnpm-lock.yaml`，
      生成完整依赖清单与各自许可全文，内嵌进应用并在「关于」中提供入口（可展开 License text）。
      当前 v1 的「致谢」只是精选项，**不能替代**本项
- [ ] 抽查 3 个第三方声明的版本号/许可证与锁文件一致；清单可随依赖升级重新生成
- [ ] **第三方声明补全（当前只收录已知项）**：现仅含随包素材与移植代码
      （bklit-ui / React Symbols / Untitled UI / Devicons）；发布前把全部 npm / Cargo 依赖
      的清单与许可全文并入
- [ ] **素材来源审计**：所有随包图标、图片、字体登记「名称 / 来源 URL / 作者 / 许可 / 是否修改」；
      当前已知素材均为 MIT（React Symbols、Untitled UI、Devicons）；新增素材入库前先登记。
      其中 **Untitled UI File Icons 资源页** 的使用条款需与 GitHub 仓库的 MIT 许可再次核对
- [ ] 若界面展示 provider 第三方 Logo（DeepSeek/OpenAI 等）：确认来源与使用许可，
      在第三方声明中补商标说明（署名不等于授权，不暗示背书）
- [ ] 品牌资源复核：窗口图标与开屏均使用 Adlo 品牌；旧 Kora/可燃 资源已移除 <!-- brand-allow: historical asset check -->
- [ ] 商标表述复核：未注册时不得出现「®」「注册商标」「XX 的注册商标」等字样
- [ ] 「关于」页文案与事实一致：版本号、版权主体、官网/仓库/反馈链接、`MIT` 表述，
      不含夸大或无法验证的宣称

## 2. 仓库与链接

- [ ] 仓库 `K-irito02/Adlo` 转为公开
- [ ] 「关于」页链接逐一打开验证：网站 `https://www.xiaogans.online/`、仓库、Issues
- [ ] 产出首个 GitHub Release 后，在「关于」页补「Releases」入口
- [ ] 站点侧为 Adlo 增加独立产品页或锚点（当前 `xiaogans.online` 为作品集总入口）

## 3. 版本与构建

- [ ] 版本号升位并保持一致：`adlo/package.json`、`adlo/frontend/package.json`、
      Rust crate（`adlo/Cargo.toml` 及各 crate 的 `Cargo.toml`）
- [ ] 应用内「关于」页显示的版本与安装包版本一致
- [ ] 应用图标若已更新：`src-tauri/icons/128x128.png` 与 `adlo/frontend/public/adlo-icon.png`（关于页）同步替换
- [ ] 生产构建（`cargo tauri build`）并安装验证
- [ ] 双端一致：Tauri 桌面与浏览器模式下「关于」组行为一致（链接落点、弹窗、诊断入口）

## 4. 验证（全量门禁需用户批准）

- [ ] `pnpm run check:all`
- [ ] 桌面 E2E 冒烟（opt-in）：`pnpm run e2e:build` + `pnpm run e2e`
- [ ] 干净机器安装冒烟：首次运行向导 → 设置 →「关于」全流程
- [ ] 诊断单内容复核：应用版本、运行模式、依赖实测版本齐全（不含固定/过期版本号）

## 5. 发布物料

- [ ] Release Notes / 更新日志
- [ ] 安装包 SHA-256 校验和
- [ ] 截图与功能描述（与「关于」页事实一致）
- [ ] 发布后复核：下载安装 → 打开「关于」→ 许可全文可读、链接可达

---

## 附：MIT 许可证要点

- 只需填写两处：年份、版权持有人；正文不得删改。
- 条件：分发时必须附带版权声明与许可全文（应用内「许可」弹窗 + 根目录 `LICENSE` 共同满足）。
- 允许他人使用、修改、分发、商用与再许可；不提供任何担保。
