/**
 * Font family names, kept separate from the loader.
 *
 * SlideArt runs in the browser as well as in satori, so it must not reach a
 * module that imports `fs`. These names must match both the `name` fields in
 * lib/fonts.ts and the @font-face families in globals.css, or the preview and
 * the exported PNG will use different type.
 */
export const DISPLAY_FONT = "Anton";
export const BODY_FONT = "Barlow";
