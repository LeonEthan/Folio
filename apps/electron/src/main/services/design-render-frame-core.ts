/**
 * Freshness proof for hidden-window design captures.
 *
 * A hidden render window's compositor can hand `capturePage` a frame composited
 * before `document.body.replaceChildren(stage)` — the boot splash — while the
 * DOM already shows the finished artwork. In-page readiness (fonts, image
 * decode, `requestAnimationFrame`) proves the DOM is ready, not that the
 * captured bytes are newer than the mutation, so the export path proves
 * freshness per capture instead: capture a candidate frame, apply a CSS
 * `invert(1)` filter to the document element, capture again, and require the
 * second frame to be the pixel inversion of the first. Only a live compositor
 * rendering the current document can produce that pair.
 *
 * The check is channel-order agnostic (RGBA and BGRA both satisfy it) and needs
 * no knowledge of the artwork: per pixel, exactly the three color channels
 * satisfy `a + b = 255` while alpha satisfies `a = b`. Small tolerances absorb
 * raster dithering; a high match fraction rejects stale or unrelated frames,
 * whose pixels only accidentally satisfy the relation.
 *
 * Known residual: a frozen surface that is uniformly mid-gray (~127 per
 * channel) satisfies both relations at once and would verify. No surface in
 * this flow looks like that — the boot surface is a dark splash with a logo
 * and panels — so the residual is documented, not tested, and a mismatch
 * always fails safe by throwing rather than shipping the candidate.
 *
 * No filesystem, no Electron, no wire types: pure bitmap math, tested under
 * `node --test` like the other `-core` modules.
 */

/** Per-channel raster tolerance for the inversion relation. */
const CHANNEL_TOLERANCE = 3
/** A pixel matches when at least three channels invert and one is unchanged. */
const INVERTED_CHANNELS_REQUIRED = 3
/** Fraction of pixels that must match; stale frames only match by accident. */
export const FRAME_MATCH_FRACTION = 0.99

export function frameIsInversionOf(plain: Uint8Array, inverted: Uint8Array): boolean {
  if (plain.length === 0 || plain.length !== inverted.length || plain.length % 4 !== 0) return false
  let matching = 0
  const pixels = plain.length / 4
  for (let i = 0; i < plain.length; i += 4) {
    let invertedChannels = 0
    let sameChannels = 0
    // Counted independently: near mid-gray a channel satisfies both relations
    // (127 inverts to ~127), which is exactly right for live frames and stays
    // far below the match fraction for unrelated ones.
    for (let k = 0; k < 4; k++) {
      const a = plain[i + k]
      const b = inverted[i + k]
      if (Math.abs(a + b - 255) <= CHANNEL_TOLERANCE * 2) invertedChannels++
      if (Math.abs(a - b) <= CHANNEL_TOLERANCE) sameChannels++
    }
    if (invertedChannels >= INVERTED_CHANNELS_REQUIRED && sameChannels >= 1) matching++
  }
  return matching / pixels >= FRAME_MATCH_FRACTION
}
