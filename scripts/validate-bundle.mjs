import { access, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'))
for (const file of ['index.js', 'client.js', 'cordis.patch.yml', 'locale/zh.json', 'locale/en.json', 'icons/plug-chat.svg']) await access(path.join(root, file))
if (!manifest.dsh?.bundle?.patch || !manifest.dsh?.client?.immediately) throw new Error('package.json 缺少 DSH 组合包声明')
const client = await readFile(path.join(root, 'client.js'), 'utf8')
if (!client.includes("id: 'plug-chat'")) throw new Error('client.js 缺少模块注册')
// DSH 加载器读取 factory 返回值的顶层 inject 声明来注入服务；缺失会让侧栏与面板静默不显示。
if (!/inject:\s*\(\)\s*=>\s*inject/.test(client)) throw new Error('client.js 未导出顶层 inject 声明，宿主不会注入 slots/sessions')
if (!/\["sessions",\s*"slots",\s*"locale"\]/.test(client)) throw new Error('client.js 的 inject 声明缺少 slots/sessions/locale')
if (!client.includes('slots.inject("sidebar.panellist"') || !client.includes('slots.inject("main"')) throw new Error('client.js 缺少侧栏或主面板注册')
if (!client.includes('name: "main", key: "plug-chat"') || !client.includes('id: "plug-chat"')) throw new Error('client.js 的主面板 key 与侧栏 id 未配对')
if (!(await readFile(path.join(root, 'cordis.patch.yml'), 'utf8')).includes('id: plug-chat')) throw new Error('cordis.patch.yml 缺少模块 patch')
console.log('bundle validation passed')
