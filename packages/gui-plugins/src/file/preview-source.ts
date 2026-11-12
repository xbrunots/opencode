import { parseDocument } from "htmlparser2"

type Node = ReturnType<typeof parseDocument>["children"][number]

/** Return a line only for an unambiguous element in the original HTML, never text inside scripts. */
export function previewSourceLine(source: string, markup: string, tag?: string, id?: string) {
  if (!markup || markup.length > 16_384) return
  const matches: number[] = []
  const ids: { tag: string; offset: number }[] = []

  const visit = (node: Node) => {
    if (node.type === "tag" && node.startIndex !== null && node.endIndex !== null) {
      if (source.slice(node.startIndex, node.endIndex + 1) === markup) matches.push(node.startIndex)

      if (id && node.attribs.id === id) ids.push({ tag: node.name, offset: node.startIndex })
    }

    if ("children" in node) node.children.forEach(visit)
  }

  parseDocument(source, { withStartIndices: true, withEndIndices: true }).children.forEach(visit)
  const exact = matches.length === 1
  const offset = exact ? matches[0] : matches.length === 0 && ids.length === 1 && ids[0].tag === tag ? ids[0].offset : undefined

  if (offset === undefined) return

  return { line: source.slice(0, offset).split("\n").length, confidence: exact ? "exact" as const : "inferred" as const }
}
