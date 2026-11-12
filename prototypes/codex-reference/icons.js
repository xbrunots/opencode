/* A small, original icon family. Shape, weight and duotone treatment follow the concept tokens. */
const Icons = (() => {
  const paths = {
    logo: '<path d="m8 6-6 6 6 6m8-12 6 6-6 6M14 3l-4 18"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>',
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/>',
    "arrow-right": '<path d="M4 12h16m-6-6 6 6-6 6"/>',
    "arrow-left": '<path d="M20 12H4m6 6-6-6 6-6"/>',
    "arrow-up": '<path d="M12 20V4m-6 6 6-6 6 6"/>',
    "arrow-up-right": '<path d="M6 18 18 6M6 6h12v12"/>',
    chevron: '<path d="m9 5 7 7-7 7"/>',
    "chevron-down": '<path d="m6 9 6 6 6-6"/>',
    check: '<path d="m5 12 4.5 4.5L19 7"/>',
    "check-circle": '<circle cx="12" cy="12" r="9" class="icon-tone"/><path d="m8 12 3 3 5-6"/>',
    folder:
      '<path class="icon-tone" d="M3 7V5a1 1 0 0 1 1-1h5l2 3h9a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z"/><path d="M3 9h18"/>',
    "folder-plus": '<path d="M3 7V5h6l2 3h10v12H3Z"/><path d="M12 11v6m-3-3h6"/>',
    "folder-tree": '<path class="icon-tone" d="M8 3h5l2 3h6v7H8Z"/><path d="M3 3v15h5m-5-8h5m0 6h13v6H8Z"/>',
    branch:
      '<circle cx="6" cy="5" r="2"/><circle cx="18" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><path d="M6 7v10m12-10a8 8 0 0 1-8 8H6"/>',
    "git-compare": '<path d="M5 5v10m14-6v10M2 8l3-3 3 3m8 8 3 3 3-3M9 5h6m-6 14h6"/>',
    chat: '<path class="icon-tone" d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z"/><path d="M7 9h10M7 13h6"/>',
    panels: '<rect x="3" y="4" width="18" height="16" rx="3" class="icon-tone"/><path d="M9 4v16"/>',
    tabs: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M3 9h18M9 4v5m6-5v5"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1.5" class="icon-tone"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5" class="icon-tone"/>',
    islands:
      '<rect x="3" y="3" width="12" height="12" rx="3" class="icon-tone"/><path d="M18 9h1a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2v-1"/>',
    layers: '<path class="icon-tone" d="m12 3 10 5-10 5L2 8Z"/><path d="m2 12 10 5 10-5M2 16l10 5 10-5"/>',
    command: '<path d="M8 8H5a3 3 0 1 1 3-3v14a3 3 0 1 1-3-3h14a3 3 0 1 1-3 3V5a3 3 0 1 1 3 3Z"/>',
    sparkles:
      '<path class="icon-tone" d="m12 3 2.7 6.3L21 12l-6.3 2.7L12 21l-2.7-6.3L3 12l6.3-2.7Z"/><path d="M20 2v4m-2-2h4"/>',
    sun: '<circle cx="12" cy="12" r="4" class="icon-tone"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
    moon: '<path class="icon-tone" d="M21 13.5A9 9 0 0 1 10.5 3 9 9 0 1 0 21 13.5Z"/>',
    plug: '<path class="icon-tone" d="M7 8h10v5a5 5 0 0 1-10 0Z"/><path d="M9 3v5m6-5v5m-3 10v4M5 8h14"/>',
    puzzle: '<path class="icon-tone" d="M4 4h6a3 3 0 1 1 6 0h4v6a3 3 0 1 0 0 6v4h-6a3 3 0 1 0-6 0H4Z"/>',
    book: '<path class="icon-tone" d="M12 5c-3-2-6-2-10-1v15c4-1 7-1 10 1 3-2 6-2 10-1V4c-4-1-7-1-10 1Z"/><path d="M12 5v15"/>',
    settings:
      '<path class="icon-tone" d="m9 3 1-1h4l1 3 3 1 3 1v4l-2 2-1 3-1 3h-4l-2-2-3-1-3-1v-4l2-2 1-3Z"/><circle cx="12" cy="11" r="3"/>',
    models: '<path class="icon-tone" d="m12 2 9 5v10l-9 5-9-5V7Z"/><path d="m3 7 9 5 9-5m-9 5v10M7.5 4.5l9 5v5"/>',
    terminal: '<rect x="2" y="4" width="20" height="16" rx="3" class="icon-tone"/><path d="m6 8 4 4-4 4m7 0h5"/>',
    laptop: '<rect x="4" y="3" width="16" height="13" rx="2"/><path d="M4 16 2 20h20l-2-4"/>',
    file: '<path class="icon-tone" d="M6 2h8l5 5v15H5V2Z"/><path d="M14 2v6h5M8 12h8m-8 4h6"/>',
    code: '<path d="m8 6-6 6 6 6m8-12 6 6-6 6m-3-15-2 18"/>',
    more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
    mic: '<rect x="9" y="2" width="6" height="13" rx="3" class="icon-tone"/><path d="M5 10v2a7 7 0 0 0 14 0v-2m-7 9v3m-4 0h8"/>',
    attach: '<path d="m8 13 7-7a3 3 0 1 1 4 4L9 20a5 5 0 0 1-7-7L12 3m-6 14 10-10"/>',
    shield: '<path class="icon-tone" d="m12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6Z"/><path d="m8 12 3 3 5-6"/>',
    lock: '<rect x="5" y="10" width="14" height="12" rx="3" class="icon-tone"/><path d="M8 10V6a4 4 0 0 1 8 0v4m-4 5v2"/>',
    unlock: '<rect x="5" y="10" width="14" height="12" rx="3"/><path d="M8 10V6a4 4 0 0 1 7-2m-3 11v2"/>',
    expand: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
    collapse: '<path d="M3 8h5V3m8 0v5h5M8 21v-5H3m18 0h-5v5"/>',
    activity: '<path d="M2 12h4l3-8 6 16 3-8h4"/>',
    clock: '<circle cx="12" cy="12" r="9" class="icon-tone"/><path d="M12 7v6l4 2"/>',
    refresh: '<path d="M20 8A9 9 0 0 0 4 5L2 8m0-5v5h5m-3 8a9 9 0 0 0 16 3l2-3m0 5v-5h-5"/>',
    star: '<path class="icon-tone" d="m12 2 3 6.5 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z"/>',
    copy: '<rect x="8" y="8" width="13" height="13" rx="2" class="icon-tone"/><path d="M16 8V3H3v13h5"/>',
    cursor: '<path class="icon-tone" d="m4 3 16 10-7 1-3 7Z"/>',
    zap: '<path class="icon-tone" d="m13 2-9 12h7l-1 8 10-13h-7Z"/>',
    globe: '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>',
    download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
    "external-link": '<path d="M14 3h7v7m-10 3L21 3M10 3H3v18h18v-7"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-11v.5"/>',
    stop: '<rect x="6" y="6" width="12" height="12" rx="2" class="icon-tone"/>',
    reset: '<path d="M3 10a9 9 0 1 1 1 7M3 3v7h7"/>',
    eye: '<path class="icon-tone" d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
    palette:
      '<path class="icon-tone" d="M12 2A10 10 0 1 0 12 22c3 0 3-3 1-4s0-3 3-3h3c4 0 4-13-7-13Z"/><path d="M7 8h.01M12 6h.01M17 8h.01M6 13h.01"/>',
    keyboard:
      '<rect x="2" y="5" width="20" height="14" rx="3"/><path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M6 12h.01M10 12h.01M14 12h.01M18 12h.01M7 16h10"/>',
    agent:
      '<rect x="4" y="7" width="16" height="14" rx="4" class="icon-tone"/><path d="M12 3v4m-4 6h.01M16 13h.01M9 17h6M1 12v4m22-4v4"/>',
    "provider-openai": '<path d="m12 3 7 4v8l-7 4-7-4V7Zm0 0v8m7-4-7 4-7-4m7 4v8M8 1l-6 4v10l6 4m8-14 6 4v10l-6 4"/>',
    "provider-anthropic": '<path d="m4 20 7-16 7 16M7 14h8M17 4l6 16"/>',
    "provider-google":
      '<path class="icon-tone" d="M12 2c0 6-4 10-10 10 6 0 10 4 10 10 0-6 4-10 10-10-6 0-10-4-10-10Z"/>',
    "provider-xai": '<path d="m4 3 16 18M20 3 4 21M8 3h-4l16 18h-4"/>',
    "provider-local": '<rect x="4" y="3" width="16" height="14" rx="2"/><path d="M8 21h8m-4-4v4M8 8l3 2-3 2m6 0h3"/>',
  }
  function svg(name, className = "") {
    return `<svg class="icon ${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="var(--icon-stroke, 1.65)" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.sparkles}</svg>`
  }
  function hydrate(root = document) {
    root.querySelectorAll("[data-icon]").forEach((element) => {
      element.innerHTML = svg(element.dataset.icon)
    })
  }
  return { svg, hydrate }
})()
