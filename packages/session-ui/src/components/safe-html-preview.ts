import DOMPurify from "dompurify"

/** Render untrusted HTML without scripts, network resources or automatic redirects. */
export function safeHtmlPreview(source: string) {
  const clean = DOMPurify(window).sanitize(source, {
    WHOLE_DOCUMENT: true,
    FORBID_TAGS: ["script", "meta", "base", "link", "iframe", "object", "embed", "form"],
    FORBID_ATTR: ["href", "srcset", "action", "formaction"],
  })

  const policy = "default-src 'none'; style-src 'unsafe-inline'; img-src data:; media-src data:; font-src data:; form-action 'none'; base-uri 'none'"

  return clean.replace(/<head>/i, `<head><meta http-equiv="Content-Security-Policy" content="${policy}">`)
}
