import { ChatError, type Provider, type ProviderId } from './types'

export const PROVIDERS: readonly Provider[] = [
  { id: 'doubao', name: '豆包', url: 'https://www.doubao.com/chat/', origins: ['https://www.doubao.com'], color: '#b64f2c' },
  { id: 'qianwen', name: '千问', url: 'https://www.qianwen.com/chat/workbench', origins: ['https://www.qianwen.com'], color: '#7250ad' },
  { id: 'deepseek', name: 'DeepSeek', url: 'https://chat.deepseek.com/', origins: ['https://chat.deepseek.com'], color: '#4265ce' },
  { id: 'chatgpt', name: 'ChatGPT', url: 'https://chatgpt.com/', origins: ['https://chatgpt.com'], color: '#16846b' },
  { id: 'gemini', name: 'Gemini', url: 'https://gemini.google.com/app', origins: ['https://gemini.google.com'], color: '#4579c4' },
]

export function providerForUrl(input: string): Provider {
  let url: URL
  try { url = new URL(input) } catch { throw new ChatError('invalid-url', '请输入有效的 Chat 网页地址。') }
  const provider = PROVIDERS.find((item) => item.origins.includes(url.origin))
  if (!provider || url.username || url.password || url.port) {
    throw new ChatError('unsupported-origin', '此地址不属于支持的 Chat 网站。')
  }
  return provider
}

export function getProvider(id: ProviderId): Provider {
  const provider = PROVIDERS.find((item) => item.id === id)
  if (!provider) throw new ChatError('unsupported-provider', '此 Chat 网站尚未适配。')
  return provider
}
