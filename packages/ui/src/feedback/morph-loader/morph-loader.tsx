import type { ComponentProps } from "solid-js"
import "./morph-loader.css"

/** Morphing activity indicator used by session tabs and project rows. */
export function MorphLoader(props: ComponentProps<"svg">) {
  return (
    <svg
      {...props}
      data-component="morph-loader"
      aria-hidden="true"
      width={props.width ?? 14}
      height={props.height ?? 14}
      viewBox="0 0 100 100"
    >
      <path
        fill="currentColor"
        d="M50.00 4.00 L61.91 5.57 L73.00 10.16 L82.53 17.47 L89.84 27.00 L94.43 38.09 L96.00 50.00 L94.43 61.91 L89.84 73.00 L82.53 82.53 L73.00 89.84 L61.91 94.43 L50.00 96.00 L38.09 94.43 L27.00 89.84 L17.47 82.53 L10.16 73.00 L5.57 61.91 L4.00 50.00 L5.57 38.09 L10.16 27.00 L17.47 17.47 L27.00 10.16 L38.09 5.57 Z"
      />
    </svg>
  )
}
