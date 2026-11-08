import type { ReactNode } from 'react'
import Markdown, { defaultUrlTransform, type Components } from 'react-markdown'

function safeLink(url: string) {
  const safe = defaultUrlTransform(url)
  if (!safe) return ''
  try {
    const protocol = new URL(safe, 'https://storage.invalid').protocol
    return protocol === 'https:' || protocol === 'http:' ? safe : ''
  } catch { return '' }
}

function MessageHeading({ children }: { children?: ReactNode }) {
  return <h3 className="font-semibold">{children}</h3>
}

const markdownComponents: Components = {
  p: ({ children }) => <p className="whitespace-pre-line">{children}</p>,
  ul: ({ children }) => <ul className="list-disc space-y-1 pl-5">{children}</ul>,
  ol: ({ children, start }) => <ol start={start} className="list-decimal space-y-1 pl-5">{children}</ol>,
  li: ({ children }) => <li className="pl-0.5 [&>p]:my-1">{children}</li>,
  code: ({ children }) => <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.9em]">{children}</code>,
  pre: ({ children }) => <pre tabIndex={0} aria-label="코드" className="max-w-full overflow-x-auto rounded-lg bg-muted p-3 [&_code]:bg-transparent [&_code]:p-0">{children}</pre>,
  blockquote: ({ children }) => <blockquote className="border-l-2 pl-3 text-muted-foreground">{children}</blockquote>,
  a: ({ children, href, title }) => href
    ? <a href={href} title={title} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-4 focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">{children}<span className="sr-only"> (새 탭)</span></a>
    : <span>{children}</span>,
  // Stored item photos have their own trusted cards; model text must not fetch images.
  img: ({ alt }) => <span>{alt}</span>,
  h1: MessageHeading,
  h2: MessageHeading,
  h3: MessageHeading,
  h4: MessageHeading,
  h5: MessageHeading,
  h6: MessageHeading,
}

export function ChatMessage({ role, content }: { role: 'user' | 'assistant'; content: string }) {
  if (role === 'user') return <div className="ml-auto w-fit max-w-[88%] whitespace-pre-wrap break-words rounded-2xl bg-secondary px-4 py-3 text-sm"><span className="sr-only">나: </span>{content}</div>
  return <div className="min-w-0 max-w-full break-words py-1 text-sm leading-relaxed">
    <span className="sr-only">보관 도우미: </span>
    <div className="space-y-3"><Markdown skipHtml urlTransform={safeLink} components={markdownComponents}>{content}</Markdown></div>
  </div>
}
