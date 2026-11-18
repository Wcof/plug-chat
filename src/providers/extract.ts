import { ChatError, type ChatSnapshot, type ProviderId } from '../core/types'

export type ExtractionResult = { ok: true; snapshot: ChatSnapshot } | { ok: false; code: string; message: string }

/**
 * 自包含的网页提取函数。
 *
 * buildExtractionScript 会用 toString() 把本函数序列化后注入 webview 执行，
 * 因此它只能依赖入参和 Web 全局（URL/Set/Date/Array），不能引用任何模块级绑定。
 * extractChatDocument 在宿主侧调用同一个函数，使夹具测试与生产注入走同一条逻辑。
 */
function extractionRunner(providerId: ProviderId, href: string, doc: Document): ExtractionResult {
  const MAX_MESSAGES = 500
  const MAX_CHARACTERS = 200_000
  const selectors: Record<ProviderId, string[]> = {
    doubao: ['[data-testid*="message"]', '[class*="message"]', '[class*="Message"]'],
    qianwen: ['[data-message-id]', '[class*="message"]', '[class*="Message"]'],
    deepseek: ['[data-message-author-role]', '[class*="message"]', '[class*="Message"]'],
    chatgpt: ['[data-message-author-role]', '[data-testid^="conversation-turn"]'],
    gemini: ['[data-message-id]', '[class*="message"]', '[class*="Message"]'],
  }
  const allowed: Record<ProviderId, string> = {
    doubao: 'https://www.doubao.com', qianwen: 'https://www.qianwen.com',
    deepseek: 'https://chat.deepseek.com', chatgpt: 'https://chatgpt.com', gemini: 'https://gemini.google.com',
  }
  let origin: string
  try { origin = new URL(href).origin } catch { return { ok: false, code: 'invalid-url', message: '请输入有效的 Chat 网页地址。' } }
  if (!allowed[providerId] || origin !== allowed[providerId]) return { ok: false, code: 'unsupported-origin', message: '此页面不属于已支持的 Chat 网站。' }
  const roleOf = (node: Element): 'user' | 'assistant' | undefined => {
    const explicit = (node.getAttribute('data-message-author-role') || node.getAttribute('data-role') || node.getAttribute('data-author') || '').toLowerCase()
    if (explicit === 'user' || explicit === 'human' || explicit === 'you') return 'user'
    if (explicit === 'assistant' || explicit === 'model' || explicit === 'bot') return 'assistant'
    const label = (node.getAttribute('aria-label') || '').toLowerCase()
    if (/\b(user|you|用户)\b/u.test(label)) return 'user'
    if (/\b(assistant|model|gemini|deepseek|chatgpt|豆包|千问)\b/u.test(label)) return 'assistant'
    const classes = typeof node.className === 'string' ? node.className.toLowerCase() : ''
    if (/(^|[-_ ])(user|human)([-_ ]|$)/u.test(classes)) return 'user'
    if (/(assistant|model|bot|answer|response)/u.test(classes)) return 'assistant'
    return undefined
  }
  const cleanText = (node: Element): string => {
    const copy = node.cloneNode(true) as Element
    copy.querySelectorAll('button, textarea, input, [contenteditable="true"], [aria-hidden="true"], [data-testid*="copy"], [class*="toolbar"], [class*="Toolbar"], [class*="action"], [class*="Action"]').forEach((item) => item.remove())
    return (copy.textContent || '').replace(/\u00a0/gu, ' ').replace(/[ \t]+\n/gu, '\n').replace(/\n[ \t]+/gu, '\n').replace(/\n{3,}/gu, '\n\n').trim()
  }
  const nodes: Array<{ id: string; role: 'user' | 'assistant'; text: string }> = []
  const seen = new Set<string>()
  for (const selector of selectors[providerId]) {
    for (const node of Array.from(doc.querySelectorAll(selector))) {
      const role = roleOf(node)
      const text = cleanText(node)
      if (!role || !text || text.length > MAX_CHARACTERS) continue
      const key = role + '\u0000' + text
      if (seen.has(key)) continue
      seen.add(key)
      nodes.push({ id: node.getAttribute('data-message-id') || node.id || providerId + '-' + nodes.length, role, text })
    }
    // ChatGPT 的 conversation-turn 容器与消息节点嵌套重叠；首个精确选择器命中后不再叠加宽选择器。
    if (nodes.length > 0 && providerId === 'chatgpt') break
  }
  if (nodes.length === 0) return { ok: false, code: 'messages-not-found', message: '未找到可识别的 Chat 消息；请确认页面已加载完成。' }
  const characters = nodes.reduce((sum, item) => sum + item.text.length, 0)
  if (nodes.length > MAX_MESSAGES || characters > MAX_CHARACTERS) return { ok: false, code: 'chat-too-large', message: '当前 Chat 内容过大，请先缩小范围。' }
  return { ok: true, snapshot: {
    provider: providerId, url: href, title: doc.title || providerId, capturedAt: new Date().toISOString(),
    messages: nodes, coverage: 'loaded-messages',
    warnings: ['仅包含当前网页已加载且能识别角色的消息；虚拟化历史记录可能未包含在内。'],
  } }
}

/** 生成注入 webview 的自执行脚本；环境与来源地址由宿主在页面内提供。 */
export function buildExtractionScript(providerId: ProviderId): string {
  return '(' + extractionRunner.toString() + ')(' + JSON.stringify(providerId) + ', location.href, document)'
}

/** 宿主侧直接提取（测试与离线调用），与注入脚本共用同一实现。 */
export function extractChatDocument(doc: Document, locationUrl: string, providerId: ProviderId): ChatSnapshot {
  const result = extractionRunner(providerId, locationUrl, doc)
  if (!result.ok) throw new ChatError(result.code, result.message)
  return result.snapshot
}

export function normalizeExtractionResult(value: unknown): ChatSnapshot {
  if (!value || typeof value !== 'object' || !('ok' in value)) throw new ChatError('extract-invalid-result', '网页返回了无法识别的 Chat 数据。')
  const result = value as Record<string, unknown>
  if (result.ok === false) throw new ChatError(String(result.code || 'extract-failed'), String(result.message || 'Chat 提取失败。'))
  if (result.ok !== true || !result.snapshot) throw new ChatError('extract-invalid-result', '网页返回了无法识别的 Chat 数据。')
  return result.snapshot as ChatSnapshot
}
