import { type ComponentProps } from "solid-js"

const logo = new URL("../assets/opencodex.svg", import.meta.url).href

export const Mark = (props: { class?: string }) => (
  <svg
    data-component="logo-mark"
    classList={{ [props.class ?? ""]: !!props.class }}
    viewBox="0 0 48 48"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <image href={logo} width="48" height="48" />
  </svg>
)

export const Splash = (props: Pick<ComponentProps<"svg">, "ref" | "class">) => (
  <svg
    ref={props.ref}
    data-component="logo-splash"
    classList={{ [props.class ?? ""]: !!props.class }}
    viewBox="0 0 48 48"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <image href={logo} width="48" height="48" />
  </svg>
)

export const Logo = (props: { class?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 234 48"
    fill="none"
    classList={{ [props.class ?? ""]: !!props.class }}
  >
    <image href={logo} width="48" height="48" />
    <text x="60" y="33" fill="currentColor" font-family="inherit" font-size="30" font-weight="600">
      OpenCodex
    </text>
  </svg>
)
