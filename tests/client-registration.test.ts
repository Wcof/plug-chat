import { describe, expect, it, vi } from 'vitest'

// 只验证注册契约，不渲染面板：ChatPanel 依赖 DOM 与宿主服务，超出本测试范围。
vi.mock('react-dom/client', () => ({ createRoot: () => ({ render: vi.fn() }) }))

import { apply, inject } from '../src/client-entry'
import type { DshContext } from '../src/adapters/dsh'

describe('DSH client 注册契约', () => {
  it('声明宿主需要注入的服务', () => {
    expect([...inject]).toEqual(['sessions', 'slots', 'locale'])
  })

  it('注册侧栏入口与主面板，且 id/key 配对', () => {
    const registered: Array<{ name: string; key?: string; id?: string; component: unknown }> = []
    const injectedSlots: string[] = []
    const ctx = {
      sessions: {
        refresh: async () => {},
        list: { getSnapshot: () => ({ ids: [], byId: {}, phase: 'ready' }) },
        using: async (_id: string, _opts: unknown, operation: (reference: unknown) => unknown) => operation({}),
      },
      slots: {
        inject: (name: string, register: () => unknown) => { injectedSlots.push(name); register() },
        register: (meta: { name: string; key?: string; id?: string }, component: unknown) => {
          registered.push({ ...meta, component })
          return meta
        },
      },
    } as unknown as DshContext
    apply(ctx)
    expect(injectedSlots).toEqual(['sidebar.panellist', 'main'])
    expect(registered).toHaveLength(2)
    expect(registered[0].name).toBe('sidebar.panellist')
    expect(registered[0].id).toBe('plug-chat')
    expect(registered[1].name).toBe('main')
    expect(registered[1].key).toBe(registered[0].id)
  })

  it('slots 缺失时明确报错，不静默跳过', () => {
    const ctx = { sessions: {} } as unknown as DshContext
    expect(() => apply(ctx)).toThrow(/slots/u)
  })
})
