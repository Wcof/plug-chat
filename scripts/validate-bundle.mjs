import { access, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'))
for (const file of ['index.js', 'client.js', 'cordis.patch.yml', 'locale/zh.json', 'locale/en.json', 'icons/plug-chat.svg']) await access(path.join(root, file))
if (!manifest.dsh?.bundle?.patch || !manifest.dsh?.client?.immediately) throw new Error('package.json 缺少 DSH 组合包声明')
if (!(await readFile(path.join(root, 'client.js'), 'utf8')).includes("id: 'plug-chat'")) throw new Error('client.js 缺少模块注册')
if (!(await readFile(path.join(root, 'cordis.patch.yml'), 'utf8')).includes('id: plug-chat')) throw new Error('cordis.patch.yml 缺少模块 patch')
console.log('bundle validation passed')
