import { getDirectory, getFilename } from "@opencode/util/path"
import type { OpenCodeClient } from "@opencode/client/promise"

const types = new Map([
  ["png", "image/png"],
  ["jpeg", "image/jpeg"],
  ["jpg", "image/jpeg"],
  ["gif", "image/gif"],
  ["webp", "image/webp"],
  ["svg", "image/svg+xml"],
  ["avif", "image/avif"],
  ["bmp", "image/bmp"],
  ["ico", "image/x-icon"],
])

const previewTypes = new Map([
  ["mp4", "video/mp4"],
  ["m4v", "video/mp4"],
  ["webm", "video/webm"],
  ["ogv", "video/ogg"],
  ["mov", "video/quicktime"],
  ["html", "text/html"],
  ["htm", "text/html"],
])

export const MAX_PREVIEW_BYTES = 32 * 1024 * 1024

export async function readLocalImage(
  api: Pick<OpenCodeClient, "file">,
  directory: string,
  path: string,
  signal: AbortSignal,
): Promise<Blob | undefined> {
  return readLocalFile(api, directory, path, signal, types)
}

export async function readLocalPreview(
  _api: Pick<OpenCodeClient, "file">,
  directory: string,
  path: string,
  signal: AbortSignal,
  options: { server: { url: string; password?: string }; fetch?: typeof globalThis.fetch },
): Promise<Blob | undefined> {
  const drive = /^[a-z]:[\\/]/i.test(path)
  if (/^[\\/]{2}/.test(path) || (!drive && /^[a-z][a-z\d+.-]*:/i.test(path))) return
  const type = previewTypes.get(path.match(/\.([^./]+)$/)?.[1]?.toLowerCase() ?? "")
  if (!type) return
  const absolute = drive || path.startsWith("/")
  const target = absolute ? getFilename(path) : path.replaceAll("\\", "/")
  const url = new URL(`api/fs/read/${target.split("/").map(encodeURIComponent).join("/")}`, options.server.url.endsWith("/") ? options.server.url : `${options.server.url}/`)
  url.searchParams.set("location[directory]", absolute ? getDirectory(path) : directory)
  const headers = new Headers({ Range: `bytes=0-${MAX_PREVIEW_BYTES}` })
  if (options.server.password) headers.set("Authorization", `Basic ${btoa(`opencode:${options.server.password}`)}`)
  const response = await (options.fetch ?? fetch)(url, { signal, headers })
  if (!response.ok || !response.body) throw new Error("Não foi possível carregar o arquivo para prévia.")
  const total = Number(response.headers.get("content-range")?.split("/").pop() ?? response.headers.get("content-length"))
  if (total > MAX_PREVIEW_BYTES) {
    await response.body.cancel()
    throw new Error("O arquivo excede o limite de 32 MiB para prévia. Abra-o no painel ou no aplicativo padrão.")
  }
  const reader = response.body.getReader()
  const chunks: Uint8Array<ArrayBuffer>[] = []
  let size = 0
  while (true) {
    const chunk = await reader.read()
    if (chunk.done) break
    size += chunk.value.byteLength
    if (size > MAX_PREVIEW_BYTES) {
      await reader.cancel()
      throw new Error("O arquivo excede o limite de 32 MiB para prévia. Abra-o no painel ou no aplicativo padrão.")
    }
    chunks.push(new Uint8Array(chunk.value))
  }
  return new Blob(chunks, { type })
}

async function readLocalFile(
  api: Pick<OpenCodeClient, "file">,
  directory: string,
  path: string,
  signal: AbortSignal,
  accepted: Map<string, string>,
): Promise<Blob | undefined> {
  const drive = /^[a-z]:[\\/]/i.test(path)

  if (/^[\\/]{2}/.test(path) || (!drive && /^[a-z][a-z\d+.-]*:/i.test(path))) return
  const type = accepted.get(path.match(/\.([^./]+)$/)?.[1]?.toLowerCase() ?? "")

  if (!type) return
  const absolute = drive || path.startsWith("/")

  // Scope absolute images to their parent, including files outside the project.
  const bytes = await api.file.read(
    {
      path: absolute ? getFilename(path) : path,
      location: { directory: absolute ? getDirectory(path) : directory },
    },
    { signal },
  )

  return new Blob([new Uint8Array(bytes)], { type })
}
