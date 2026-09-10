import { createInterface } from 'node:readline';
import { getLodyDataDir } from '@lody/shared/node/installation-profile';
import { z } from 'zod';
import {
  acknowledgeDesign,
  adoptDesignCandidate,
  designOperation,
  discardDesignCandidate,
  pendingDesigns,
  readDesignCandidateState,
} from './design/store';

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
    } else if (request?.operation === 'candidate-state') {
      const input = candidateRequest
        .extend({ operation: z.literal('candidate-state') })
        .parse(request);
      value = await readDesignCandidateState(dataRoot, input.sessionId, input.candidateId);
    } else if (request?.operation === 'adopt-candidate') {
      const input = candidateRequest
        .extend({ operation: z.literal('adopt-candidate') })
        .parse(request);
      value = await adoptDesignCandidate(dataRoot, input.sessionId, input.candidateId);
    } else if (request?.operation === 'discard-candidate') {
      const input = candidateRequest
        .extend({ operation: z.literal('discard-candidate') })
        .parse(request);
      value = await discardDesignCandidate(dataRoot, input.sessionId, input.candidateId);
    } else value = await designOperation(dataRoot, request);
    process.stdout.write(JSON.stringify({ ok: true, value }) + '\n');
  } catch (error) {
    process.stdout.write(
      JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }) +
        '\n'
    );
  }
}
