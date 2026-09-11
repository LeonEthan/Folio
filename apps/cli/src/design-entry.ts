import { createInterface } from 'node:readline';
import { getLodyDataDir } from '@lody/shared/node/installation-profile';
import { z } from 'zod';
import {
  acknowledgeDesign,
  designOperation,
  pendingDesigns,
  readDesignCandidate,
} from './design/store';
import { MAX_DESIGN_TURN_OUTCOME_THUMBNAIL_REFERENCE_LENGTH } from '@lody/shared';
import { readDesignThumbnail } from './design/thumbnail-read';

/** P2.5 candidate requests: same strict shape rule, same single committer. */
const candidateRequest = z
  .object({
    sessionId: z.string().uuid(),
    candidateId: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();

// ponytail: one writer queue for all canvases; use per-artwork queues if save throughput matters.
for await (const line of createInterface({ input: process.stdin, crlfDelay: Infinity })) {
  try {
    if (line.length > 64 * 1024 * 1024) throw Error('Request exceeds 64 MiB');
    const request = JSON.parse(line);
    const dataRoot = getLodyDataDir('local');
    let value: unknown;
    if (request?.operation === 'pending') {
      z.object({ operation: z.literal('pending') })
        .strict()
        .parse(request);
      value = await pendingDesigns(dataRoot);
    } else if (request?.operation === 'acknowledge') {
      const input = z
        .object({ operation: z.literal('acknowledge'), sessionId: z.string().uuid() })
        .strict()
        .parse(request);
      await acknowledgeDesign(dataRoot, input.sessionId);
      value = null;
    } else if (request?.operation === 'candidate-file') {
      const input = candidateRequest
        .extend({ operation: z.literal('candidate-file') })
        .parse(request);
      // Return the verified original file, including its embedded assets. The
      // ordinary file preview owns byte transport; never copy/rewrite history.
      const { file } = await readDesignCandidate(dataRoot, input.sessionId, input.candidateId);
      value = { path: file };
    } else if (request?.operation === 'thumbnail') {
      // The reference is bounded but not pattern-checked here: the shape rule is
      // `readDesignThumbnail`'s own, and the answer it gives a reference this
      // build does not know — a later build's history, a damaged payload — is
      // "no image", which the card renders as an ordinary absence rather than an
      // error it would have to show.
      const input = z
        .object({
          operation: z.literal('thumbnail'),
          sessionId: z.string().uuid(),
          reference: z.string().max(MAX_DESIGN_TURN_OUTCOME_THUMBNAIL_REFERENCE_LENGTH),
        })
        .strict()
        .parse(request);
      value = await readDesignThumbnail(dataRoot, input.sessionId, input.reference);
    } else value = await designOperation(dataRoot, request);
    process.stdout.write(JSON.stringify({ ok: true, value }) + '\n');
  } catch (error) {
    process.stdout.write(
      JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }) +
        '\n'
    );
  }
}
