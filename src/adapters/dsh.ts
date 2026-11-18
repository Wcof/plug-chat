import type { SessionTarget } from '../core/types'

export interface DshSessionRow { id: string; displayTitle?: string; title?: string; running?: boolean; blank?: boolean }
export interface DshSessionFace {
  beginSubmission(input: { mode: 'queue' | 'steer'; text: string; attachments: readonly never[] }): { requestId: string; abandon(): void }
  prompt(content: Array<{ type: 'text'; text: string }>, mode: 'queue' | 'steer', signal?: AbortSignal, requestId?: string): Promise<{ ok: true; value: { accepted: true } } | { ok: false; error: { code?: string; message?: string } }>
}
export interface DshSessions {
  list: { getSnapshot(): { ids: string[]; byId: Record<string, DshSessionRow>; phase: string } }
  refresh(): Promise<void>
  using<T>(id: string, options: { source: 'gateway'; signal?: AbortSignal }, operation: (reference: { binding: { session: DshSessionFace } }) => T | Promise<T>): Promise<T>
}
export interface DshContext {
  sessions?: DshSessions
  workspaces?: { list: unknown }
  inject?: (names: string[], callback: (scope: DshContext) => void) => void
  slots?: { inject: (name: string, callback: () => unknown) => void; register: (...args: unknown[]) => unknown }
}

export interface SessionAdapter {
  readonly verified: boolean
  listSessions(signal?: AbortSignal): Promise<SessionTarget[]>
  send(targetId: string, text: string, signal: AbortSignal): Promise<void>
}

function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason)
  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => { cleanup(); reject(signal.reason) }
    const cleanup = (): void => signal.removeEventListener('abort', onAbort)
    signal.addEventListener('abort', onAbort, { once: true })
    promise.then((value) => { cleanup(); resolve(value) }, (error) => { cleanup(); reject(error) })
  })
}

export function createDshAdapter(ctx: DshContext): SessionAdapter {
  const sessions = ctx.sessions
  return {
    verified: true,
    async listSessions(signal = new AbortController().signal): Promise<SessionTarget[]> {
      if (!sessions) throw new Error('DSH Session 服务不可用；请确认插件运行在支持 Session 的宿主中。')
      await abortable(sessions.refresh(), signal)
      const snapshot = sessions.list.getSnapshot()
      if (snapshot.phase === 'error') throw new Error('DSH Session 列表刷新失败。')
      return snapshot.ids.map(id => {
        const row = snapshot.byId[id]
        return { id, title: row?.displayTitle || row?.title || id }
      })
    },
    async send(targetId: string, text: string, signal: AbortSignal): Promise<void> {
      if (!sessions) throw new Error('DSH Session 服务不可用；请确认插件运行在支持 Session 的宿主中。')
      if (!targetId || !text.trim()) throw new Error('目标 Session 或发送内容为空。')
      await abortable(sessions.using(targetId, { source: 'gateway', signal }, async (reference) => {
        const session = reference.binding.session
        const submission = session.beginSubmission({ mode: 'queue', text, attachments: [] })
        try {
          const result = await session.prompt([{ type: 'text', text }], 'queue', signal, submission.requestId)
          if (!result.ok) throw new Error(result.error.message || result.error.code || 'DSH Session 未接受这次发送。')
        } catch (error) { submission.abandon(); throw error }
      }), signal)
    },
  }
}
