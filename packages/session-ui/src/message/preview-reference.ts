const MEDIA_PATH = /\.(?:png|jpe?g|gif|webp|svg|avif|bmp|ico|mp4|m4v|webm|ogv|mov|html?)$/i
const IMAGE_URL = /\.(?:png|jpe?g|gif|webp|svg|avif|bmp|ico)$/i

/** References in preview comments retain their source and coordinates in the prompt itself. */
export function messagePreviewReferences(text: string) {
  const sources = new Set<string>()
  const add = (value: string) => {
    const source = value.trim().replace(/^@/, "")
    if (!source || /[\r\n\u0000-\u001f]/.test(source)) return
    if (/^https?:\/\//i.test(source)) {
      if (!URL.canParse(source)) return
      const url = new URL(source)
      if (url.username || url.password) return
      sources.add(url.href)
      return
    }
    if ((/^[a-z][a-z\d+.-]*:/i.test(source) && !/^[a-z]:[\\/]/i.test(source)) || /^[/\\]{2}/.test(source)) return
    if (/^\/api\/experimental\/artifacts\/art_[a-zA-Z0-9]{26}\/view\/?$/.test(source) || MEDIA_PATH.test(source))
      sources.add(source)
  }

  const reference = /\[Preview:\s*(.+?);\s*x:\s*-?\d+(?:\.\d+)?%,\s*y:\s*-?\d+(?:\.\d+)?%(?:;[^\]]*)?\]|!?\[[^\]\r\n]*\]\((?:<([^>\r\n]+)>|([^()\r\n]+))\)|`([^`\r\n]+)`|https?:\/\/[^\s<>\])]+|\/api\/experimental\/artifacts\/art_[a-zA-Z0-9]{26}\/view\/?|(?:[a-z]:[\\/])?[\p{L}\p{N}_@.\\/-]+\.(?:png|jpe?g|gif|webp|svg|avif|bmp|ico|mp4|m4v|webm|ogv|mov|html?)/giu
  for (const match of text.matchAll(reference)) add(match[1] ?? match[2] ?? match[3] ?? match[4] ?? match[0])
  return [...sources]
}

/** Use the same safe markdown preview pipeline as assistant messages. */
export function messagePreviewMarkdown(source: string) {
  if (/^https?:\/\//i.test(source) && IMAGE_URL.test(new URL(source).pathname))
    return `![${new URL(source).pathname.split("/").pop() || "image"}](<${source}>)`
  const fence = "`".repeat(Math.max(1, ...[...source.matchAll(/`+/g)].map((match) => match[0].length + 1)))
  return `${fence}${source}${fence}`
}
