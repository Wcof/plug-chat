import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { getProvider, PROVIDERS, providerForUrl } from './core/providers'
import type { ChatSnapshot, ProviderId, SessionTarget, TransferMode } from './core/types'
import { TransferLedger } from './core/context'
import { buildExtractionScript, normalizeExtractionResult } from './providers/extract'
import { createDshAdapter, type DshContext, type SessionAdapter } from './adapters/dsh'

type WebviewElement = HTMLElement & {
  setAttribute(name: string, value: string): void
  loadURL(url: string): Promise<void>
  executeJavaScript(code: string, userGesture?: boolean): Promise<unknown>
  isLoading(): boolean
  getURL(): string
  getTitle(): string
}

type ChatEntry = { id: string; url: string; title: string; provider: ProviderId; snapshot?: ChatSnapshot; status?: string }

const initialChats: ChatEntry[] = PROVIDERS.map((provider) => ({ id: provider.id, url: provider.url, title: provider.name, provider: provider.id }))
const styles: Record<string, React.CSSProperties> = {
  root: { display: 'grid', gridTemplateColumns: '220px minmax(420px, 1fr) 320px', height: '100%', minHeight: 0, background: 'var(--dsw-alias-bg-base, #101214)', color: 'var(--dsw-alias-label-primary, #f4f5f6)', fontFamily: 'var(--dsw-font-family, -apple-system, BlinkMacSystemFont, sans-serif)', fontSize: 13 },
  column: { minWidth: 0, minHeight: 0, borderRight: '1px solid var(--dsw-alias-border-l3, #2d3138)', display: 'flex', flexDirection: 'column' },
  header: { height: 46, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 14px', borderBottom: '1px solid var(--dsw-alias-border-l3, #2d3138)', flex: '0 0 auto' },
  list: { overflow: 'auto', padding: 8, display: 'grid', gap: 4, alignContent: 'start' },
  button: { border: 0, borderRadius: 6, background: 'transparent', color: 'inherit', cursor: 'pointer', padding: '9px 10px', textAlign: 'left', font: 'inherit' },
  input: { border: '1px solid var(--dsw-alias-border-l2, #414751)', borderRadius: 6, background: 'var(--dsw-alias-bg-layer-1, #1b1e23)', color: 'inherit', padding: '8px 9px', font: 'inherit', minWidth: 0 },
  muted: { color: 'var(--dsw-alias-label-tertiary, #9da3ad)', fontSize: 12, lineHeight: 1.45 },
}

function IconButton({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  return <button type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick} style={{ ...styles.button, padding: 6, opacity: disabled ? .45 : 1, textAlign: 'center' }}>{label === '刷新' ? '↻' : '+'}</button>
}

function NativeBrowser({ entry, onStatus, onSnapshot, browser }: { entry: ChatEntry; onStatus: (message: string) => void; onSnapshot: (snapshot: ChatSnapshot) => void; browser?: { acquire(workspace: string): Promise<{ lease: string; partition: string }>; release(lease: string): Promise<void> } }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<WebviewElement | undefined>(undefined)
  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    let lease: string | undefined
    let disposed = false
    let element: WebviewElement | undefined
    const run = async () => {
      if (!browser) { onStatus('当前宿主没有可用的原生浏览器桥接。'); return }
      try {
        const provider = providerForUrl(entry.url)
        const reservation = await browser.acquire('plug-chat')
        lease = reservation.lease
        if (disposed) { await browser.release(lease); return }
        element = document.createElement('webview') as WebviewElement
        element.setAttribute('partition', reservation.partition)
        element.setAttribute('name', reservation.lease)
        element.setAttribute('allowpopups', '')
        element.style.cssText = 'width:100%;height:100%;border:0;display:flex;min-height:0;'
        host.replaceChildren(element)
        frameRef.current = element
        await element.loadURL(entry.url)
        onStatus(provider.name + ' 已打开；登录状态由宿主浏览器管理。')
      } catch (error) { onStatus(error instanceof Error ? error.message : '网页打开失败。') }
    }
    void run()
    return () => { disposed = true; frameRef.current = undefined; element?.remove(); if (lease) void browser?.release(lease) }
  }, [entry.id, entry.url, browser, onStatus])

  const extract = async () => {
    const element = frameRef.current
    if (!element) { onStatus('网页尚未准备好，请稍候。'); return }
    try {
      const value = await element.executeJavaScript(buildExtractionScript(entry.provider), false)
      onSnapshot(normalizeExtractionResult(value))
      onStatus('已读取当前网页中已加载的 Chat 消息。')
    } catch (error) { onStatus(error instanceof Error ? error.message : 'Chat 提取失败。') }
  }
  return <div style={{ minHeight: 0, flex: 1, display: 'grid', gridTemplateRows: '42px minmax(0, 1fr)' }}>
    <div style={{ ...styles.header, height: 42 }}><span style={styles.muted}>{entry.url}</span><button type="button" onClick={extract} style={{ ...styles.button, background: '#285fc2', padding: '6px 10px' }}>读取 Chat</button></div>
    <div ref={hostRef} style={{ minHeight: 0, position: 'relative', background: '#fff' }}><div style={{ ...styles.muted, padding: 24 }}>正在打开网页…</div></div>
  </div>
}

function ChatPanel({ ctx }: { ctx: DshContext }) {
  const [chats, setChats] = useState<ChatEntry[]>(initialChats)
  const [selected, setSelected] = useState('deepseek')
  const [urlDraft, setUrlDraft] = useState('')
  const [sessions, setSessions] = useState<SessionTarget[]>([])
  const [targetId, setTargetId] = useState('')
  const [mode, setMode] = useState<TransferMode>('incremental')
  const [recentCount, setRecentCount] = useState(10)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [instruction, setInstruction] = useState('')
  const [status, setStatus] = useState('选择一个 Chat，然后在网页中登录并读取消息。')
  const [busy, setBusy] = useState(false)
  const [, redraw] = useState(0)
  const ledger = useMemo(() => new TransferLedger(), [])
  const adapter = useMemo<SessionAdapter>(() => createDshAdapter(ctx), [ctx])
  const entry = chats.find(item => item.id === selected) ?? chats[0]
  const snapshot = entry?.snapshot
  const browser = (globalThis as typeof globalThis & { dshDesktop?: { protocolVersion: number; browser?: { acquire(workspace: string): Promise<{ lease: string; partition: string }>; release(lease: string): Promise<void> } } }).dshDesktop
  const reloadSessions = useCallback(async () => {
    try { setSessions(await adapter.listSessions()); setStatus('Session 列表已刷新。') } catch (error) { setStatus(error instanceof Error ? error.message : 'Session 列表刷新失败。') }
  }, [adapter])
  useEffect(() => { void reloadSessions() }, [reloadSessions])
  const addChat = () => {
    try {
      const provider = providerForUrl(urlDraft.trim())
      const url = new URL(urlDraft.trim()).toString()
      const id = provider.id + '-' + Date.now().toString(36)
      setChats(items => [...items, { id, url, title: provider.name, provider: provider.id }])
      setSelected(id); setUrlDraft('')
    } catch (error) { setStatus(error instanceof Error ? error.message : '请输入支持的 Chat 地址。') }
  }
  const onSnapshot = (next: ChatSnapshot) => { setChats(items => items.map(item => item.id === selected ? { ...item, title: next.title || item.title, snapshot: next, status: undefined } : item)); setSelectedIds(next.messages.map(message => message.id)) }
  const send = async () => {
    if (!snapshot || !targetId) { setStatus('请先读取 Chat，并选择目标 Session。'); return }
    const target = sessions.find(item => item.id === targetId)
    if (!target) { setStatus('目标 Session 已不在当前列表，请刷新后重选。'); return }
    setBusy(true)
    const controller = new AbortController()
    try {
      const transfer = ledger.prepare(snapshot, target, { mode, recentCount, selectedIds, instruction })
      setStatus('正在发送 ' + transfer.messages.length + ' 条消息到「' + target.title + '」…')
      await adapter.send(target.id, transfer.text, controller.signal)
      ledger.commit(transfer); redraw(value => value + 1)
      setStatus('已发送。Session 已接收外部 Chat 资料；后续模型回复由宿主处理。')
    } catch (error) { setStatus(error instanceof Error ? error.message : '发送失败；去重基线未更新。') } finally { setBusy(false) }
  }
  if (!entry) return <div style={{ padding: 24 }}>还没有 Chat。请添加一个支持的网页地址。</div>
  return <div style={styles.root}>
    <aside style={styles.column}>
      <div style={styles.header}><strong>Chat</strong><IconButton label="刷新" onClick={() => void reloadSessions()} /></div>
      <div style={{ padding: 10, display: 'flex', gap: 6 }}><input aria-label="添加 Chat 网页地址" value={urlDraft} onChange={event => setUrlDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') addChat() }} placeholder="粘贴 Chat 网页地址" style={{ ...styles.input, flex: 1 }} /><IconButton label="添加" onClick={addChat} /></div>
      <div style={styles.list}>{chats.map(item => <button key={item.id} type="button" onClick={() => setSelected(item.id)} style={{ ...styles.button, background: item.id === selected ? 'var(--dsw-alias-interactive-bg-selected, #293444)' : 'transparent' }}><span style={{ display: 'block', fontWeight: 600 }}>{item.title}</span><span style={styles.muted}>{item.url}</span>{item.snapshot && <span style={{ ...styles.muted, display: 'block', color: '#71c99b' }}>{item.snapshot.messages.length} 条已读取</span>}</button>)}</div>
    </aside>
    <main style={styles.column}><NativeBrowser entry={entry} browser={browser?.protocolVersion === 1 ? browser.browser : undefined} onStatus={setStatus} onSnapshot={onSnapshot} /></main>
    <aside style={{ ...styles.column, borderRight: 0 }}>
      <div style={styles.header}><strong>发送到 Session</strong><IconButton label="刷新" onClick={() => void reloadSessions()} /></div>
      <div style={{ padding: 14, overflow: 'auto', display: 'grid', gap: 12 }}>
        <label style={{ display: 'grid', gap: 5 }}>目标 Session<select aria-label="目标 Session" value={targetId} onChange={event => setTargetId(event.target.value)} style={styles.input}><option value="">选择 Session</option>{sessions.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
        <label style={{ display: 'grid', gap: 5 }}>发送范围<select aria-label="发送范围" value={mode} onChange={event => setMode(event.target.value as TransferMode)} style={styles.input}><option value="incremental">增量（推荐）</option><option value="all">全部消息</option><option value="recent">最近消息</option><option value="selected">指定消息</option></select></label>
        {mode === 'recent' && <label style={{ display: 'grid', gap: 5 }}>最近条数<input type="number" min={1} max={100} value={recentCount} onChange={event => setRecentCount(Number(event.target.value))} style={styles.input} /></label>}
        {mode === 'selected' && snapshot && <div style={{ display: 'grid', gap: 4, maxHeight: 190, overflow: 'auto' }}>{snapshot.messages.map(message => <label key={message.id} style={{ display: 'flex', gap: 6, alignItems: 'start', ...styles.muted }}><input type="checkbox" checked={selectedIds.includes(message.id)} onChange={event => setSelectedIds(ids => event.target.checked ? [...ids, message.id] : ids.filter(id => id !== message.id))} />{message.role === 'user' ? '用户' : '助手'}：{message.text.slice(0, 70)}</label>)}</div>}
        <label style={{ display: 'grid', gap: 5 }}>继续任务<textarea aria-label="继续任务" rows={4} maxLength={4000} value={instruction} onChange={event => setInstruction(event.target.value)} placeholder="例如：提炼这段 Chat 的决策，并继续完成实现。" style={{ ...styles.input, resize: 'vertical' }} /></label>
        <div style={{ ...styles.muted, padding: '9px 10px', background: 'var(--dsw-alias-bg-layer-1, #1b1e23)', borderRadius: 6 }}>{snapshot ? '来源：' + snapshot.title + ' · ' + snapshot.messages.length + ' 条消息' : '尚未读取 Chat'}<br />Chat 内容会作为外部资料发送；不会保存网页凭证。</div>
        <button type="button" disabled={busy || !snapshot || !targetId} onClick={() => void send()} style={{ ...styles.button, background: busy ? '#46505e' : '#285fc2', textAlign: 'center', fontWeight: 600 }}>{busy ? '发送中…' : '发送到 Session'}</button>
        <div role="status" aria-live="polite" style={{ ...styles.muted, minHeight: 45 }}>{status}</div>
      </div>
    </aside>
  </div>
}

export function apply(ctx: DshContext): void {
  const ReactRuntime = React
  ctx.inject?.(['sessions', 'locale'], (scope: DshContext) => {
    const Panel = () => <ChatPanel ctx={scope} />
    const slots = scope.slots
    slots?.inject('sidebar.panellist', () => slots.register({ name: 'sidebar.panellist', id: 'plug-chat', order: 25, label: () => 'Chat' }, () => <span aria-hidden="true">◌</span>))
    slots?.inject('main', () => slots.register({ name: 'main', key: 'plug-chat' }, Panel))
  })
  void ReactRuntime
}

export function mountStandalone(element: HTMLElement, ctx: DshContext): void { createRoot(element).render(<ChatPanel ctx={ctx} />) }
