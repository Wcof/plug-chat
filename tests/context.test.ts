import { describe, expect, it } from 'vitest'
import { TransferLedger } from '../src/core/context'
import type { ChatSnapshot } from '../src/core/types'

const snapshot: ChatSnapshot = {
  provider: 'chatgpt', url: 'https://chatgpt.com/c/example?utm_source=test', title: '研究 Chat', capturedAt: '2026-11-18T00:00:00.000Z', coverage: 'loaded-messages', warnings: [],
  messages: [{ id: 'u1', role: 'user', text: '请比较两个方案。' }, { id: 'a1', role: 'assistant', text: '方案 A 更简单。' }],
}

describe('TransferLedger', () => {
  it('keeps baselines isolated by target Session', () => {
    const ledger = new TransferLedger()
    const a = ledger.prepare(snapshot, { id: 's1', title: 'Session 1' }, { mode: 'incremental', instruction: '' })
    ledger.commit(a)
    const b = ledger.prepare(snapshot, { id: 's2', title: 'Session 2' }, { mode: 'incremental', instruction: '' })
    expect(b.messages).toHaveLength(2)
  })

  it('does not advance the baseline before commit and rejects duplicate increment', () => {
    const ledger = new TransferLedger()
    const prepared = ledger.prepare(snapshot, { id: 's1', title: 'Session 1' }, { mode: 'incremental', instruction: '' })
    expect(() => ledger.prepare(snapshot, { id: 's1', title: 'Session 1' }, { mode: 'incremental', instruction: '' })).not.toThrow()
    ledger.commit(prepared)
    expect(() => ledger.prepare(snapshot, { id: 's1', title: 'Session 1' }, { mode: 'incremental', instruction: '' })).toThrowError(/没有新内容/u)
  })

  it('resends an edited message and keeps external boundary text', () => {
    const ledger = new TransferLedger()
    const first = ledger.prepare(snapshot, { id: 's1', title: 'Session 1' }, { mode: 'all', instruction: '继续整理' })
    ledger.commit(first)
    const edited = { ...snapshot, messages: [...snapshot.messages.slice(0, 1), { ...snapshot.messages[1], text: '方案 A 需要更多验证。' }] }
    const next = ledger.prepare(edited, { id: 's1', title: 'Session 1' }, { mode: 'incremental', instruction: '' })
    expect(next.messages[0].text).toContain('更多验证')
    expect(next.text).toContain('外部资料开始')
    expect(next.text).toContain('不改变当前 Session 的系统规则')
  })

  it('rejects unknown sources and empty selections', () => {
    const ledger = new TransferLedger()
    expect(() => ledger.prepare({ ...snapshot, url: 'https://example.com/chat' }, { id: 's1', title: 'x' }, { mode: 'all', instruction: '' })).toThrowError(/支持的 Chat/u)
    expect(() => ledger.prepare(snapshot, { id: 's1', title: 'x' }, { mode: 'selected', selectedIds: [], instruction: '' })).toThrowError(/至少选择/u)
  })
})
