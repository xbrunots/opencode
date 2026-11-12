import { Dialog as Kobalte, useDialogContext } from "@kobalte/core/dialog"
import { makeEventListener } from "@solid-primitives/event-listener"
import { createResizeObserver } from "@solid-primitives/resize-observer"
import { createEffect, createMemo, createSignal, For, on, onCleanup, Show, untrack } from "solid-js"
import { createStore } from "solid-js/store"
import { useDialogLayer } from "../context/dialog"
import { useI18n } from "../context/i18n"
import { Button } from "@opencode/ui/button"
import { Icon } from "@opencode/ui/icon"
import { IconButton } from "@opencode/ui/icon-button"
import { frameLoop, prefersReducedMotion, Spring, type DurationOptions } from "../motion"
import {
  createFlight,
  elementFrame,
  FLIGHT_SPRING,
  flightStyle,
  intersect,
  KICK,
  type Box,
  type FlightFrame,
} from "./image-flight"
import {
  DECODE_TIMEOUT_MS,
  INITIAL_PREVIEW_FLIGHT_STATE,
  selectAwaitingReveal,
  selectDecodeCurrent,
  selectFlightFading,
  selectFlightInteractive,
  selectFlightStage,
  selectVideoAtRest,
  transitionPreviewFlight,
  type PreviewFlightEffect,
  type PreviewFlightEvent,
} from "./image-flight-machine"
import {
  clampAxis,
  clampView,
  detailScale,
  FIT_VIEW,
  maxScale,
  panBy,
  viewBox,
  wheelZoomFactor,
  zoomAt,
  type ZoomView,
} from "./image-zoom"
import {
  INITIAL_PREVIEW_ZOOM_STATE,
  selectDragging,
  selectPanPointer,
  transitionPreviewZoom,
  type PanTarget,
  type PreviewZoomEffect,
  type PreviewZoomEvent,
} from "./image-zoom-machine"

export interface ImagePreviewProps {
  src: string
  alt?: string
  /** The image on the page that the preview grows out of and shrinks back into. */
  origin?: HTMLElement
  /**
   * A video on the page to show instead of the image. The preview borrows this element, so it keeps playing as it
   * flies out of its place and back, and returns it once the close lands.
   */
  video?: HTMLVideoElement
  /** Enables comments that are routed to this conversation's composer. */
  sessionID?: string
  /** Server that owns the conversation, to distinguish matching IDs on different connections. */
  serverID?: string
  /** Durable path or media reference when the rendered source is a temporary blob URL. */
  reference?: string
}

const STEP = Math.SQRT2

// How far up from its bottom edge a video keeps its own controls, whose drag scrubs rather than pans.
const CONTROLS = 56

// Without a flight (reduced motion, or no thumbnail to fly to), the preview only fades.
const fade = { duration: 0.15, bounce: 0 }

// How long the dialog stays mounted after a close starts, in milliseconds: the flight lands and hands the image back
// to the page well within this.
const EXIT_DURATION_MS = Math.max(FLIGHT_SPRING.duration, fade.duration) * 3200

const CENTER = { x: 0, y: 0 }

const SETTLED: PreviewFlightEvent = Object.freeze({ type: "motion.settled" })

type DrawingPoint = { x: number; y: number }

type DrawingStroke = DrawingPoint[]

type ImageMarkupDetail = { serverID?: string; sessionID: string; src: string; file: File; completion?: Promise<boolean> }

type ImageAnnotationEventDetail = { sessionID: string; serverID?: string; src: string; alt?: string; x: number; y: number; time?: number; comment: string; completion?: Promise<boolean> }

type ImageAnnotation = { x: number; y: number; left: number; top: number; text: string; time?: number; error?: boolean }

// Previews closing at once, such as one still flying home under the next, share the body's closing mark.
let closingPreviews = 0

export function ImagePreview(props: ImagePreviewProps) {
  const i18n = useI18n()
  const dialog = useDialogContext()
  const layer = useDialogLayer()
  let root!: HTMLDivElement
  let scrim!: HTMLDivElement
  let content!: HTMLDivElement
  let viewport!: HTMLDivElement
  // For a video, an empty canvas of its size: the box it fits to in the window.
  let image!: HTMLImageElement | HTMLCanvasElement
  let standIn: HTMLImageElement | undefined
  // Where a borrowed video was on the page, holding its size until it comes back.
  let holder: HTMLElement | undefined
  let surface!: HTMLDivElement
  let edge!: HTMLDivElement
  let close: HTMLButtonElement | undefined

  // Nothing shows until the image has loaded and the preview knows where it lands; while flying, a stand-in image and
  // its shadow travel above the dialog in place of the real one.
  const [flight, setFlight] = createSignal(INITIAL_PREVIEW_FLIGHT_STATE)
  const [zoom, setZoom] = createSignal(INITIAL_PREVIEW_ZOOM_STATE)
  const [annotation, setAnnotation] = createSignal<ImageAnnotation>()
  const [pendingAnnotations, setPendingAnnotations] = createSignal<ImageAnnotation[]>([])
  const [annotationMode, setAnnotationMode] = createSignal<"comment" | "markup">("comment")
  const [drawingBox, setDrawingBox] = createSignal<{ left: number; top: number; width: number; height: number }>()
  const [strokes, setStrokes] = createSignal<DrawingStroke[]>([])
  const [drawingError, setDrawingError] = createSignal(false)
  const [drawingBusy, setDrawingBusy] = createSignal(false)
  let drawingPointer: number | undefined
  const [markingVideo, setMarkingVideo] = createSignal(false)
  const [videoMarkBox, setVideoMarkBox] = createSignal<{ left: number; top: number; width: number; height: number }>()
  createEffect(() => {
    if (!props.video) return
    const video = props.video
    const marking = markingVideo() || !!annotation()

    if (marking) {
      video.style.zIndex = "49"
      video.style.pointerEvents = "none"
    } else {
      video.style.removeProperty("z-index")
      video.style.removeProperty("pointer-events")
    }

    onCleanup(() => {
      video.style.removeProperty("z-index")
      video.style.removeProperty("pointer-events")
    })
  })
  // What the view shows the controls and the stylesheet, written only when it changes rather than on every frame.
  const [shown, setShown] = createStore({ zoomed: false, ownsEscape: false, level: 100 })

  // The flight under way: where the stand-in is laid out (the flight only transforms and clips it) and the springs.
  let course: { at: Box; flight: ReturnType<typeof createFlight> } | undefined
  let flightJob: (() => void) | undefined
  let decodeTimer: ReturnType<typeof setTimeout> | undefined

  const dim = Spring.fromDuration(0, FLIGHT_SPRING)
  // Once a close lands, the stand-in fades out over the image the page shows again, so whatever the page draws over
  // its own image (a fade under a sticky bar, say) comes in softly instead of in one frame.
  const veil = Spring.fromDuration(1, FLIGHT_SPRING)

  // How far the flight has lifted off the page, as last painted: the origin's outline fades out as it rises.
  let lift = 0

  // The view: each spring's value is what shows, and its target is where an eased zoom is heading, so repeated steps
  // build on the destination rather than the frame in flight. Scale and offsets ride springs of one shape, so the point
  // under the pointer stays put; a new target mid-glide keeps the velocity it has.
  const scaleSpring = Spring.fromDuration(1, FLIGHT_SPRING)
  const xSpring = Spring.fromDuration(0, FLIGHT_SPRING)
  const ySpring = Spring.fromDuration(0, FLIGHT_SPRING)
  let glideJob: (() => void) | undefined
  // Where the pan under way last saw its pointer.
  const cursor = { x: 0, y: 0 }

  // Measured when the preview lays out rather than on every move or frame. A video zooms inside its own frame, so its
  // controls stay where they are; an image zooms out across the window.
  const natural = { width: 0, height: 0 }
  const bounds = { width: 0, height: 0, viewportWidth: 0, viewportHeight: 0, maxScale: 1 }
  let fitRatio = 1

  // Reused on every pointer move of a pan.
  const followEvent = { type: "follow" as const, zoomed: false }
  const movedEvent = { type: "pointer.moved" as const, pointerId: 0 }

  const percent = createMemo(() => new Intl.NumberFormat(i18n.locale(), { style: "percent", maximumFractionDigits: 0 }))

  const dispatchFlight = (event: PreviewFlightEvent) => {
    const prev = untrack(flight)
    const next = transitionPreviewFlight(prev, event)

    if (next.state !== prev) setFlight(next.state)
    next.effects.forEach(runFlight)
  }

  const runFlight = (effect: PreviewFlightEffect) => {
    if (effect.type === "decode.start") return decode(effect.attempt)

    if (effect.type === "decode.cancel") return clearTimeout(decodeTimer)

    if (effect.type === "video.borrow") return borrow()

    if (effect.type === "video.return") return giveBack()

    if (effect.type === "origin.hide") return home()?.setAttribute("data-image-preview-origin", "")

    if (effect.type === "origin.show") return home()?.removeAttribute("data-image-preview-origin")

    if (effect.type === "open.flight") {
      dimTo(1, FLIGHT_SPRING)
      const next = createFlight(effect.from)
      next.to(restFrame(), KICK.open, FLIGHT_SPRING)
      course = { at: place(fitted()), flight: next }
      paint()

      return run()
    }

    if (effect.type === "open.fade") {
      dimTo(1, fade)

      if (props.video) place(fitted())
      paint()

      return run()
    }

    if (effect.type === "close.flight") {
      dimTo(0, FLIGHT_SPRING)

      if (!effect.turn) course = { at: place(fitted()), flight: createFlight(restFrame()) }
      course?.flight.to(effect.to, KICK.close, FLIGHT_SPRING)
      paint()

      return run()
    }

    if (effect.type === "close.veil") {
      veil.omega = (2 * Math.PI) / (FLIGHT_SPRING.duration * 0.75)
      veil.set(0)

      return
    }

    if (effect.type === "close.fade") {
      course = undefined
      dimTo(0, fade)

      return run()
    }

    if (effect.type === "zoom.fit") return ease(FIT_VIEW)

    if (effect.type === "zoom.settle") return follow(scaleSpring.value, xSpring.value, ySpring.value)

    // See image-preview.css: the body takes clicks again while the closing flight holds the dialog mounted.
    if (effect.type === "body.closing.acquire") {
      closingPreviews++
      document.body.setAttribute("data-image-preview-closing", "")

      return
    }

    if (effect.type === "body.closing.release") {
      closingPreviews--

      if (!closingPreviews) document.body.removeAttribute("data-image-preview-closing")

      return
    }

    flightJob?.()
    flightJob = undefined
  }

  const dispatchZoom = (event: PreviewZoomEvent) => {
    const prev = untrack(zoom)
    const next = transitionPreviewZoom(prev, event)

    if (next.state !== prev) setZoom(next.state)
    next.effects.forEach(runZoom)
  }

  const runZoom = (effect: PreviewZoomEffect) => {
    if (effect.type === "pointer.capture") return panElement(effect.target).setPointerCapture(effect.pointerId)

    if (effect.type === "pointer.release") {
      const element = panElement(effect.target)

      if (element.hasPointerCapture(effect.pointerId)) element.releasePointerCapture(effect.pointerId)

      return
    }

    if (effect.type === "glide.loop.start") {
      glideJob = frameLoop.add((dt) => {
        scaleSpring.step(dt)
        xSpring.step(dt)
        ySpring.step(dt)
        paintZoom()

        if (!scaleSpring.resting || !xSpring.resting || !ySpring.resting) return true
        dispatchZoom({ type: "glide.settled", zoomed: scaleSpring.value > 1 })

        return false
      })

      return
    }

    if (effect.type === "glide.loop.stop") {
      glideJob?.()
      glideJob = undefined

      return
    }

    if (effect.type === "video.suppress-click") return suppressVideoClick()

    dialog.close()
  }

  // Writes the view to the DOM. A frame allocates nothing but the style string, and touches Solid state only when
  // the zoom level's rounded percent or whether the image is zoomed changes.
  const paintZoom = () => {
    const scale = scaleSpring.value

    if (props.video) {
      props.video.style.setProperty("object-view-box", viewBox(scale, xSpring.value, ySpring.value, bounds, natural))
    }

    if (!props.video) image.style.transform = `translate(${xSpring.value}px, ${ySpring.value}px) scale(${scale})`

    if (pendingAnnotations().length) positionPendingAnnotations()
    const level = Math.round(scale * fitRatio * 100)

    if (shown.zoomed !== scale > 1) setShown("zoomed", scale > 1)

    if (shown.level !== level) setShown("level", level)
  }

  const view = (): ZoomView => ({ scale: scaleSpring.value, x: xSpring.value, y: ySpring.value })
  const goal = (): ZoomView => ({ scale: scaleSpring.target, x: xSpring.target, y: ySpring.target })

  const own = (scale: number) => {
    if (shown.ownsEscape !== scale > 1) setShown("ownsEscape", scale > 1)
  }

  // Pinch, wheel and drag follow the hand directly and take over from an eased zoom mid-flight.
  const follow = (scale: number, x: number, y: number) => {
    followEvent.zoomed = scale > 1
    dispatchZoom(followEvent)
    scaleSpring.snap(scale)
    xSpring.snap(x)
    ySpring.snap(y)
    own(scale)
    paintZoom()
  }

  const ease = (target: ZoomView) => {
    if (prefersReducedMotion()) return follow(target.scale, target.x, target.y)
    scaleSpring.set(target.scale)
    xSpring.set(target.x)
    ySpring.set(target.y)
    own(target.scale)
    dispatchZoom({ type: "glide.start" })
  }

  const step = (factor: number) => {
    const target = goal()
    ease(zoomAt(target, target.scale * factor, CENTER, bounds))
  }

  // Kobalte keeps the content mounted while an exit animation runs; the dialog stack waits for the flight too.
  layer?.setExitDuration(EXIT_DURATION_MS)

  const decode = (attempt: number) => {
    clearTimeout(decodeTimer)
    decodeTimer = setTimeout(() => decoded(attempt), DECODE_TIMEOUT_MS)

    if (!(image instanceof HTMLImageElement)) return
    void Promise.all([image.decode(), standIn?.decode()])
      .catch(() => undefined)
      .then(() => decoded(attempt))
  }

  // Measuring where the origin shows is not free, so a decode the preview no longer waits for skips it.
  const decoded = (attempt: number) => {
    if (!selectDecodeCurrent(untrack(flight), attempt)) return
    dispatchFlight({ type: "decode.ready", attempt, origin: originFrame() })
  }

  const dimTo = (target: number, spring: DurationOptions) => {
    dim.omega = (2 * Math.PI) / spring.duration
    dim.zeta = 1 - spring.bounce
    dim.set(target)
  }

  // One job on the shared frame loop steps the flight and the backdrop together and writes them straight to the DOM.
  const run = () => {
    flightJob ??= frameLoop.add((dt) => {
      const flying = course?.flight.step(dt)
      dim.step(dt)
      veil.step(dt)
      paint()

      // The real image takes over only once the panel holding it is fully opaque, so its brightness doesn't step.
      if (course && !flying && dim.resting) {
        course = undefined
        dispatchFlight(SETTLED)
      }

      if (course || !dim.resting || !veil.resting) return true
      flightJob = undefined
      dispatchFlight(SETTLED)

      return false
    })
  }

  // The image flies as a stand-in over the preview; a video flies itself and stays where it lands.
  const flyer = () => (props.video ? holder && props.video : standIn)

  const paint = () => {
    const flying = flyer()
    // Without a flight (reduced motion, or nothing on the page to fly to) the preview only fades with the backdrop.
    const plain = selectFlightFading(untrack(flight))
    scrim.style.opacity = String(dim.value)
    surface.style.opacity = course ? "1" : "0"

    if (flying) flying.style.opacity = String(plain ? dim.value : veil.value)

    if (course) {
      const frame = course.flight.frame()
      const style = flightStyle(course.at, frame)

      if (flying) {
        flying.style.transform = style.transform
        flying.style.clipPath = style.clipPath
      }

      // The shadow and the outline are leaf boxes, so sizing them every frame stays cheap; scaling them instead would
      // stretch their corners and shadow.
      layout(surface, frame.surface, frame.surfaceRadius)
      surface.style.setProperty("--image-preview-lift", String(frame.lift))
      layout(edge, frame.clip, frame.radius)
      lift = frame.lift
    }

    // Flying, the controls arrive as the image lifts; without a flight they fade with the backdrop.
    content.style.opacity = String(plain ? dim.value : course ? lift ** 2 : dim.value ** 2)
    edge.style.opacity = String((1 - lift) * veil.value)
  }

  const place = (box: Box) => {
    const flying = flyer()

    if (!flying) return box
    flying.style.left = `${box.x}px`
    flying.style.top = `${box.y}px`
    flying.style.width = `${box.width}px`
    flying.style.height = `${box.height}px`

    return box
  }

  // Moves the video into the preview, leaving a box of its size in its place to fly back to.
  const borrow = () => {
    const video = props.video

    if (!video) return
    const rect = video.getBoundingClientRect()
    holder = document.createElement("div")
    Object.assign(holder.style, {
      flex: "none",
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      borderRadius: getComputedStyle(video).borderTopLeftRadius,
    })
    video.before(holder)
    root.moveBefore(video, null)
  }

  const giveBack = () => {
    const video = props.video

    if (!video || !holder) return

    // A page that closed under the preview, such as its tab, has nowhere to take the video back: let it go.
    if (holder.isConnected && holder.parentElement) holder.parentElement.moveBefore(video, holder)
    else dispose(video)
    holder.remove()
    holder = undefined
    ;["left", "top", "width", "height", "opacity", "transform", "clip-path", "object-view-box"].forEach((property) =>
      video.style.removeProperty(property),
    )
  }

  // The image as shown now, zoomed and panned and cropped to the viewport. There is no panel: the image is the surface.
  const restFrame = (): FlightFrame => {
    const shownBox = image.getBoundingClientRect()
    const clip = intersect(shownBox, viewport.getBoundingClientRect())
    const cropped = clip.width < shownBox.width - 0.5 || clip.height < shownBox.height - 0.5

    const radius = cropped
      ? 0
      : parseFloat(getComputedStyle(image).borderTopLeftRadius) * (props.video ? 1 : scaleSpring.value)

    return { image: shownBox, clip, radius, surface: clip, surfaceRadius: radius, lift: 1 }
  }

  // The origin's frame, cropped to the part the page shows, or nothing when it is gone, out of sight, or motion is
  // reduced.
  const originFrame = () => {
    const origin = home()

    if (prefersReducedMotion() || !origin?.isConnected || !natural.width) return
    const rect = origin.getBoundingClientRect()

    if (!rect.width || !rect.height) return
    // The dialog stack portals the preview with its overlay; both sit over the page it looks through.
    const visible = visibleBox(origin, root.closest("[data-dialog-layer]")?.parentElement ?? root)

    if (!visible) return
    const style = getComputedStyle(origin)
    // An image's outline is often an overlay, since an inset shadow does not paint over an <img>. A video brings its
    // own.
    edge.style.boxShadow = props.video
      ? "none"
      : ([style.boxShadow, getComputedStyle(origin, "::after").boxShadow].find((shadow) => shadow !== "none") ?? "none")

    return elementFrame(rect, natural, style.objectFit, parseFloat(style.borderTopLeftRadius) || 0, visible)
  }

  // The image's fitted layout box, wherever zoom has moved it. A video zooms inside its box, which stays put.
  const fitted = (): Box => {
    const shownBox = image.getBoundingClientRect()
    const x = props.video ? 0 : xSpring.value
    const y = props.video ? 0 : ySpring.value

    return {
      x: shownBox.x + shownBox.width / 2 - x - image.offsetWidth / 2,
      y: shownBox.y + shownBox.height / 2 - y - image.offsetHeight / 2,
      width: image.offsetWidth,
      height: image.offsetHeight,
    }
  }

  const home = () => holder ?? props.origin ?? props.video
  const panElement = (target: PanTarget) => (target === "video" && props.video ? props.video : viewport)

  const suppressVideoClick = () => {
    const video = props.video

    if (!video) return

    const swallow = (event: MouseEvent) => {
      event.preventDefault()
      event.stopImmediatePropagation()
    }

    // The click follows its pointerup in the same task; one that never comes must not swallow a later one.
    video.addEventListener("click", swallow, { capture: true, once: true })
    setTimeout(() => video.removeEventListener("click", swallow, { capture: true }))
  }

  onCleanup(() => {
    dispatchFlight({ type: "disposed" })
    dispatchZoom({ type: "disposed" })
  })

  const closing = () => (layer ? layer.closing() : !dialog.isOpen())

  createEffect(
    on(closing, (value) => {
      if (value) dispatchFlight({ type: "close.started", origin: originFrame() })
    }),
  )

  // From the center of the box zoom is measured in: the window's for an image, the frame's for a video.
  const point = (event: MouseEvent) => {
    const rect = (props.video ? image : viewport).getBoundingClientRect()

    return { x: event.clientX - rect.left - rect.width / 2, y: event.clientY - rect.top - rect.height / 2 }
  }

  const measure = () => {
    natural.width = image instanceof HTMLImageElement ? image.naturalWidth : image.width
    natural.height = image instanceof HTMLImageElement ? image.naturalHeight : image.height

    if (!natural.width || !image.offsetWidth) return
    bounds.width = image.offsetWidth
    bounds.height = image.offsetHeight
    bounds.viewportWidth = props.video ? image.offsetWidth : viewport.clientWidth
    bounds.viewportHeight = props.video ? image.offsetHeight : viewport.clientHeight
    fitRatio = bounds.width / natural.width
    bounds.maxScale = maxScale(fitRatio)
    const next = clampView(view(), bounds)
    follow(next.scale, next.x, next.y)

    if (!props.video) return

    // A video is ready as soon as the preview has laid out its box.
    if (selectAwaitingReveal(untrack(flight))) return dispatchFlight({ type: "video.ready", origin: originFrame() })

    if (selectVideoAtRest(untrack(flight))) place(fitted())
  }

  createResizeObserver(() => [viewport, image], measure)

  createEffect(
    on(
      () => props.src,
      () => {
        dispatchFlight({ type: "src.changed" })
        follow(FIT_VIEW.scale, FIT_VIEW.x, FIT_VIEW.y)
      },
      { defer: true },
    ),
  )

  const interactive = () => selectFlightInteractive(untrack(flight))

  const detail = (event: MouseEvent) => {
    if (!interactive()) return

    if (scaleSpring.target > 1) return ease(FIT_VIEW)
    ease(zoomAt(goal(), detailScale(fitRatio), point(event), bounds))
  }

  const mark = (left: number, top: number) => {
    if (!props.sessionID || !interactive() || drawingBusy()) return
    const bounds = image.getBoundingClientRect()

    if (!bounds.width || !bounds.height) return
    const current = annotation()

    if (current?.text.trim()) setPendingAnnotations((notes) => [...notes, current])
    setAnnotation({
      x: Math.max(0, Math.min(100, ((left - bounds.left) / bounds.width) * 100)),
      y: Math.max(0, Math.min(100, ((top - bounds.top) / bounds.height) * 100)),
      left,
      top,
      text: "",
      time: props.video?.currentTime,
    })
  }

  const startMarkup = () => {
    if (!interactive() || props.video || annotation() || pendingAnnotations().length) return
    follow(FIT_VIEW.scale, FIT_VIEW.x, FIT_VIEW.y)
    const box = image.getBoundingClientRect()

    if (!box.width || !box.height) return
    setDrawingBox({ left: box.left, top: box.top, width: box.width, height: box.height })
    setDrawingError(false)
    setAnnotationMode("markup")
  }

  const positionPendingAnnotations = () => {
    if (!root || !image) return
    const box = image.getBoundingClientRect()
    root.querySelectorAll<HTMLElement>('[data-slot="image-preview-pending-marker"]').forEach((marker) => {
      marker.style.left = `${box.left + box.width * Number(marker.dataset.x) / 100}px`
      marker.style.top = `${box.top + box.height * Number(marker.dataset.y) / 100}px`
    })
  }

  const sendComments = async () => {
    if (!props.sessionID || drawingBusy()) return
    const current = annotation()
    const pending = [...pendingAnnotations(), ...(current?.text.trim() ? [current] : [])]

    if (!pending.length) return
    setDrawingBusy(true)
    setDrawingError(false)

    for (const [index, point] of pending.entries()) {
      const detail: ImageAnnotationEventDetail = {
        sessionID: props.sessionID,
        serverID: props.serverID,
        src: props.reference ?? props.src,
        alt: props.alt,
        x: point.x,
        y: point.y,
        time: point.time,
        comment: point.text.trim(),
      }

      const event = new CustomEvent("opencode:image-annotation", { cancelable: true, detail })
      window.dispatchEvent(event)
      const accepted = event.defaultPrevented && (!detail.completion || await detail.completion.catch(() => false))

      if (!accepted) {
        const remaining = pending.slice(index)
        setPendingAnnotations(remaining.slice(0, -1))
        setAnnotation({ ...remaining.at(-1)!, error: true })
        setDrawingBusy(false)

        return
      }
    }

    setPendingAnnotations([])
    setAnnotation(undefined)
    setMarkingVideo(false)
    setDrawingBusy(false)
  }

  const drawingPoint = (event: PointerEvent): DrawingPoint => {
    const box = event.currentTarget instanceof SVGElement ? event.currentTarget.getBoundingClientRect() : image.getBoundingClientRect()

    return {
      x: Math.max(0, Math.min(1, (event.clientX - box.left) / box.width)),
      y: Math.max(0, Math.min(1, (event.clientY - box.top) / box.height)),
    }
  }

  const sendMarkup = async () => {
    if (!(image instanceof HTMLImageElement) || !props.sessionID || !strokes().length || drawingBusy()) return
    setDrawingBusy(true)
    setDrawingError(false)

    try {
      const canvas = document.createElement("canvas")
      canvas.width = image.naturalWidth
      canvas.height = image.naturalHeight
      const context = canvas.getContext("2d")

      if (!canvas.width || !canvas.height || !context) throw new Error("Image unavailable")
      context.drawImage(image, 0, 0)
      context.strokeStyle = "#ff5c55"
      context.fillStyle = "#ff5c55"
      context.lineCap = "round"
      context.lineJoin = "round"
      context.lineWidth = Math.max(2, canvas.width / (drawingBox()?.width ?? canvas.width) * 3)
      strokes().forEach((stroke) => {
        const first = stroke[0]

        if (!first) return
        context.beginPath()
        context.moveTo(first.x * canvas.width, first.y * canvas.height)

        if (stroke.length === 1) context.lineTo(first.x * canvas.width + 0.01, first.y * canvas.height)
        stroke.slice(1).forEach((point) => context.lineTo(point.x * canvas.width, point.y * canvas.height))
        context.stroke()
      })
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"))

      if (!blob) throw new Error("Image export failed")

      const detail: ImageMarkupDetail = {
        serverID: props.serverID,
        sessionID: props.sessionID,
        src: props.reference ?? props.src,
        file: new File([blob], "markup.png", { type: "image/png" }),
      }

      const event = new CustomEvent("opencode:image-markup", { cancelable: true, detail })
      window.dispatchEvent(event)

      if (!event.defaultPrevented || !detail.completion || !(await detail.completion)) throw new Error("Conversation unavailable")
      setStrokes([])
      dialog.close()
    } catch {
      setDrawingError(true)
    } finally {
      setDrawingBusy(false)
    }
  }

  makeEventListener(window, "resize", () => {
    if (pendingAnnotations().length) requestAnimationFrame(positionPendingAnnotations)

    if (annotationMode() !== "markup") return
    const box = image.getBoundingClientRect()
    setDrawingBox({ left: box.left, top: box.top, width: box.width, height: box.height })
  })

  const press = (event: PointerEvent, target: PanTarget | "content", onBackdrop: boolean) => {
    if (!interactive()) return
    dispatchZoom({
      type: "pointer.down",
      pointerId: event.pointerId,
      button: event.button,
      target,
      onBackdrop,
      zoomed: scaleSpring.value > 1,
    })

    if (!selectPanPointer(untrack(zoom), event.pointerId)) return
    event.preventDefault()
    cursor.x = event.clientX
    cursor.y = event.clientY
  }

  // The hot path of a pan: no layout reads, and no Solid writes once the pan has moved.
  const pan = (event: PointerEvent) => {
    if (!selectPanPointer(untrack(zoom), event.pointerId)) return

    // The button came up without a pointerup reaching the preview, so this is a hover, not a drag.
    if ((event.buttons & 1) === 0) return dispatchZoom({ type: "pointer.cancel", pointerId: event.pointerId })
    const dx = event.clientX - cursor.x
    const dy = event.clientY - cursor.y

    if (dx === 0 && dy === 0) return
    cursor.x = event.clientX
    cursor.y = event.clientY
    movedEvent.pointerId = event.pointerId
    dispatchZoom(movedEvent)
    const scale = scaleSpring.value
    follow(
      scale,
      clampAxis(xSpring.value + dx, bounds.width * scale, bounds.viewportWidth),
      clampAxis(ySpring.value + dy, bounds.height * scale, bounds.viewportHeight),
    )
  }

  const release = (event: PointerEvent) => dispatchZoom({ type: "pointer.up", pointerId: event.pointerId })
  const cancel = (event: PointerEvent) => dispatchZoom({ type: "pointer.cancel", pointerId: event.pointerId })

  if (props.video) {
    const video = props.video
    makeEventListener(video, "pointerdown", (event: PointerEvent) => {
      if (event.clientY < video.getBoundingClientRect().bottom - CONTROLS) press(event, "video", false)
    })
    makeEventListener(video, "pointermove", pan)
    makeEventListener(video, "pointerup", release)
    makeEventListener(video, "pointercancel", cancel)
    makeEventListener(video, "lostpointercapture", cancel)
    makeEventListener(video, "dblclick", detail)
  }

  // The preview owns zoom gestures while it is open: the page behind must neither scroll nor zoom the whole window.
  makeEventListener(
    window,
    "wheel",
    (event: WheelEvent) => {
      if (!interactive()) return
      const inside = event.target instanceof Node && (viewport.contains(event.target) || event.target === props.video)

      const pinch = event.ctrlKey || event.metaKey

      if (!inside && !pinch) return
      event.preventDefault()
      event.stopPropagation()

      if (annotationMode() === "markup") return

      if (!inside) return
      const current = view()

      const next = pinch
        ? zoomAt(current, current.scale * wheelZoomFactor(pixels(event, event.deltaY)), point(event), bounds)
        : panBy(current, wheelPan(event), bounds)

      follow(next.scale, next.x, next.y)
    },
    { passive: false, capture: true },
  )

  // Captured ahead of the desktop shell, which zooms the whole window on the same shortcuts.
  makeEventListener(
    window,
    "keydown",
    (event: KeyboardEvent) => {
      if (!interactive()) return

      if (event.target instanceof HTMLElement && (event.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName))) return

      if (annotationMode() === "markup") return
      const bare = !event.metaKey && !event.ctrlKey && !event.altKey

      if (bare && event.key === " " && props.video) {
        event.preventDefault()
        event.stopPropagation()

        if (props.video.paused) return void props.video.play().catch(() => undefined)

        return props.video.pause()
      }

      const action = bare ? (event.key === "0" ? "fit" : undefined) : event.altKey ? undefined : shortcut(event.key)

      if (!action) return
      event.preventDefault()
      event.stopPropagation()

      if (action === "fit") return ease(FIT_VIEW)
      step(action === "in" ? STEP : 1 / STEP)
    },
    { capture: true },
  )

  return (
    <div
      ref={root}
      data-component="image-preview"
      data-stage={selectFlightStage(flight())}
      // Zoomed in, the first Escape zooms back out; the dialog stack leaves it to the preview.
      data-owns-escape={shown.ownsEscape || !!annotation() || pendingAnnotations().length > 0 || strokes().length > 0 ? "" : undefined}
      style={{ "--image-preview-exit": `${EXIT_DURATION_MS}ms` }}
    >
      <div ref={scrim} data-slot="image-preview-scrim" />
      <Kobalte.Content
        ref={content}
        data-slot="image-preview-content"
        onOpenAutoFocus={(event) => {
          // Open with focus on Close, as before, rather than on the zoom controls that precede it.
          event.preventDefault()
          close?.focus()
        }}
        onEscapeKeyDown={(event) => {
          if (annotation() || pendingAnnotations().length || strokes().length) return event.preventDefault()

          if (scaleSpring.target <= 1) return
          event.preventDefault()
          ease(FIT_VIEW)
        }}
        // A borrowed video sits over the preview rather than in it; using its controls keeps the preview open.
        onInteractOutside={(event) => {
          if (props.video && event.target === props.video) event.preventDefault()
        }}
        onPointerDown={(event: PointerEvent) => {
          const target = event.target

          if (target instanceof Element && target.closest('[data-slot="image-preview-annotation"]')) return

          if (target instanceof Element && target.closest('[data-slot="image-preview-drawing"], [data-slot="image-preview-dock"]')) return
          const body = target instanceof Node && viewport.contains(target)
          press(event, body ? "viewport" : "content", target === content || target === viewport)
        }}
        // The preview fills the window, so a click on the backdrop around the image lands here rather than outside.
        onClick={(event: MouseEvent) => {
          if (annotation() || pendingAnnotations().length || strokes().length) return
          dispatchZoom({
            type: "backdrop.click",
            onBackdrop: event.target === content || event.target === viewport,
          })
        }}
      >
        <div
          ref={viewport}
          data-slot="image-preview-body"
          data-zoomed={shown.zoomed ? "" : undefined}
          data-dragging={selectDragging(zoom()) ? "" : undefined}
          onDblClick={(event) => { if (annotationMode() !== "markup") detail(event) }}
          onPointerMove={pan}
          onPointerUp={release}
          onPointerCancel={cancel}
          onLostPointerCapture={cancel}
        >
          <Show
            when={props.video}
            fallback={
              <img
                ref={(element) => (image = element)}
                src={props.src}
                alt={props.alt ?? i18n.t("ui.imagePreview.alt")}
                data-slot="image-preview-image"
                draggable={false}
                tabIndex={props.sessionID ? 0 : undefined}
                role={props.sessionID ? "button" : undefined}
                aria-label={props.sessionID ? i18n.t("ui.imagePreview.commentOnImage") : undefined}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" && event.key !== " ") return
                  event.preventDefault()
                  event.stopPropagation()
                  const bounds = event.currentTarget.getBoundingClientRect()
                  mark(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2)
                }}
                onClick={(event) => {
                  if (event.detail !== 1) return
                  event.stopPropagation()
                  mark(event.clientX, event.clientY)
                }}
                onLoad={() => {
                  measure()
                  dispatchFlight({ type: "image.loaded" })
                }}
                onError={() => dispatchFlight({ type: "image.failed" })}
              />
            }
          >
            {(video) => (
              <canvas
                ref={(element) => (image = element)}
                data-slot="image-preview-image"
                width={video().videoWidth}
                height={video().videoHeight}
              />
            )}
          </Show>
        </div>
        <For each={pendingAnnotations()}>
          {(note, index) => (
            <span
              data-slot="image-preview-pending-marker"
              data-x={note.x}
              data-y={note.y}
              title={note.text}
              style={{ left: `${image.getBoundingClientRect().left + image.getBoundingClientRect().width * note.x / 100}px`, top: `${image.getBoundingClientRect().top + image.getBoundingClientRect().height * note.y / 100}px` }}
            >{index() + 1}</span>
          )}
        </For>
        <Show when={!props.video && !!props.sessionID && annotationMode() === "markup" ? drawingBox() : undefined}>
          {(box) => (
            <svg
              data-slot="image-preview-drawing"
              aria-label={i18n.t("ui.imagePreview.drawingCanvas")}
              role="img"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              style={{ left: `${box().left}px`, top: `${box().top}px`, width: `${box().width}px`, height: `${box().height}px` }}
              onPointerDown={(event) => {
                if (event.button !== 0) return
                event.preventDefault()
                event.stopPropagation()
                drawingPointer = event.pointerId
                event.currentTarget.setPointerCapture(event.pointerId)
                setStrokes((current) => [...current, [drawingPoint(event)]])
              }}
              onPointerMove={(event) => {
                if (drawingPointer !== event.pointerId) return
                event.preventDefault()
                const point = drawingPoint(event)
                setStrokes((current) => current.map((stroke, index) => index === current.length - 1 ? [...stroke, point] : stroke))
              }}
              onPointerUp={(event) => {
                if (drawingPointer !== event.pointerId) return
                drawingPointer = undefined

                if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
              }}
              onPointerCancel={() => { drawingPointer = undefined }}
              onClick={(event) => event.stopPropagation()}
            >
              <For each={strokes()}>
                {(stroke) => (
                  <Show
                    when={stroke.length > 1}
                    fallback={<ellipse cx={stroke[0].x * 100} cy={stroke[0].y * 100} rx={150 / box().width} ry={150 / box().height} />}
                  >
                    <polyline points={stroke.map((point) => `${point.x * 100},${point.y * 100}`).join(" ")} />
                  </Show>
                )}
              </For>
            </svg>
          )}
        </Show>
        <Show when={annotation()}>
          {(point) => (
            <>
              <span data-slot="image-preview-annotation-marker" style={{ left: `${point().left}px`, top: `${point().top}px` }} aria-hidden="true">{pendingAnnotations().length + 1}</span>
              <form
                data-slot="image-preview-annotation"
                style={{ left: `${Math.max(16, Math.min(point().left + 20, window.innerWidth - 296))}px`, top: `${Math.max(16, Math.min(point().top - 20, window.innerHeight - 90))}px` }}
                onSubmit={(event) => {
                  event.preventDefault()
                  void sendComments()
                }}
              >
                <input
                  id="image-preview-annotation-input"
                  type="text"
                  aria-label={i18n.t("ui.imagePreview.comment")}
                  autofocus
                  value={point().text}
                  placeholder={i18n.t("ui.imagePreview.compactPlaceholder")}
                  onInput={(event) => setAnnotation({ ...point(), text: event.currentTarget.value })}
                  onKeyDown={(event) => event.stopPropagation()}
                />
              </form>
            </>
          )}
        </Show>
        <Show when={props.sessionID}>
          <div data-slot="image-preview-dock" role="toolbar" aria-label={i18n.t("ui.imagePreview.annotationTools")}>
            <span data-slot="image-preview-dock-grip" aria-hidden="true"><svg width="12" height="16" viewBox="0 0 12 16"><circle cx="4" cy="4" r="1"/><circle cx="8" cy="4" r="1"/><circle cx="4" cy="8" r="1"/><circle cx="8" cy="8" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="8" cy="12" r="1"/></svg></span>
            <Show when={annotationMode() !== "comment" || (!annotation() && !pendingAnnotations().length)} fallback={<span data-slot="image-preview-dock-instruction">{i18n.t("ui.imagePreview.addPoints")}</span>}>
            <Show when={!props.video}>
              <button type="button" aria-pressed={annotationMode() === "markup"} disabled={!!annotation() || pendingAnnotations().length > 0} title={annotation() || pendingAnnotations().length ? i18n.t("ui.imagePreview.finishAnnotation") : undefined} onClick={startMarkup}>
                <Icon name="edit" /><span>{i18n.t("ui.imagePreview.markup")}</span>
              </button>
            </Show>
            <button type="button" aria-label={props.video ? i18n.t("ui.imagePreview.commentOnVideo") : undefined} aria-pressed={annotationMode() === "comment"} disabled={strokes().length > 0} title={strokes().length ? i18n.t("ui.imagePreview.finishAnnotation") : undefined} onClick={() => {
              setAnnotationMode("comment")
              setDrawingError(false)

              if (!props.video || markingVideo()) return
              follow(FIT_VIEW.scale, FIT_VIEW.x, FIT_VIEW.y)
              const rect = image.getBoundingClientRect()
              setVideoMarkBox({ left: rect.left, top: rect.top, width: rect.width, height: rect.height })
              setMarkingVideo(true)
            }}>
              <Icon name="comment" /><span>{i18n.t("ui.imagePreview.commentTool")}</span>
            </button>
            </Show>
            <Show when={annotationMode() === "markup"}>
              <span data-slot="image-preview-dock-divider" />
              <button type="button" aria-label={i18n.t("ui.imagePreview.addComment")} disabled={!strokes().length} aria-disabled={drawingBusy()} onClick={() => void sendMarkup()}>{i18n.t("ui.imagePreview.sendMarkup")}</button>
              <button type="button" aria-label={i18n.t("ui.common.cancel")} onClick={() => { setStrokes([]); setDrawingError(false); setAnnotationMode("comment") }}><Icon name="close" /></button>
            </Show>
            <Show when={annotationMode() === "comment" && (!!annotation() || pendingAnnotations().length > 0)}>
              <span data-slot="image-preview-dock-divider" />
              <button type="button" data-slot="image-preview-comment-send" aria-label={i18n.t("ui.imagePreview.addComment")} disabled={!annotation()?.text.trim() && !pendingAnnotations().length} aria-disabled={drawingBusy()} onClick={() => void sendComments()}>{i18n.t("ui.imagePreview.sendMarkup")}</button>
              <button type="button" aria-label={i18n.t("ui.common.cancel")} onClick={() => { setAnnotation(undefined); setPendingAnnotations([]); setMarkingVideo(false) }}><Icon name="close" /></button>
            </Show>
            <Show when={drawingError()}><span role="alert">{i18n.t("ui.imagePreview.markupUnavailable")}</span></Show>
            <Show when={annotation()?.error}><span role="alert">{i18n.t("ui.imagePreview.commentUnavailable")}</span></Show>
          </div>
        </Show>
        <div data-slot="image-preview-controls">
          <IconButton
            data-slot="image-preview-zoom-out"
            icon={<Icon name="minus" />}
            variant="ghost"
            aria-label={i18n.t("ui.imagePreview.zoomOut")}
            disabled={annotationMode() === "markup"}
            onClick={() => step(1 / STEP)}
          />
          <Button
            data-slot="image-preview-zoom-level"
            variant="ghost-muted"
            size="small"
            aria-label={i18n.t("ui.imagePreview.zoomToFit")}
            title={i18n.t("ui.imagePreview.zoomToFit")}
            disabled={annotationMode() === "markup"}
            onClick={() => ease(FIT_VIEW)}
          >
            {percent().format(shown.level / 100)}
          </Button>
          <IconButton
            data-slot="image-preview-zoom-in"
            icon={<Icon name="plus" />}
            variant="ghost"
            aria-label={i18n.t("ui.imagePreview.zoomIn")}
            disabled={annotationMode() === "markup"}
            onClick={() => step(STEP)}
          />
          <div data-slot="image-preview-divider" />
          <Kobalte.CloseButton
            ref={close}
            data-slot="image-preview-close"
            as={IconButton}
            icon={<Icon name="close" />}
            variant="ghost"
            aria-label={i18n.t("ui.common.close")}
          />
        </div>
      <Show when={markingVideo() && videoMarkBox()}>
        {(box) => (
          <button
            type="button"
            aria-label={i18n.t("ui.imagePreview.selectVideoPoint")}
            style={{ position: "fixed", "z-index": 52, left: `${box().left}px`, top: `${box().top}px`, width: `${box().width}px`, height: `${box().height}px`, cursor: "crosshair", "pointer-events": "auto", background: "transparent", border: "none" }}
            onClick={(event) => {
              const rect = event.currentTarget.getBoundingClientRect()
              mark(event.detail === 0 ? rect.left + rect.width / 2 : event.clientX, event.detail === 0 ? rect.top + rect.height / 2 : event.clientY)
            }}
          />
        )}
      </Show>
      </Kobalte.Content>
      <div data-slot="image-preview-surface" ref={surface} />
      <Show when={!props.video}>
        <img data-slot="image-preview-flight" src={props.src} alt="" aria-hidden="true" ref={standIn} />
      </Show>
      <div data-slot="image-preview-edge" ref={edge} />
    </div>
  )
}

// The part of `origin` the page under `preview` shows: inside its clipping ancestors and the window, and clear of
// anything drawn over its top or bottom, such as a sticky title bar. Nothing when none of it shows.
function visibleBox(origin: HTMLElement, preview: Element): Box | undefined {
  const clipped = ancestors(origin).reduce(
    (box: Box, element) => {
      const style = getComputedStyle(element)

      if (style.overflowX === "visible" && style.overflowY === "visible") return box

      return intersect(box, element.getBoundingClientRect())
    },
    intersect(origin.getBoundingClientRect(), { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight }),
  )

  const rows = Math.floor(clipped.height)

  if (!clipped.width || rows < 1) return
  const x = clipped.x + clipped.width / 2

  // The origin is hidden while the preview flies, so the page shows it where the topmost element under the preview
  // holds it.
  const shows = (y: number) =>
    document
      .elementsFromPoint(x, y)
      .find((element) => !preview.contains(element))
      ?.contains(origin) ?? false

  const top = covered(rows, (row) => shows(clipped.y + row + 0.5))

  if (top === rows) return
  const bottom = covered(rows - top, (row) => shows(clipped.y + clipped.height - row - 0.5))

  return { x: clipped.x, y: clipped.y + top, width: clipped.width, height: clipped.height - top - bottom }
}

function ancestors(element: HTMLElement) {
  const list: HTMLElement[] = []

  for (let parent = element.parentElement; parent; parent = parent.parentElement) list.push(parent)

  return list
}

// How many of `rows`, counted in from an edge, are covered before the first that shows; a covering bar is one piece.
function covered(rows: number, shows: (row: number) => boolean) {
  let low = 0
  let high = rows

  while (low < high) {
    const middle = Math.floor((low + high) / 2)

    if (shows(middle)) {
      high = middle
      continue
    }

    low = middle + 1
  }

  return low
}

function dispose(video: HTMLVideoElement) {
  video.pause()
  video.remove()
  video.removeAttribute("src")
  video.srcObject = null
  video.load()
}

function layout(element: HTMLElement, frame: Box, radius: number) {
  element.style.left = `${frame.x}px`
  element.style.top = `${frame.y}px`
  element.style.width = `${frame.width}px`
  element.style.height = `${frame.height}px`
  element.style.borderRadius = `${radius}px`
}

function shortcut(key: string) {
  if (key === "=" || key === "+") return "in"

  if (key === "-" || key === "_") return "out"

  if (key === "0") return "fit"
}

// A plain wheel pans; Shift turns a vertical wheel sideways.
function wheelPan(event: WheelEvent) {
  const horizontal = event.shiftKey && event.deltaX === 0

  return {
    x: -pixels(event, horizontal ? event.deltaY : event.deltaX),
    y: horizontal ? 0 : -pixels(event, event.deltaY),
  }
}

function pixels(event: WheelEvent, delta: number) {
  if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) return delta * 16

  if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) return delta * window.innerHeight

  return delta
}
