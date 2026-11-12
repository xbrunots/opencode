import { base64Encode } from "@opencode/util/encode"
import { useParams } from "@solidjs/router"
import { createContext, useContext, type Accessor, type ParentProps } from "solid-js"

export type SessionTarget = {
  serverKey: string
  sessionID: string
  focused: Accessor<boolean>
  root?: Accessor<HTMLElement | undefined>
}
const SessionTargetContext = createContext<SessionTarget>()

export function SessionTargetProvider(props: ParentProps<{ value: SessionTarget }>) {
  return <SessionTargetContext.Provider value={props.value}>{props.children}</SessionTargetContext.Provider>
}

/** A pane's identity stays independent of the route selected by another pane. */
export function useSessionTargetParams(): { id?: string; serverKey?: string; dir?: string } {
  const route = useParams()
  const target = useContext(SessionTargetContext)
  return {
    get dir() {
      return route.dir
    },
    get id() {
      return target ? target.sessionID : route.id
    },
    get serverKey() {
      return target ? base64Encode(target.serverKey) : route.serverKey
    },
  }
}

export function useSessionTargetFocused(): Accessor<boolean> {
  return useContext(SessionTargetContext)?.focused ?? (() => true)
}

export function useSessionTargetQuery() {
  const target = useContext(SessionTargetContext)
  return <T extends Element = HTMLElement>(selector: string) =>
    (target?.root?.() ?? document).querySelector<T>(selector)
}

/** Only the matched /server/:serverKey/session/:id route uses this required contract. */
export function useRoutedSessionTargetParams() {
  const route = useParams<{ id: string; serverKey: string }>()
  const target = useContext(SessionTargetContext)
  return {
    get id() {
      return target ? target.sessionID : route.id
    },
    get serverKey() {
      return target ? base64Encode(target.serverKey) : route.serverKey
    },
  }
}
