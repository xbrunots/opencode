import DOMPurify from "dompurify"

/** Render untrusted HTML without scripts, network resources or automatic redirects. */
export function safeHtmlPreview(source: string) {
  const clean = DOMPurify(window).sanitize(source, {
    FORBID_TAGS: ["script", "meta", "base", "link", "iframe", "object", "embed", "form"],
    FORBID_ATTR: ["href", "srcset", "action", "formaction"],
  })
  const policy = "default-src 'none'; style-src 'unsafe-inline'; img-src data:; media-src data:; font-src data:; form-action 'none'; base-uri 'none'"
  return `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="${policy}"></head><body>${clean}</body></html>`
}
