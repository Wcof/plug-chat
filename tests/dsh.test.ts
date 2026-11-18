import { describe, expect, it, vi } from 'vitest'
import { createDshAdapter, type DshContext, type DshSessionFace, type DshSessions } from '../src/adapters/dsh'

type PromptResult = Awaited<ReturnType<DshSessionFace['prompt']>>

function face(result: PromptResult = { ok: true, value: { accepted: true } }) {
  const abandon = vi.fn()
  const beginSubmission = vi.fn(() => ({ requestId: 'req-1', abandon }))
  const prompt = vi.fn(async () => result)
  const value = { beginSubmission, prompt } as unknown as DshSessionFace
  return { value, abandon, beginSubmission, prompt }
}

function sessions(options: {
  ids?: string[]
  byId?: Record<string, { id: string; displayTitle?: string; title?: string }>
  phase?: string
  face?: DshSessionFace
} = {}): DshSessions {
  const refresh = vi.fn(async () => {})
  const getSnapshot = vi.fn(() => ({
    ids: options.ids ?? [],
    byId: options.byId ?? {},
    phase: options.phase ?? 'ready',
  }))
  const using = vi.fn(async (_id: string, _opts: unknown, operation: (reference: { binding: { session: DshSessionFace } }) => unknown) => {
    return operation({ binding: { session: options.face as DshSessionFace } })
  })
  return { refresh, list: { getSnapshot }, using } as unknown as DshSessions
}

describe('createDshAdapter', () => {
  it('reports a missing host Session service', async () => {
    const adapter = createDshAdapter({})
    await expect(adapter.listSessions()).rejects.toThrow(/Session 服务不可用/u)
    await expect(adapter.send('s1', 'hello', new AbortController().signal)).rejects.toThrow(/Session 服务不可用/u)
  })

  it('lists sessions and prefers displayTitle', async () => {
    const host = sessions({
      ids: ['a', 'b'],
      byId: { a: { id: 'a', displayTitle: 'Alpha' }, b: { id: 'b', title: 'Beta' } },
    })
    const adapter = createDshAdapter({ sessions: host } as DshContext)
    expect(await adapter.listSessions()).toEqual([{ id: 'a', title: 'Alpha' }, { id: 'b', title: 'Beta' }])
    expect(host.refresh).toHaveBeenCalled()
  })

  it('rejects when the Session list phase is error', async () => {
    const adapter = createDshAdapter({ sessions: sessions({ phase: 'error' }) } as DshContext)
    await expect(adapter.listSessions()).rejects.toThrow(/刷新失败/u)
  })

  it('submits text with beginSubmission requestId and does not abandon on accept', async () => {
    const f = face()
    const host = sessions({ face: f.value })
    const adapter = createDshAdapter({ sessions: host } as DshContext)
    await adapter.send('s1', 'hello', new AbortController().signal)
    expect(f.beginSubmission).toHaveBeenCalledWith({ mode: 'queue', text: 'hello', attachments: [] })
    expect(f.prompt).toHaveBeenCalledWith([{ type: 'text', text: 'hello' }], 'queue', expect.anything(), 'req-1')
    expect(f.abandon).not.toHaveBeenCalled()
  })

  it('abandons the submission when the host rejects', async () => {
    const f = face({ ok: false, error: { message: '拒绝' } })
    const adapter = createDshAdapter({ sessions: sessions({ face: f.value }) } as DshContext)
    await expect(adapter.send('s1', 'hello', new AbortController().signal)).rejects.toThrow(/拒绝/u)
    expect(f.abandon).toHaveBeenCalled()
  })

  it('abandons the submission when prompt throws', async () => {
    const f = face()
    f.prompt.mockRejectedValueOnce(new Error('网络错误'))
    const adapter = createDshAdapter({ sessions: sessions({ face: f.value }) } as DshContext)
    await expect(adapter.send('s1', 'hello', new AbortController().signal)).rejects.toThrow(/网络错误/u)
    expect(f.abandon).toHaveBeenCalled()
  })

  it('rejects empty target or content without touching the session', async () => {
    const f = face()
    const host = sessions({ face: f.value })
    const adapter = createDshAdapter({ sessions: host } as DshContext)
    const signal = new AbortController().signal
    await expect(adapter.send('', 'hello', signal)).rejects.toThrow(/为空/u)
    await expect(adapter.send('s1', '   ', signal)).rejects.toThrow(/为空/u)
    expect(host.using).not.toHaveBeenCalled()
  })

  it('rejects when the signal is already aborted', async () => {
    const f = face()
    const adapter = createDshAdapter({ sessions: sessions({ face: f.value }) } as DshContext)
    const controller = new AbortController()
    controller.abort()
    // 既有语义：abortable 立即拒绝；send 先进入 using，故 prompt 可能已发起，此处只断言对调用方的拒绝。
    await expect(adapter.send('s1', 'hello', controller.signal)).rejects.toThrow()
  })
})
