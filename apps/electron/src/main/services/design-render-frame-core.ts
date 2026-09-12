/**
 * Minimal surface needed to capture a compositor-confirmed offscreen frame.
 * Electron adaptation stays in `design-service.ts`; this module only owns the
 * ordering and cleanup that can be verified without launching Electron.
 */
export type PresentedFrameSource<Image extends { isEmpty(): boolean }> = {
  listen(listener: (image: Image) => void): () => void
  start(): void
  stop(): void
  invalidate(): void
}

/**
 * Resume a previously stopped offscreen renderer and return the second
 * non-empty paint after requesting a repaint from the first callback.
 *
 * The owner stops painting before navigation, prepares the final DOM while
 * stopped, then calls this function. The extra repaint avoids returning the
 * queued first frame observed when a stopped renderer resumed. Electron does
 * not expose a mutation sequence on paint callbacks, so installed regression
 * tests still own the end-to-end freshness verdict. Pixel contents and alpha
 * representation are irrelevant to this bounded workaround.
 */
export function capturePresentedFrame<Image extends { isEmpty(): boolean }>(
  source: PresentedFrameSource<Image>,
  signal: AbortSignal
): Promise<Image> {
  return new Promise((resolve, reject) => {
    let primed = false
    let removeListener = () => {}
    let settled = false

    const cleanup = () => {
      if (settled) return
      settled = true
      removeListener()
      signal.removeEventListener('abort', onAbort)
      source.stop()
    }
    const fail = (error: unknown) => {
      cleanup()
      reject(error)
    }
    const onAbort = () => fail(signal.reason ?? Error('Canvas capture aborted'))
    const onFrame = (image: Image) => {
      if (settled) return
      if (image.isEmpty()) {
        try {
          source.invalidate()
        } catch (error) {
          fail(error)
        }
        return
      }
      if (!primed) {
        primed = true
        try {
          source.invalidate()
        } catch (error) {
          fail(error)
        }
        return
      }
      cleanup()
      resolve(image)
    }

    if (signal.aborted) {
      fail(signal.reason ?? Error('Canvas capture aborted'))
      return
    }
    try {
      removeListener = source.listen(onFrame)
      signal.addEventListener('abort', onAbort, { once: true })
      source.start()
      source.invalidate()
    } catch (error) {
      fail(error)
    }
  })
}
