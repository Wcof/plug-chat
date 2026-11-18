import { build } from 'esbuild'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const result = await build({
  entryPoints: [path.join(root, 'src/client-entry.tsx')], bundle: true, format: 'cjs', platform: 'browser', target: 'es2022',
  external: ['react', 'react-dom', 'react-dom/client'], write: false, legalComments: 'none',
})
const bundled = result.outputFiles[0].text
const client = "window.__ModuleLoader__.load({ id: 'plug-chat', factory(require) {\n  var module = { exports: {} };\n  var exports = module.exports;\n" + bundled + "\n  return module.exports;\n} });\n"
await writeFile(path.join(root, 'client.js'), client)
console.log('built client.js')
