# Plug Chat

Plug Chat 是面向 DeepSeek Harness 的 APP 内 Chat 工作台插件。网页对话统一称为 Chat，APP 内开发会话统一称为 Session。

它在一个原生面板里管理豆包、千问、DeepSeek、ChatGPT 和 Gemini 的网页 Chat：选择一个 Chat，在宿主浏览器中完成登录，读取当前已加载消息，再选择目标 Session 发送。发送范围支持全部、最近、指定和增量；增量基线按 Chat 与目标 Session 隔离，只在 Host 确认接收后更新。

## 安装

仓库构建后把组合包安装到 DeepSeek Harness。开发检查：

npm install
npm run check

安装或升级后需重启 DeepSeek Harness：DSH 从组合包读取 `client.js`，侧栏入口与主面板在 Client 模块加载时注册。若更新后仍看不到菜单，先确认已安装**最新版本**并重启宿主。

首版使用 DSH 原生 Client 模块表，不重复打包 React。zcode 的 DSH 版本尚未实测，不能直接宣称兼容。

## 数据边界

插件只读取支持来源的网页 DOM，不调用 Chat 网站 API，不保存 cookie、token 或密码。网页内容在发送到 Session 时会被包在“外部资料”边界中；页面里的指令不会改变 Session 系统规则。未加载的历史消息、无法识别角色的节点、输入框和工具栏不会被发送。

真实站点和真实宿主版本会变化，DOM 夹具通过不等于线上页面永远稳定。详见 docs/hosts.md。
