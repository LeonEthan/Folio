/**
 * Serving a recorded result-card thumbnail (P2.6).
 *
 * The write side is `./thumbnail.ts`; this is the read the renderer performs when
 * it shows a card. The reference travels back here as an opaque string from the
 * session history, so the only thing standing between a durable field and a file
 * read is what this module checks — and it checks everything:
 *
 * - **The reference is a shape, not a path.** It must match the shared pattern
 *   exactly (`design-thumbnail/<64 hex>.png`), which is why no caller-supplied
 *   path can reach the filesystem: relative traversal, an absolute path, another
 *   directory, or another extension all fail before a path is ever built.
 * - **The workspace is real directories, not a link.** Both `chats/<sessionId>`
 *   and its `design-thumbnail/` are `lstat`ed and must be actual directories, so
 *   a symlinked level cannot redirect the read outside the session. The file
 *   itself is opened `O_NOFOLLOW` for the same reason.
 * - **The bytes must be a PNG, and a bounded one.** The header sniff and the
 *   IHDR read are the write side's own verification (`readPngDimensions`), so a
 *   file this reader would refuse can never be one the capture path wrote; the
 *   size cap keeps one corrupted file from filling the control socket.
 *
 * Nothing here repairs, regenerates, or falls back to a re-render: a reference
 * that no longer resolves is `unavailable`, and the card shows no image
 * (agent-naive; root `AGENTS.md`).
 */

import { constants } from 'node:fs';
import { lstat, open } from 'node:fs/promises';
import path from 'node:path';
import {
  DESIGN_TURN_OUTCOME_THUMBNAIL_RE,
  MAX_DESIGN_TURN_OUTCOME_THUMBNAIL_REFERENCE_LENGTH,
} from '@lody/shared';
import { sniffStaticV1ImageMime } from '../../../../packages/design-bento/vendor/packages/contracts/src/static-v1';
import { readPngDimensions } from './render-output';
import { designId } from './store';

/**
 * The most a recorded thumbnail may be, in bytes.
 *
 * Far above what the render host produces (`MAX_THUMBNAIL_EDGE` is 480 px, so
 * tens of kilobytes) and far below the control socket's 16 MiB response cap: a
 * file larger than this did not come from this bridge, and is refused rather
 * than carried.
 */
export const MAX_THUMBNAIL_BYTES = 4 * 1024 * 1024;

/** How much of the file the PNG signature and IHDR live in. */
const MIME_SNIFF_BYTES = 512;

export type DesignThumbnailRead =
  | { status: 'ok'; dataUri: string }
  | { status: 'unavailable'; reason: 'missing' | 'unreadable' };

const unavailable = (reason: 'missing' | 'unreadable'): DesignThumbnailRead => ({
  status: 'unavailable',
  reason,
});

/**
 * Read the PNG a `DesignTurnOutcomeThumbnail` refers to, as a data URI.
 *
 * `unavailable` covers every honest absence: a reference that is not the shape
 * this build writes (a future or damaged payload), a file that was deleted (the
 * session cleaned up, the user removed it), and a file that is not a readable
 * bounded PNG. The caller shows no image in all three cases; none of them is an
 * error worth telling the user about.
 */
export async function readDesignThumbnail(
  dataRoot: string,
  rawSessionId: unknown,
  rawReference: unknown
): Promise<DesignThumbnailRead> {
  // A malformed session id is a caller bug, not a missing thumbnail, and the
  // store's own rule: it throws here the same way every design read does.
  const sessionId = designId.parse(rawSessionId);
  if (
    typeof rawReference !== 'string' ||
    rawReference.length > MAX_DESIGN_TURN_OUTCOME_THUMBNAIL_REFERENCE_LENGTH ||
    !DESIGN_TURN_OUTCOME_THUMBNAIL_RE.test(rawReference)
  ) {
    return unavailable('missing');
  }

  const workspace = path.join(dataRoot, 'chats', sessionId);
  const directory = path.join(workspace, path.dirname(rawReference));
  const absolute = path.join(workspace, rawReference);
  // Belt and braces over the pattern: the reference is relative and stays put.
  const relative = path.relative(workspace, absolute);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return unavailable('missing');
  if (!(await isRealDirectory(workspace)) || !(await isRealDirectory(directory))) {
    return unavailable('missing');
  }

  // A missing file is an ordinary absence; anything else — permissions, a
  // dangling link, an IO error — is reported as unreadable rather than thrown,
  // because a card that cannot show an image is not a failed turn.
  let handle;
  try {
    handle = await open(absolute, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch {
    return unavailable('missing');
  }
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size === 0 || stat.size > MAX_THUMBNAIL_BYTES) {
      return unavailable('unreadable');
    }
    const bytes = await handle.readFile();
    const header = bytes.subarray(0, MIME_SNIFF_BYTES);
    // Signature first, then IHDR: the sniff alone would accept a file that is
    // nothing but the eight signature bytes.
    if (sniffStaticV1ImageMime(header) !== 'image/png' || readPngDimensions(header) === undefined) {
      return unavailable('unreadable');
    }
    return { status: 'ok', dataUri: `data:image/png;base64,${bytes.toString('base64')}` };
  } catch {
    return unavailable('unreadable');
  } finally {
    await handle.close();
  }
}

/** True only for a real directory: a symlink is not one, however it resolves. */
async function isRealDirectory(target: string): Promise<boolean> {
  try {
    const stat = await lstat(target);
    return stat.isDirectory() && !stat.isSymbolicLink();
  } catch {
    return false;
  }
}
