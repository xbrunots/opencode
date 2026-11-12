import { BrowserWindow } from "electron"
import { Effect } from "effect"
import { MenuRpcs } from "../../shared/ipc-rpc"
import { IpcPortHandoff } from "../ipc-transport"
import { ApplicationLifecycle } from "../lifecycle"
import { runDesktopMenuAction } from "../native/menu-actions"
import { sender } from "./context"

export const menuHandlers = MenuRpcs.toLayer(
  Effect.gen(function* () {
    const handoff = yield* IpcPortHandoff
    const lifecycle = yield* ApplicationLifecycle.Service

    return MenuRpcs.of({
      MenuOpenSessionWindow: ({ route }, context) =>
        Effect.sync(() => {
          sender(handoff, context)
          lifecycle.createWindow(route)
        }),
      MenuRunAction: ({ action }, context) =>
        Effect.sync(() =>
          runDesktopMenuAction(BrowserWindow.fromWebContents(sender(handoff, context)), action, {
            createWindow: lifecycle.createWindow,
            relaunch: lifecycle.relaunch,
          }),
        ),
    })
  }),
)
