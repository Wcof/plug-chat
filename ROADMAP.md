# 当前状态

正在实现 Plug Chat 首版。当前目录为新项目；已核对 DeepSeekBox（现名 PlugBox）的组合包与分层规范，正在核对本机 DSH 和 ZCode 的原生浏览器及 Session 接口。

## 进行中

- 宿主接口核对、架构与验收清单：见 `docs/implementation-plan.md`。
- 多 Chat 管理、五个站点提取适配、指定 Session 传输和去重。
- 原生面板、打包、测试与可用性验证。
- 按用户授权创建 Wcof/plug-chat 仓库；可见性待用户回答，默认私有。

## 待确认

- “DeepSeek、Harness、zcode”是否均指 DSH 兼容宿主；ChatX 的确切参考项目。
- 五个站点真实登录后的提取与网页交互验证需要用户可用的登录状态，夹具通过不等于真实站点通过。

## 最近完成

- 修复 Client 模块注册契约：factory 返回值补齐顶层 `inject = ['sessions','slots','locale']`，`apply` 改为先注册 `main` 再注册 `sidebar.panellist`，与官方插件一致；移除未注册的 locale 命名空间。
- `validate:bundle` 增加注册契约校验；新增源码与 `client.js` 产物两层契约测试。

## 最近验证

- `npm run check` 通过（26 项测试、构建、组合包校验）。
- 已把本机 profile 的 `plug-chat` 依赖从旧提交更新到修复提交，并同步已安装 `client.js`（哈希与仓库一致）；宿主需重启后加载新模块。
- 仍未完成：在真实宿主界面确认侧栏入口出现、以及五个站点的真实登录提取。
