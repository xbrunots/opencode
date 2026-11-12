export function matchesAnnotationTarget(
  note: { serverID?: string; sessionID: string },
  target: { serverID: string; sessionID?: string },
) {
  return !!note.serverID && note.serverID === target.serverID && note.sessionID === target.sessionID
}

export type PreviewElement = {
  selector: string
  tag: string
  component?: string
  html?: string
  text?: string
  source?: { path: string; line: number; confidence?: "exact" | "inferred" }
  rect?: { x: number; y: number; width: number; height: number }
}

export function formatPreviewAnnotation(note: {
  src: string
  alt?: string
  element?: string | PreviewElement
  time?: number
  x: number
  y: number
  comment: string
  file?: { name: string }
}) {
  const source = note.src.startsWith("blob:") || note.src.startsWith("data:") ? note.alt || "attached image" : note.src
  const element = typeof note.element === "string" ? note.element : note.element?.selector
  const location = typeof note.element === "object" ? note.element.source : undefined
  const markup = typeof note.element === "object" ? note.element.html : undefined
  const component = typeof note.element === "object" ? note.element.component : undefined
  const reference = `[Preview: ${source}; x: ${note.x.toFixed(1)}%, y: ${note.y.toFixed(1)}%${element ? `; element: ${element}` : ""}${component ? `; component: ${component}` : ""}${location ? `; ${location.confidence === "inferred" ? "possible source" : "source"}: ${location.path}:${location.line}` : ""}${note.time === undefined ? "" : `; time: ${note.time.toFixed(1)}s`}${note.file ? `; screenshot: ${note.file.name}` : ""}]`

  return `${reference} ${note.comment}${markup ? `\n${markup}` : ""}`
}
