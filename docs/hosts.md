# 宿主契约与验证边界

## DeepSeek Harness

本机 DeepSeek Harness app.asar 的 @deepseek-ai/dsh-api-session-controller 源码提供以下 Client 面：

- ctx.sessions.refresh() 刷新 Host 权威的 Session 列表。
- ctx.sessions.list.getSnapshot() 返回 ids、byId 与 phase；列表行使用 displayTitle、title 和 running。
- ctx.sessions.using(sessionId, { source: 'gateway', signal }, callback) 暂时保留一个 Session 引用，并在 callback 完成后释放。
- reference.binding.session.beginSubmission({ mode: 'queue', text, attachments: [] }) 先登记本地提交回显。
- reference.binding.session.prompt([{ type: 'text', text }], 'queue', signal, requestId) 将文本提交到该 Session。返回 { ok: true, value: { accepted: true } } 才算 Host 接收；失败不得更新 Plug Chat 的增量基线。
- globalThis.dshDesktop 在桌面宿主中带有 protocolVersion === 1 的 browser 桥接。桥接提供 acquire(workspace)、release(lease)、onOpenRequested(lease, listener)；宿主浏览器实现使用租约和隔离 partition。

依据：/Applications/DeepSeek Harness.app/Contents/Resources/app.asar 解包后的 dsh-api-session-controller/src/client/contract/session.ts、src/client/contract/sessions.ts、src/client/sessions/session.ts、src/client/sessions/service.ts，以及 dsh-client-ui-sidebar-browser/src/types.ts、src/client/electron/ElectronWebViewImpl.ts、src/client/electron/ElectronWebviewPresentation.ts。

## 支持矩阵

| 宿主/能力 | 状态 | 说明 |
|---|---|---|
| DeepSeek Harness Client Session 列表与文本发送 | 已核对接口，待插件包内实机安装验证 | 接口来自本机安装源码；未在真实用户 Session 上自动发送。 |
| DeepSeek Harness 桌面原生浏览器租约 | 已核对接口，待插件包内实机安装验证 | 提取通过 Electron webview 的 executeJavaScript；公开 bridge 只声明租约和导航。 |
| zcode 内 DSH | 待确认 | 需核对其 profile、Client 模块表、浏览器桥接和 Session 版本。 |
| 豆包、千问、DeepSeek、ChatGPT、Gemini 网页 Chat | DOM 夹具已验证，真实登录页面待验证 | 网页结构会变化；首版只读取当前页面已加载且能识别角色的消息。 |

## 重要限制

插件包把 `react`、`react-dom`、`react-dom/client` 声明为外部模块（`scripts/build.mjs` 的 `external`），由 DSH 的 `window.__ModuleLoader__` 在加载 `client.js` 时通过 `require` 注入；宿主模块表必须提供这三个模块，否则面板无法挂载。插件包本身不需要也不携带 `node_modules`，`node_modules` 仅用于本地开发与构建。

Client 模块注册契约：`client.js` 的 factory 返回值必须有顶层 `inject` 数组（本项目为 `['sessions', 'slots', 'locale']`），DSH 加载器据此把服务挂到 `apply(ctx)` 的 ctx 上；随后 `apply` 用 `ctx.slots.inject('sidebar.panellist'|'main', ...)` 注册入口，两处的 `id` 与 `key` 必须同为 `plug-chat`。**不能**改用 `ctx.inject(...)` 手动请求服务——client ctx 不保证提供该方法，配合可选链会静默跳过注册，表现为侧栏无菜单、主区无面板。`npm run check` 的 `validate:bundle` 已加入该契约校验。安装/升级后需重启宿主才会重新加载 client 模块。

网页登录和站点会话由宿主浏览器分区管理；插件不保存凭证。虚拟化历史记录可能未加载，界面会显示“仅当前已加载消息”。Chat 内容被标记为外部资料，不能覆盖 Session 的系统规则。发送操作可能触发宿主模型调用和费用，由用户点击发送明确触发。
