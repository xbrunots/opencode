import { GlobalRegistrator } from "@happy-dom/global-registrator"
import { afterAll, beforeAll, expect, test } from "bun:test"
import { artifactReference, previewArtifact } from "./preview-artifact"

beforeAll(() => GlobalRegistrator.unregister())

afterAll(() => GlobalRegistrator.register())

const id = "art_0123456789abcdefghijklmnop"

const session = "ses_test"

test("accepts only artifact view references on the configured server", () => {
  const server = "http://127.0.0.1:1234/"
  expect(artifactReference(`/api/experimental/artifacts/${id}/view/`, server)).toEqual({ id, file: undefined })
  expect(artifactReference(`/api/experimental/artifacts/${id}/view/assets/app%20one.js`, server)).toEqual({ id, file: "assets/app one.js" })
  expect(artifactReference(`https://outside.example/api/experimental/artifacts/${id}/view/`, server)).toBeUndefined()
  expect(artifactReference(`/api/experimental/artifacts/${id}/view/%2e%2e/secrets`, server)).toBeUndefined()
  expect(artifactReference(`/api/experimental/artifacts/${id}/view/a%5cb.js`, server)).toBeUndefined()
})

test("scopes credentials and files to the selected artifact, project and session", async () => {
  const requests: string[] = []
  let owner = session

  using external = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => {
    requests.push("external")

    return new Response("not allowed")
  } })

  using backend = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: (request) => {
    const url = new URL(request.url)
    requests.push(`${request.method} ${url.pathname} ${url.searchParams.get("location[directory]")} ${request.headers.get("authorization")}`)

    if (url.pathname === "/api/experimental/artifacts") return Response.json({ data: [{ id, provider: "local", sessionID: owner, title: "Example", entry: "index.html", url: `/api/experimental/artifacts/${id}/view/`, time: { created: 1, updated: 1 } }] })

    if (url.pathname === `/api/experimental/artifacts/${id}`) return Response.json({ data: {
      info: { id, provider: "local", sessionID: owner, title: "Example", entry: "index.html", url: `/api/experimental/artifacts/${id}/view/`, time: { created: 1, updated: 1 } },
      files: { "index.html": "<h1>Example</h1>", "assets/app.js": "ok", "assets/redirect.js": "redirect", "assets/large.js": "large" },
    } })

    if (url.pathname.endsWith("/assets/redirect.js")) return Response.redirect(external.url, 302)

    if (url.pathname.endsWith("/assets/large.js")) return new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(16 * 1024 * 1024))
        controller.enqueue(new Uint8Array(16 * 1024 * 1024 + 1))
        controller.close()
      },
    }))

    if (url.pathname.endsWith("/assets/app.js")) return new Response("window.ok = true", { headers: { "Content-Type": "text/javascript", "Set-Cookie": "private=secret" } })

    return new Response("<h1>Example</h1>", { headers: { "Content-Type": "text/html" } })
  } })

  const endpoint = { id: "remote", url: backend.url.href, headers: { authorization: "Basic secret" }, sameMachine: false }
  const input = { server: endpoint, session, directory: "/work/project", path: `/api/experimental/artifacts/${id}/view/` }
  const preview = await previewArtifact(input)
  expect(preview?.entry).toBe("index.html")
  const script = await preview?.read("assets/app.js", "GET")
  expect(await script?.text()).toBe("window.ok = true")
  expect(script?.headers.get("Set-Cookie")).toBeNull()
  expect(await preview?.read("../secrets", "GET")).toBeUndefined()
  expect(await preview?.read("missing.js", "GET")).toBeUndefined()
  expect(await preview?.read("assets/redirect.js", "GET")).toBeUndefined()
  const large = await preview?.read("assets/large.js", "GET")
  await expect(large?.text()).rejects.toThrow("file.preview.tooLarge")
  expect(requests).not.toContain("external")
  expect(requests).toEqual([
    `GET /api/experimental/artifacts/${id} /work/project Basic secret`,
    `GET /api/experimental/artifacts /work/project Basic secret`,
    `GET /api/experimental/artifacts/${id}/view/assets/app.js /work/project Basic secret`,
    `GET /api/experimental/artifacts /work/project Basic secret`,
    `GET /api/experimental/artifacts/${id}/view/assets/redirect.js /work/project Basic secret`,
    `GET /api/experimental/artifacts /work/project Basic secret`,
    `GET /api/experimental/artifacts/${id}/view/assets/large.js /work/project Basic secret`,
  ])
  const before = requests.length
  const simultaneous = await Promise.all([preview?.read("assets/app.js", "GET"), preview?.read("index.html", "GET")])
  expect(simultaneous.every(Boolean)).toBe(true)
  expect(requests.slice(before).filter((request) => request.includes("GET /api/experimental/artifacts /"))).toHaveLength(1)
  expect(requests.slice(before).some((request) => request.includes(`GET /api/experimental/artifacts/${id} `))).toBe(false)
  owner = "ses_other"
  expect(await preview?.read("assets/app.js", "GET")).toBeUndefined()
  expect(requests.at(-1)).toBe(`GET /api/experimental/artifacts /work/project Basic secret`)
  owner = session
  expect(await previewArtifact({ ...input, session: "ses_other" })).toBeUndefined()
})

test("rejects artifact metadata that exceeds the preview limit, including without Content-Length", async () => {
  using backend = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(16 * 1024 * 1024))
      controller.enqueue(new Uint8Array(16 * 1024 * 1024 + 1))
      controller.close()
    },
  })) })

  await expect(previewArtifact({
    server: { id: "remote", url: backend.url.href, headers: {}, sameMachine: false },
    session,
    directory: "/work/project",
    path: `/api/experimental/artifacts/${id}/view/`,
  })).rejects.toThrow("file.preview.tooLarge")
})
