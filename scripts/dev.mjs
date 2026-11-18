import { build } from 'esbuild'
import { createServer } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// 本地开发预览：在浏览器中渲染面板，不依赖 DSH 宿主。
// 只用于查看布局与交互；所有 Session 均为明确标注的模拟数据，发送会被拒绝，
// 不会连接真实宿主、真实 Session 或任何网页站点。
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const port = Number(process.env.PORT || 5173)

const result = await build({
  entryPoints: [path.join(root, 'src/client-entry.tsx')],
  bundle: true,
  format: 'iife',
  globalName: 'PlugChatDev',
  platform: 'browser',
  target: 'es2022',
  write: false,
  legalComments: 'none',
})
// 避免内联脚本被字面量 </script> 提前闭合。
const bundle = result.outputFiles[0].text.replace(/<\/script/giu, '<\\/script')

const html = `<!doctype html>
<html lang="zh">
<head><meta charset="utf-8"><title>Plug Chat · 本地预览</title>
<style>html,body,#root{height:100%;margin:0}</style></head>
<body>
<div id="root"></div>
<script>${bundle}</script>
<script>
(function () {
  var notice = document.createElement('div');
  notice.textContent = '本地预览模式 · 模拟数据 · 不连接真实 Session 或网页站点';
  notice.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;padding:6px 12px;background:#f5c26b;color:#1a1a1a;font:13px sans-serif';
  document.body.insertBefore(notice, document.body.firstChild);

  var ctx = {
    sessions: {
      list: {
        getSnapshot: function () {
          return {
            ids: ['preview-1', 'preview-2'],
            byId: {
              'preview-1': { id: 'preview-1', displayTitle: '[预览] Session 一' },
              'preview-2': { id: 'preview-2', title: '[预览] Session 二' }
            },
            phase: 'ready'
          };
        }
      },
      refresh: function () { return Promise.resolve(); },
      using: function (id, opts, operation) {
        return Promise.resolve(operation({
          binding: {
            session: {
              beginSubmission: function () { return { requestId: 'preview', abandon: function () {} }; },
              prompt: function () {
                return Promise.resolve({ ok: false, error: { message: '本地预览模式：不会向真实 Session 发送消息。' } });
              }
            }
          }
        }));
      }
    }
  };
  PlugChatDev.mountStandalone(document.getElementById('root'), ctx);
})();
</script>
</body></html>`

createServer((_req, res) => {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
  res.end(html)
}).listen(port, () => console.log('Plug Chat 预览地址: http://localhost:' + port))
