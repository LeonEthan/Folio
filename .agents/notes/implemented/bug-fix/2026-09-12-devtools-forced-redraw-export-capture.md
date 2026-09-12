# Export captures use Chromium forced redraw snapshots

Status: implemented
Translation: pending

## Abstract

The offscreen paint callback replacement for the transparent-unsafe inversion
check still exported Bento's boot surface. Electron's `invalidate()` only
recomposites the current OSR backing, so asking for a second callback cannot
establish that the renderer submitted the prepared artwork. The dedicated
render WebContents now captures a PNG through Chromium's
`Page.captureScreenshot`, whose browser snapshot path force-redraws before it
copies the surface. The existing logical resize and PNG/JPEG encoding remain.
Installed full-Bento regression of this replacement is still required.

## Superseded attempt and installed evidence

[Export captures use bounded offscreen paint](2026-09-12-offscreen-paint-export-capture.md)
records the attempted callback sequence. A normal package for source
`1806ea22b5658c38562a3aa8cfaa25fe6ca95c2f` ran the retained four-asset poster
reproduction once. All six alternating PNG/JPEG outputs had the correct
1200×1800 logical size but contained the Bento boot/editor surface; their corner
was `[44,28,16,255]` instead of the saved poster's `[242,246,247,255]`. The
transparent and semi-transparent cases did not run because the script stopped
at this first failure. Per-export render-window checks passed, and the harness
released its owned processes and endpoint. The evidence is retained at
`/tmp/folio-export-repro-4QEQPX/evidence/result.json`; the first PNG and JPEG are
under its sibling `画稿/poster/` directory.

Pinned Electron source explains the result. `WebContents::Invalidate`
[only forwards to the OSR view](https://github.com/electron/electron/blob/v39.5.1/shell/browser/api/electron_api_web_contents.cc#L3691-L3695).
The OSR implementation's `CompositeFrame`
[reads the current backing and invokes the callback](https://github.com/electron/electron/blob/v39.5.1/shell/browser/osr/osr_render_widget_host_view.cc#L692-L730),
while its video consumer's `SetActive`
[only starts or stops the capturer](https://github.com/electron/electron/blob/v39.5.1/shell/browser/osr/osr_video_consumer.cc#L77-L85).
The synchronous `onFrame` → `invalidate()` path can therefore return the same
cached surface as a second callback.

A one-variable diagnostic kept the installed stop-before-navigation order but
suppressed both native invalidation calls. After stage preparation had reduced
the body to one 1200×1800 `.bento-slide`, `startPainting()` produced two natural
paints. The first was a partial dirty frame with the boot corner
`[45,29,17,255]`; the second was a full 2400×3600 Retina frame with the saved
poster corner `[242,246,247,255]`. The resulting 1200×1800 PNG was correct and
cleanup passed. This proves invalidation was unnecessary in that actual-Bento
run, but it does not turn a second natural paint into a general freshness
contract. The event log and paint images are retained under
`/tmp/folio-t29-natural-paint-rhAwlc/evidence/`.

## Decision

`renderSavedDesign` retains one isolated render-only WebContents, the trusted
Bento editor surface, structural canvas checks, font readiness, image decode,
stage replacement at 0,0, and the native logical-size encoding step. It no
longer stops painting, subscribes to OSR paint events, counts frames, mutates CSS
as a challenge, or calls `invalidate()`.

After the prepared DOM's existing double animation-frame boundary, the main
process attaches Electron's public debugger API only to that dedicated render
WebContents. It sets the default compositor background to transparent for PNG
or white for JPEG, then requests `Page.captureScreenshot` with fixed PNG output
from the surface. The pinned Chromium 142.0.7444.265 implementation routes this
command through `PageHandler::CaptureScreenshot` and
`GetSnapshotFromBrowser`; `RenderWidgetHostImpl::GetSnapshotFromBrowser`
force-redraws before requesting the surface copy. This is the native screenshot
synchronization mechanism, rather than an application-defined frame signal:

- [Chromium page handler](https://chromium.googlesource.com/chromium/src/+/refs/tags/142.0.7444.265/content/browser/devtools/protocol/page_handler.cc#1395)
- [Chromium render widget host](https://chromium.googlesource.com/chromium/src/+/refs/tags/142.0.7444.265/content/browser/renderer_host/render_widget_host_impl.cc#2165)

The command returns base64 PNG bytes. The main process validates that data,
decodes it with `nativeImage`, rejects an empty image, resizes to the BentoDoc's
logical canvas, and uses the existing `toPNG()` or `toJPEG(95)` encoder. No
debugger access is exposed to the renderer or Agent, and no debugging port is
opened.

A 30-second deadline bounds both background setup and screenshot capture. The
debugger detaches in `finally`; the outer render function still destroys the
window and disposes the isolated surface on every outcome. The removed paint
helper and its frame-count tests only modeled the invalid empirical sequence,
so they are deleted rather than adapted to mock a Chromium redraw guarantee.

## Verification and remaining acceptance

Direct Electron node typechecking passes. The focused render-host and
leave-loading suites pass 13/13 after deleting the obsolete frame helper tests.
The next normal package must run the frozen retained reproduction: six real
four-asset poster exports across PNG/JPEG, a fully transparent empty Bento PNG,
the same empty Bento rendered onto JPEG white, and a semi-transparent Bento PNG.
It must confirm logical dimensions, actual image content by format, render
window cleanup, owned-process cleanup, and endpoint release. Passing that
bounded matrix is evidence for this installed version, not a universal CDP
contract.
