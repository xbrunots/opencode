import { expect, test } from "bun:test"
import { Schema } from "effect"
import { MenuOpenSessionWindow } from "./ipc-rpc/menu"
import { windowBootstrapArgument, windowBootstrapFromArguments } from "./window-bootstrap"

test.each(["/server/c2lkZWNhcg/session/ses_one", "/server/a-b_c/session/ses_branch-2"])(
  "a new window receives its own validated session route: %s",
  (route) => {
    const payload = Schema.decodeUnknownSync(MenuOpenSessionWindow.payloadSchema)({ route })
    expect(
      windowBootstrapFromArguments([windowBootstrapArgument({ id: "new-window", initialUrl: payload.route })]),
    ).toEqual({ id: "new-window", initialUrl: route })
  },
)

test.each([
  "https://example.com",
  "/settings",
  "/server/a/session/ses_one?redirect=elsewhere",
  "/server/a/session/ses_one#extra",
  "/server/a/session/other",
])("the session window IPC rejects non-session navigation: %s", (route) =>
  expect(() => Schema.decodeUnknownSync(MenuOpenSessionWindow.payloadSchema)({ route })).toThrow(),
)
