import { type ComponentProps } from "solid-js"

const logo = new URL("../../assets/opencodex.png", import.meta.url).href

export function Wordmark(
  props: Pick<ComponentProps<"svg">, "class"> & { fade?: boolean; muted?: boolean; outline?: boolean },
) {
  return (
    <svg
      data-component="brand-wordmark"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 720 129"
      fill="none"
      class={props.class}
    >
      <g opacity={props.muted === false ? 1 : 0.6}>
        <image href={logo} x="0" y="0" width="129" height="129" />
        <text
          x="158"
          y="91"
          font-family="inherit"
          font-size="94"
          font-weight="600"
          fill={props.outline ? "none" : "currentColor"}
          stroke={props.outline ? "currentColor" : undefined}
          stroke-width={props.outline ? 1 : undefined}
        >
          OpenCodex
        </text>
      </g>
    </svg>
  )
}
