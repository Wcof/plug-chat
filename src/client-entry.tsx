import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { PROVIDERS, providerForUrl } from './core/providers'
import type { ChatSnapshot, ProviderId, SessionTarget, TransferMode } from './core/types'
import { TransferLedger } from './core/context'
import { buildExtractionScript, normalizeExtractionResult } from './providers/extract'
import { createDshAdapter, type DshContext, type DshSidebarRight, type SessionAdapter } from './adapters/dsh'

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

const css = `
.pc-root{--pc-bg:var(--dsw-alias-bg-base,#101214);--pc-base:var(--dsw-alias-bg-base,#101214);--pc-layer:var(--dsw-alias-bg-layer-1,#1b1e23);--pc-layer2:var(--dsw-alias-bg-layer-2,#22262c);--pc-line:var(--dsw-alias-border-l3,#2d3138);--pc-line2:var(--dsw-alias-border-l2,#414751);--pc-ink:var(--dsw-alias-label-primary,#f4f5f6);--pc-ink2:var(--dsw-alias-label-secondary,#c2c7cf);--pc-ink3:var(--dsw-alias-label-tertiary,#9da3ad);--pc-sel:color-mix(in srgb,var(--dsw-alias-brand-primary,#285fc2) 14%,transparent);--pc-accent:var(--dsw-alias-button-primary-fill,#285fc2);--pc-accent-hover:var(--dsw-alias-button-primary-hover,#3a70d4);--pc-ok:var(--dsw-alias-state-success-primary,#71c99b);--pc-warn:var(--dsw-alias-state-warn-primary,#e0b25c);position:relative;overflow:hidden;display:grid;grid-template-columns:minmax(0,1fr) 320px;height:100%;min-height:0;background:var(--pc-base);color:var(--pc-ink);font:12px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;transition:grid-template-columns 160ms cubic-bezier(.2,0,0,1)}
.pc-root.side-collapsed{grid-template-columns:minmax(0,1fr) 0px}
.pc-root *{box-sizing:border-box}
.pc-main{min-width:0;min-height:0;display:flex;flex-direction:column;background:var(--pc-bg)}
.pc-top{height:48px;flex:0 0 auto;display:flex;align-items:center;gap:6px;padding:0 10px;border-bottom:1px solid var(--pc-line);background:var(--pc-base)}
.pc-tabs{display:flex;align-items:center;gap:2px;overflow:auto;flex:1;min-width:0;scrollbar-width:none}
.pc-tabs::-webkit-scrollbar{display:none}
.pc-tab{height:30px;padding:0 9px;border:0;border-radius:6px;background:transparent;color:var(--pc-ink3);font:12px/1 inherit;display:inline-flex;align-items:center;gap:6px;cursor:pointer;white-space:nowrap;transition:background-color 120ms,color 120ms}
.pc-tab:hover{color:var(--pc-ink2);background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.12))}
.pc-tab.on{color:var(--pc-ink);background:var(--pc-sel);box-shadow:inset 2px 0 0 var(--pc-accent)}
.pc-dot{width:6px;height:6px;border-radius:50%;flex:0 0 auto;background:var(--pc-ink3)}
.pc-plus{width:28px;height:28px;flex:0 0 auto;border:1px solid var(--pc-line);border-radius:6px;background:transparent;color:var(--pc-ink3);font:16px/1 inherit;cursor:pointer}
.pc-plus:hover{color:var(--pc-ink);border-color:var(--pc-line2)}
.pc-add{display:flex;gap:6px;padding:8px 10px;border-bottom:1px solid var(--pc-line);background:var(--pc-base)}
.pc-stage{flex:1;min-height:0;overflow:auto;display:flex;align-items:center;justify-content:center;padding:28px}
.pc-card{width:min(480px,100%);border:1px solid var(--pc-line);border-radius:10px;background:var(--pc-layer);padding:22px}
.pc-eyebrow{font-size:11px;color:var(--pc-ink3)}
.pc-h1{font-size:15px;font-weight:600;margin:6px 0 6px}
.pc-sub{font-size:12px;color:var(--pc-ink2);line-height:1.7}
.pc-meta{font-size:11px;color:var(--pc-ink3);line-height:1.55}
.pc-actions{display:flex;gap:8px;margin-top:16px;flex-wrap:wrap}
.pc-btn{height:32px;padding:0 12px;border-radius:6px;border:1px solid transparent;font:600 12px/1 inherit;cursor:pointer;white-space:nowrap}
.pc-btn.primary{background:var(--pc-accent);color:var(--dsw-alias-label-on-color,#fff)}
.pc-btn.ghost{background:transparent;border-color:var(--pc-line2);color:var(--pc-ink2)}
.pc-btn.primary:hover:not(:disabled){background:var(--pc-accent-hover)}
.pc-btn.ghost:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.12));color:var(--pc-ink)}
.pc-btn:disabled{opacity:.45;cursor:default}
.pc-small{height:26px;padding:0 9px;font-size:11px}
.pc-status{font-size:11px;color:var(--pc-ink3);min-height:30px;line-height:1.55;margin-top:10px}
.pc-browser{flex:1;min-height:0;display:flex;flex-direction:column}
.pc-browser-top{height:38px;flex:0 0 auto;display:flex;align-items:center;justify-content:space-between;padding:0 12px;border-bottom:1px solid var(--pc-line);background:var(--pc-base)}
.pc-browser-host{flex:1;min-height:0;background:#fff}
.pc-browser-hint{padding:24px;color:#6b7280;font-size:12px}
.pc-side{min-height:0;border-left:1px solid var(--pc-line);background:var(--pc-base);display:flex;flex-direction:column;overflow:hidden;transition:opacity 120ms}
.pc-root.side-collapsed .pc-side{opacity:0;visibility:hidden;pointer-events:none;border-left-width:0}
.pc-side-tab{display:flex;position:absolute;right:0;top:50%;transform:translateY(-50%);z-index:5;width:28px;height:104px;border:1px solid var(--pc-line);border-right:0;border-radius:6px 0 0 6px;background:var(--pc-layer);color:var(--pc-ink2);font:11px/1.2 inherit;cursor:pointer;align-items:center;justify-content:center;writing-mode:vertical-rl;letter-spacing:.08em;padding:0}
.pc-side-tab:hover{background:var(--pc-layer2);color:var(--pc-ink)}
.pc-side-head{height:44px;flex:0 0 auto;display:flex;align-items:center;justify-content:space-between;padding:0 12px;border-bottom:1px solid var(--pc-line)}
.pc-side-head strong{font-size:12px;font-weight:600}
.pc-icon{width:24px;height:24px;border:0;border-radius:5px;background:transparent;color:var(--pc-ink3);cursor:pointer;font:13px/1 inherit}
.pc-icon:hover{background:var(--pc-layer);color:var(--pc-ink)}
.pc-side-body{min-height:0;overflow:auto;padding:12px;display:grid;gap:10px;align-content:start}
.pc-group{border:1px solid var(--pc-line);border-radius:8px;background:var(--pc-layer);padding:10px 12px;display:grid;gap:8px}
.pc-label{font-size:11px;color:var(--pc-ink3)}
.pc-source{font-size:12px;color:var(--pc-ink)}
.pc-select,.pc-input,.pc-area{width:100%;border:1px solid var(--pc-line2);border-radius:6px;background:var(--pc-base);color:var(--pc-ink);font:12px/1.4 inherit;padding:0 9px;height:32px}
.pc-area{height:auto;min-height:64px;padding:8px 9px;resize:vertical}
.pc-select:focus,.pc-input:focus,.pc-area:focus,.pc-btn:focus-visible,.pc-tab:focus-visible,.pc-plus:focus-visible,.pc-icon:focus-visible{outline:2px solid var(--pc-accent);outline-offset:2px}
.pc-row{display:grid;gap:5px}
.pc-check{display:flex;gap:6px;align-items:flex-start;font-size:11px;color:var(--pc-ink2);line-height:1.45}
.pc-note{font-size:11px;color:var(--pc-warn);background:color-mix(in srgb,var(--pc-warn) 8%,transparent);border:1px solid color-mix(in srgb,var(--pc-warn) 40%,transparent);border-radius:6px;padding:8px 10px;line-height:1.55;display:grid;gap:6px}
.pc-link{border:0;background:transparent;color:var(--pc-accent);font:11px/1.4 inherit;padding:0;cursor:pointer;text-align:left}
.pc-wide{width:100%}
.pc-empty{padding:16px;border:1px dashed var(--pc-line2);border-radius:8px;color:var(--pc-ink3);font-size:11px;line-height:1.6}
@media (max-width:860px){.pc-root{grid-template-columns:1fr;grid-template-rows:minmax(0,1fr) auto}.pc-root.side-collapsed{grid-template-rows:minmax(0,1fr) 0}.pc-side{max-height:46%;border-left:0;border-top:1px solid var(--pc-line)}}
@media (prefers-reduced-motion:reduce){.pc-root,.pc-side{transition:none}}
`

function sidebarRightOf(ctx: DshContext): DshSidebarRight | undefined {
  try { return ctx.sidebarRight } catch { return undefined }
}

function colorOf(id: ProviderId): string {
  return PROVIDERS.find((provider) => provider.id === id)?.color ?? '#9da3ad'
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
        const reservation = await browser.acquire('plug-chat')
        lease = reservation.lease
        if (disposed) { await browser.release(lease); return }
        const view = document.createElement('webview') as WebviewElement
        element = view
        view.setAttribute('partition', reservation.partition)
        view.setAttribute('name', reservation.lease)
        view.setAttribute('allowpopups', '')
        // The desktop shell only attaches a guest whose src carries the lease id.
        view.setAttribute('src', 'about:blank#' + reservation.lease)
        view.style.cssText = 'width:100%;height:100%;border:0;display:flex;min-height:0;'
        host.replaceChildren(view)
        frameRef.current = view
        await new Promise<void>((resolve, reject) => {
          let timer = 0
          const cleanup = (): void => {
            view.removeEventListener('dom-ready', onReady)
            view.removeEventListener('did-fail-load', onFail)
            if (timer) window.clearTimeout(timer)
          }
          const onReady = (): void => { cleanup(); resolve() }
          const onFail = (event: Event): void => {
            const detail = event as Event & { errorCode?: number; errorDescription?: string }
            if (detail.errorCode === -3) return
            cleanup()
            reject(new Error(detail.errorDescription || '官方页面加载失败。'))
          }
          view.addEventListener('dom-ready', onReady, { once: true })
          view.addEventListener('did-fail-load', onFail)
          timer = window.setTimeout(() => { cleanup(); reject(new Error('官方页面加载超时。')) }, 15000)
        })
        if (disposed) return
        await view.loadURL(entry.url)
        onStatus('已在内嵌浏览器打开；登录状态由宿主浏览器管理。')
      } catch (error) { onStatus(error instanceof Error ? error.message : '网页打开失败。') }
    }
    void run()
    return () => { disposed = true; frameRef.current = undefined; element?.remove(); if (lease) void browser?.release(lease) }
  }, [entry.id, entry.url, browser, onStatus])

  const extract = async () => {
    const view = frameRef.current
    if (!view) { onStatus('网页尚未准备好，请稍候。'); return }
    try {
      const value = await view.executeJavaScript(buildExtractionScript(entry.provider), false)
      onSnapshot(normalizeExtractionResult(value))
      onStatus('已读取当前网页中已加载的 Chat 消息。')
    } catch (error) { onStatus(error instanceof Error ? error.message : 'Chat 提取失败。') }
  }
  return <div className="pc-browser">
    <div className="pc-browser-top"><span className="pc-meta">内嵌模式 · {entry.title}</span><button type="button" className="pc-btn ghost pc-small" onClick={extract}>读取 Chat</button></div>
    <div ref={hostRef} className="pc-browser-host"><div className="pc-browser-hint">正在打开网页…</div></div>
  </div>
}

function OfficialLauncher({ entry, onOpen, onEmbed, status }: { entry: ChatEntry; onOpen: () => void; onEmbed: () => void; status: string }) {
  return <div className="pc-stage">
    <div className="pc-card">
      <div className="pc-eyebrow">当前 Chat</div>
      <div className="pc-h1">{entry.title}</div>
      <div className="pc-sub">在 DeepSeek Harness 自带的右侧浏览器中打开。登录态、Cookie、前进后退都由宿主管理，插件不重绘官方页面。</div>
      <div className="pc-meta" style={{ marginTop: 10 }}>官方浏览器模式不读取页面内容，因此「发送到 Session」暂不可用。</div>
      <div className="pc-actions">
        <button type="button" className="pc-btn primary" onClick={onOpen}>打开官方浏览器</button>
        <button type="button" className="pc-btn ghost" onClick={onEmbed}>切换到内嵌模式</button>
      </div>
      <div className="pc-status" role="status" aria-live="polite">{status}</div>
    </div>
  </div>
}

function ChatPanel({ ctx }: { ctx: DshContext }) {
  const [chats, setChats] = useState<ChatEntry[]>(initialChats)
  const [selected, setSelected] = useState('deepseek')
  const sidebarRight = sidebarRightOf(ctx)
  const [browserMode, setBrowserMode] = useState<'official' | 'embedded'>(sidebarRight ? 'official' : 'embedded')
  const [sideCollapsed, setSideCollapsed] = useState(() => {
    try { return localStorage.getItem('plug-chat:side-collapsed') === '1' } catch { return false }
  })
  const toggleSide = () => setSideCollapsed(value => {
    const next = !value
    try { localStorage.setItem('plug-chat:side-collapsed', next ? '1' : '0') } catch { /* storage may be unavailable */ }
    return next
  })
  const [adding, setAdding] = useState(false)
  const [urlDraft, setUrlDraft] = useState('')
  const [sessions, setSessions] = useState<SessionTarget[]>([])
  const [targetId, setTargetId] = useState('')
  const [mode, setMode] = useState<TransferMode>('incremental')
  const [recentCount, setRecentCount] = useState(10)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [instruction, setInstruction] = useState('')
  const [status, setStatus] = useState('选择一个 Chat，在宿主官方浏览器中打开；登录态由宿主管理。')
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
      setSelected(id); setUrlDraft(''); setAdding(false)
    } catch (error) { setStatus(error instanceof Error ? error.message : '请输入支持的 Chat 地址。') }
  }
  const openOfficial = (chat: ChatEntry) => {
    const right = sidebarRightOf(ctx)
    if (!right) { setStatus('当前宿主没有官方浏览器服务（sidebarRight 未提供）。'); return }
    try {
      right.openTab('browser', { params: { url: chat.url } })
      setStatus('已在右侧官方浏览器打开「' + chat.title + '」；登录态由宿主管理。')
    } catch (error) { setStatus(error instanceof Error ? error.message : '官方浏览器打开失败。') }
  }
  const onSnapshot = (next: ChatSnapshot) => { setChats(items => items.map(item => item.id === selected ? { ...item, title: next.title || item.title, snapshot: next, status: undefined } : item)); setSelectedIds(next.messages.map(message => message.id)) }
  const openedOnMount = useRef(false)
  useEffect(() => {
    if (openedOnMount.current) return
    openedOnMount.current = true
    if (browserMode !== 'official' || !entry) return
    openOfficial(entry)
  }, [])
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
  if (!entry) return <div className="pc-root"><style>{css}</style><div className="pc-stage"><div className="pc-empty">还没有 Chat。点右上角 + 添加一个支持的网页地址。</div></div></div>
  return <div className={'pc-root' + (sideCollapsed ? ' side-collapsed' : '')}>
    <style>{css}</style>
    <main className="pc-main">
      <div className="pc-top">
        <div className="pc-tabs">
          {chats.map(item => <button key={item.id} type="button" className={'pc-tab' + (item.id === selected ? ' on' : '')} title={item.title} onClick={() => { setSelected(item.id); if (browserMode === 'official') openOfficial(item) }}>
            <span className="pc-dot" style={{ background: colorOf(item.provider) }} />
            {item.title}
          </button>)}
        </div>
        <button type="button" className="pc-plus" aria-label="添加 Chat" title="添加 Chat" onClick={() => setAdding(value => !value)}>+</button>
      </div>
      {adding && <div className="pc-add">
        <input className="pc-input" aria-label="添加 Chat 网页地址" value={urlDraft} onChange={event => setUrlDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') addChat() }} placeholder="粘贴 Chat 网页地址" />
        <button type="button" className="pc-btn primary pc-small" onClick={addChat}>添加</button>
        <button type="button" className="pc-btn ghost pc-small" onClick={() => { setAdding(false); setUrlDraft('') }}>取消</button>
      </div>}
      {browserMode === 'official'
        ? <OfficialLauncher entry={entry} onOpen={() => openOfficial(entry)} onEmbed={() => setBrowserMode('embedded')} status={status} />
        : <NativeBrowser entry={entry} browser={browser?.protocolVersion === 1 ? browser.browser : undefined} onStatus={setStatus} onSnapshot={onSnapshot} />}
    </main>
    <aside id="pc-side" className="pc-side" aria-hidden={sideCollapsed || undefined}>
      <div className="pc-side-head"><strong>发送到 Session</strong><div style={{ display: 'flex', gap: 2 }}>
        <button type="button" className="pc-icon" aria-label="刷新 Session" title="刷新 Session" onClick={() => void reloadSessions()}>↻</button>
        <button type="button" className="pc-icon" aria-label="收起发送面板" title="收起发送面板" aria-expanded={!sideCollapsed} aria-controls="pc-side" onClick={toggleSide}>›</button>
      </div></div>
      <div className="pc-side-body">
        {browserMode === 'official'
          ? <div className="pc-note"><div>官方浏览器模式不读取页面内容。需要发送上下文时，切换到内嵌模式并重新读取。</div><button type="button" className="pc-link" onClick={() => setBrowserMode('embedded')}>切换到内嵌模式</button></div>
          : <button type="button" className="pc-link" onClick={() => setBrowserMode('official')}>切换到官方浏览器</button>}
        <div className="pc-group">
          <div className="pc-label">来源</div>
          <div className="pc-source">{snapshot ? entry.title : '尚未读取 Chat'}</div>
          <div className="pc-meta">{snapshot ? snapshot.messages.length + ' 条消息' : '内嵌模式下点「读取 Chat」'}</div>
        </div>
        <div className="pc-group">
          <div className="pc-label">目标 Session</div>
          <select className="pc-select" aria-label="目标 Session" value={targetId} onChange={event => setTargetId(event.target.value)}><option value="">选择 Session</option>{sessions.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select>
        </div>
        <div className="pc-group">
          <div className="pc-label">发送范围</div>
          <select className="pc-select" aria-label="发送范围" value={mode} onChange={event => setMode(event.target.value as TransferMode)}><option value="incremental">增量（推荐）</option><option value="all">全部消息</option><option value="recent">最近消息</option><option value="selected">指定消息</option></select>
          {mode === 'recent' && <div className="pc-row"><span className="pc-label">最近条数</span><input className="pc-input" type="number" min={1} max={100} value={recentCount} onChange={event => setRecentCount(Number(event.target.value))} /></div>}
          {mode === 'selected' && snapshot && <div style={{ display: 'grid', gap: 4, maxHeight: 160, overflow: 'auto' }}>{snapshot.messages.map(message => <label key={message.id} className="pc-check"><input type="checkbox" checked={selectedIds.includes(message.id)} onChange={event => setSelectedIds(ids => event.target.checked ? [...ids, message.id] : ids.filter(id => id !== message.id))} />{message.role === 'user' ? '用户' : '助手'}：{message.text.slice(0, 60)}</label>)}</div>}
        </div>
        <div className="pc-group">
          <div className="pc-label">继续任务</div>
          <textarea className="pc-area" aria-label="继续任务" rows={4} maxLength={4000} value={instruction} onChange={event => setInstruction(event.target.value)} placeholder="例如：提炼这段 Chat 的决策，并继续完成实现。" />
        </div>
        <button type="button" className="pc-btn primary pc-wide" disabled={busy || !snapshot || !targetId} onClick={() => void send()}>{busy ? '发送中…' : '发送到 Session'}</button>
        <div className="pc-status" role="status" aria-live="polite">{status}</div>
      </div>
    </aside>
    {sideCollapsed && <button type="button" className="pc-side-tab" aria-label="展开发送面板" aria-expanded="false" aria-controls="pc-side" onClick={toggleSide}>‹ 发送到 Session</button>}
  </div>
}

// DSH 加载器在加载 client 模块时读取顶层 inject 声明，把对应服务挂到 apply(ctx) 的 ctx 上。
// 不能改用 ctx.inject() 手动请求：client ctx 不保证提供该方法，静默失败会让侧栏与面板都不注册。
export const inject = ['sessions', 'slots', 'locale'] as const

type ClientSlots = {
  inject(name: string, register: () => unknown): void
  register(meta: Record<string, unknown>, component: React.ComponentType): unknown
}

export function apply(ctx: DshContext): void {
  const slots = ctx.slots as ClientSlots | undefined
  if (!slots) throw new Error('Plug Chat：宿主未提供 slots 服务，无法注册 Chat 面板。')
  const Panel = () => <ChatPanel ctx={ctx} />
  // 与官方插件一致：先注册 main，再注册侧栏入口；两处 id/key 必须同为 plug-chat。
  // 不声明 locale：本项目没有注册同名词典命名空间，label 直接返回字面量。
  slots.inject('main', () => slots.register({ name: 'main', key: 'plug-chat' }, Panel))
  slots.inject('sidebar.panellist', () => slots.register(
    { name: 'sidebar.panellist', id: 'plug-chat', order: 25, label: () => 'Chat' },
    () => <span aria-hidden="true">◌</span>,
  ))
}

export function mountStandalone(element: HTMLElement, ctx: DshContext): void { createRoot(element).render(<ChatPanel ctx={ctx} />) }
