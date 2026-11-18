import { describe, expect, it } from 'vitest'
import { JSDOM } from 'jsdom'
import { extractChatDocument, buildExtractionScript, type ExtractionResult } from '../src/providers/extract'

const cases = [
  ['doubao', 'https://www.doubao.com/chat/', '<div class="message user">你好</div><div class="message assistant">你好，有什么可以帮你？</div>'],
  ['qianwen', 'https://www.qianwen.com/chat/workbench', '<div data-message-id="u" data-role="user">你好</div><div data-message-id="a" data-role="assistant">你好</div>'],
  ['deepseek', 'https://chat.deepseek.com/a/chat/s1', '<div data-message-author-role="user">保留 code</div><div data-message-author-role="assistant">收到</div>'],
  ['chatgpt', 'https://chatgpt.com/c/s1', '<div data-message-author-role="user">继续</div><div data-message-author-role="assistant">可以</div>'],
  ['gemini', 'https://gemini.google.com/app/abc', '<div data-message-id="u" data-role="user">你好</div><div data-message-id="a" data-role="model">你好</div>'],
] as const

describe('Chat extraction fixtures', () => {
  for (const [provider, url, body] of cases) it('extracts ' + provider, () => {
    const dom = new JSDOM('<!doctype html><title>Fixture</title><main>' + body + '</main>')
    const result = extractChatDocument(dom.window.document, url, provider)
    expect(result.messages).toHaveLength(2)
    expect(result.messages[0].role).toBe('user')
  })

  it('rejects unknown origins and does not use body fallback', () => {
    const dom = new JSDOM('<body>用户：秘密\\n助手：答案</body>')
    expect(() => extractChatDocument(dom.window.document, 'https://example.com', 'chatgpt')).toThrowError(/支持的 Chat/u)
    const empty = new JSDOM('<body><p>用户：秘密</p></body>')
    expect(() => extractChatDocument(empty.window.document, 'https://chatgpt.com/c/x', 'chatgpt')).toThrowError(/未找到/u)
  })

  it('builds a self-contained page script', () => {
    const script = buildExtractionScript('chatgpt')
    expect(script).toContain('messages-not-found')
    expect(script).toContain('chatgpt')
    expect(script).not.toContain('import ')
    expect(script).not.toContain('require(')
  })

  it('injected script and host extraction share one behavior', () => {
    const url = 'https://chatgpt.com/c/s1'
    const html = '<!doctype html><title>Fixture</title><main><div data-message-author-role="user">你好</div><div data-message-author-role="assistant">收到</div></main>'
    const host = extractChatDocument(new JSDOM(html, { url }).window.document, url, 'chatgpt')
    const dom = new JSDOM(html, { url, runScripts: 'outside-only' })
    const injected = dom.window.eval(buildExtractionScript('chatgpt')) as ExtractionResult
    expect(injected.ok).toBe(true)
    if (!injected.ok) throw new Error(injected.message)
    expect(injected.snapshot.messages).toEqual(host.messages)
  })

  it('rejects oversized chats on both paths', () => {
    const url = 'https://chatgpt.com/c/big'
    const many = Array.from({ length: 501 }, (_, index) => '<div data-message-author-role="user">m' + index + '</div>').join('')
    const html = '<!doctype html><main>' + many + '</main>'
    expect(() => extractChatDocument(new JSDOM(html, { url }).window.document, url, 'chatgpt')).toThrowError(/过大/u)
    const dom = new JSDOM(html, { url, runScripts: 'outside-only' })
    const injected = dom.window.eval(buildExtractionScript('chatgpt')) as ExtractionResult
    expect(injected.ok).toBe(false)
    if (injected.ok) throw new Error('应当拒绝过量 Chat')
    expect(injected.code).toBe('chat-too-large')
  })
})
