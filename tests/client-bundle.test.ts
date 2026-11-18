import { readFileSync } from 'node:fs'
import path from 'node:path'
import { JSDOM } from 'jsdom'
import { describe, expect, it, vi } from 'vitest'

/**
 * 直接加载发布产物 client.js，验证它在宿主加载器视角下的注册契约。
 * 源码测试无法发现"源码已修但产物未重建"的情况，这里覆盖真实交付文件。
 */
function loadBundle(): { exports: Record<string, unknown>; id: string } {
  const code = readFileSync(path.join(process.cwd(), 'client.js'), 'utf8')
  const dom = new JSDOM('<!doctype html><html><body></body></html>')
  const win = dom.window as unknown as { __ModuleLoader__?: { load: (registration: unknown) => void } }
  let registration: { id: string; factory: (request: (specifier: string) => unknown) => Record<string, unknown> } | undefined
  win.__ModuleLoader__ = { load: (value) => { registration = value as typeof registration } }
  new Function('window', 'document', code)(win, dom.window.document)
  if (!registration) throw new Error('client.js 未向 __ModuleLoader__ 注册')
  const React = {
    __esModule: true,
    createElement: vi.fn(() => null),
    useState: () => [undefined, () => {}],
    useEffect: () => {},
    useMemo: (factory: () => unknown) => factory(),
    useRef: () => ({ current: undefined }),
    useCallback: (callback: unknown) => callback,
  }
  const request = (specifier: string): unknown => {
    if (specifier === 'react') return React
    if (specifier === 'react-dom/client') return { createRoot: () => ({ render: () => {} }) }
    throw new Error('未预期的外部模块: ' + specifier)
  }
  return { id: registration.id, exports: registration.factory(request) }
}

describe('client.js 产物契约', () => {
  it('以包名注册，并导出 inject 与 apply', () => {
    const { id, exports } = loadBundle()
    expect(id).toBe('plug-chat')
    expect(exports.inject).toEqual(['sessions', 'slots', 'locale'])
    expect(typeof exports.apply).toBe('function')
  })

  it('apply 注册 main 与 sidebar.panellist，id/key 配对', () => {
    const { exports } = loadBundle()
    const registered: Array<{ name: string; id?: string; key?: string }> = []
    const slots = {
      inject: (_name: string, register: () => unknown) => register(),
      register: (meta: { name: string; id?: string; key?: string }) => { registered.push(meta); return meta },
    }
    ;(exports.apply as (ctx: unknown) => void)({ slots })
    expect(registered.map((item) => item.name)).toEqual(['main', 'sidebar.panellist'])
    expect(registered[0].key).toBe('plug-chat')
    expect(registered[1].id).toBe('plug-chat')
  })
})
