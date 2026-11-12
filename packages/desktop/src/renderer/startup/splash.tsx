import { Splash } from "@opencode/ui/logo"
import type { Platform } from "@opencode/app/desktop"
import { For, onCleanup, onMount } from "solid-js"
import "./splash.css"

export function LoadingSplash(props: {
  deep: boolean
  firstLaunch: boolean
  platform: Platform
  drawingPaused: boolean
  onDrawStart: () => void
  onDrawEnd: () => void
}) {
  onMount(() => {
    if (!props.drawingPaused) return
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)")
    const start = () => {
      if (document.visibilityState !== "visible" || !document.hasFocus()) return
      props.onDrawStart()
      if (motion.matches) props.onDrawEnd()
    }
    window.addEventListener("focus", start)
    document.addEventListener("visibilitychange", start)
    motion.addEventListener("change", start)
    start()
    onCleanup(() => {
      window.removeEventListener("focus", start)
      document.removeEventListener("visibilitychange", start)
      motion.removeEventListener("change", start)
    })
  })

  return (
    <div
      data-component={props.firstLaunch ? "first-launch-splash" : "startup-splash"}
      data-drawing={props.drawingPaused ? "pending" : "running"}
      data-deep={props.deep || undefined}
      class="opencodex-splash"
      aria-hidden="true"
      onAnimationEnd={(event) => {
        if (event.animationName === "splash-intro-complete") props.onDrawEnd()
      }}
    >
      <div class="splash-center">
        <div class="splash-emblem">
          <svg class="splash-orbits" viewBox="0 0 240 240" fill="none">
            <g class="splash-orbit splash-orbit-outer">
              <circle cx="120" cy="120" r="106" />
              <path d="M120 14a106 106 0 0 1 106 106" />
              <circle class="splash-orbit-node" cx="120" cy="14" r="3" />
            </g>
            <g class="splash-orbit splash-orbit-inner">
              <circle cx="120" cy="120" r="86" />
              <path d="M34 120a86 86 0 0 1 86-86" />
              <circle class="splash-orbit-node" cx="34" cy="120" r="2" />
            </g>
          </svg>
          <span class="splash-ripple splash-ripple-first" />
          <span class="splash-ripple splash-ripple-second" />
          <div class="splash-logo-entrance">
            <div class="splash-logo-core">
              <Splash class="splash-logo" />
            </div>
          </div>
        </div>
        <div class="splash-name">
          <For each={Array.from("OpenCodex")}>
            {(letter, index) => <span style={{ "--letter-index": index() }}>{letter}</span>}
          </For>
        </div>
        <div class="splash-activity">
          <i />
          <i />
          <i />
        </div>
      </div>
    </div>
  )
}
