import { createHash } from 'node:crypto';

/** Content delivery facts, independent of the runtime that observed them. */
export interface DesignReadSnapshot {
  artworkId: string;
  draftId: string;
  revisionId: string;
  /** Only the exported PPTD entry and pages, never previews or mutable drafts. */
  files: ReadonlyMap<string, Uint8Array>;
}

const digest = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');

type Read = { snapshot: DesignReadSnapshot; file: string; offset: number; limit?: number };
export interface DesignReadBaseline {
  artworkId: string;
  draftId: string;
  revisionId: string;
  contentHash: string;
  artifactDigest?: string;
  /** Only an explicit resubmission may promote unchanged inherited bytes. */
  explicitResubmission?: boolean;
}

/**
 * One active design turn. Generation captures eligibility BEFORE tool arguments
 * exist; sequential execution of a parallel tool batch cannot upgrade it.
 * Re-reading never mutates an established draft attempt's baseline.
 */
export class DesignSyncBaseline {
  private readonly reads = new Map<string, Read>();
  private readonly delivered = new Map<string, Map<string, [number, number][]>>();
  private readonly generations = new Map<
    string,
    { baseline?: DesignReadBaseline; epoch: number }
  >();
  private epoch = 0;
  private readonly seenCalls = new Set<string>();
  private latest: DesignReadBaseline | undefined;
  private attempt: DesignReadBaseline | undefined;

  beginGeneration(id: string): void {
    if (this.generations.size >= 10000) throw Error('Design generation limit reached');
    if (this.generations.has(id)) throw Error('Duplicate design generation');
    this.generations.set(id, { baseline: this.latest, epoch: this.epoch });
  }

  beginRead(
    callId: string,
    snapshot: DesignReadSnapshot,
    file: string,
    range: { offset?: number; limit?: number } = {}
  ): void {
    if (this.seenCalls.size >= 10000) throw Error('Design read limit reached');
    if (this.seenCalls.has(callId)) throw Error('Duplicate design tool call');
    this.seenCalls.add(callId);
    const bytes = snapshot.files.get(file);
    if (!bytes) throw Error('File is not part of the current design projection');
    const offset = range.offset ?? 1;
    if (
      !Number.isInteger(offset) ||
      offset < 1 ||
      (range.limit !== undefined && (!Number.isInteger(range.limit) || range.limit < 1))
    )
      throw Error('Invalid read range');
    this.reads.set(callId, { snapshot, file, offset, limit: range.limit });
  }

  /** Exact returned ranges accumulate; a partial subset never attests the whole file. */
  finishRead(callId: string, result: { isError: boolean; text?: string; partial: boolean }): void {
    const read = this.reads.get(callId);
    this.reads.delete(callId);
    if (!read || result.isError || result.partial || result.text === undefined) return;
    const { snapshot } = read;
    const source = snapshot.files.get(read.file);
    if (!source) return;
    const lines = Buffer.from(source).toString('utf8').split('\n');
    const start = read.offset - 1;
    const count = result.text.split('\n').length;
    const end = start + count;
    if (end > lines.length || (read.limit !== undefined && count > read.limit)) return;
    if (digest(lines.slice(start, end).join('\n')) !== digest(result.text)) return;
    const key = this.snapshotKey(snapshot);
    const delivered = this.delivered.get(key) ?? new Map<string, [number, number][]>();
    const ranges = [...(delivered.get(read.file) ?? []), [start, end] as [number, number]].sort(
      ([a], [b]) => a - b
    );
    const merged: [number, number][] = [];
    for (const range of ranges) {
      const previous = merged.at(-1);
      if (previous && range[0] <= previous[1]) previous[1] = Math.max(previous[1], range[1]);
      else merged.push([...range]);
    }
    delivered.set(read.file, merged);
    this.delivered.set(key, delivered);
    if (
      [...snapshot.files].every(([file, bytes]) => {
        const coverage = delivered.get(file);
        return (
          coverage?.length === 1 &&
          coverage[0]?.[0] === 0 &&
          coverage[0][1] === Buffer.from(bytes).toString('utf8').split('\n').length
        );
      })
    ) {
      this.latest = {
        artworkId: snapshot.artworkId,
        draftId: snapshot.draftId,
        revisionId: snapshot.revisionId,
        contentHash: key,
      };
    }
  }

  private eligible(
    generation: string,
    current: { artworkId: string; draftId: string; revisionId: string }
  ): DesignReadBaseline {
    const captured = this.generations.get(generation);
    if (!captured?.baseline)
      throw Error(
        'DESIGN_READ_REQUIRED: read the complete current projection before generating this operation'
      );
    if (captured.epoch !== this.epoch)
      throw Error('DESIGN_ATTEMPT_STALE: generate a new operation after the explicit resubmission');
    const baseline = captured.baseline;
    if (
      baseline.artworkId !== current.artworkId ||
      baseline.draftId !== current.draftId ||
      baseline.revisionId !== current.revisionId
    )
      throw Error(
        'DESIGN_READ_STALE: preserve the draft, read the current projection and explicitly resubmit the draft'
      );
    return baseline;
  }

  checkWrite(
    generation: string,
    current: { artworkId: string; draftId: string; revisionId: string }
  ): DesignReadBaseline {
    const eligible = this.eligible(generation, current);
    if (this.attempt && this.attempt.contentHash !== eligible.contentHash)
      throw Error(
        'DESIGN_READ_STALE: rereading does not rebase an old draft; explicitly resubmit the draft'
      );
    this.attempt ??= eligible;
    return { ...this.attempt };
  }

  resubmit(
    generation: string,
    current: { artworkId: string; draftId: string; revisionId: string }
  ): void {
    const baseline = this.eligible(generation, current);
    this.attempt = { ...baseline, explicitResubmission: true };
    this.epoch++;
  }

  isCurrentGeneration(generation: string): boolean {
    return this.generations.get(generation)?.epoch === this.epoch;
  }

  getAttempt(): DesignReadBaseline | undefined {
    return this.attempt ? { ...this.attempt } : undefined;
  }

  private snapshotKey(snapshot: DesignReadSnapshot): string {
    const hash = createHash('sha256');
    hash.update(JSON.stringify([snapshot.artworkId, snapshot.draftId, snapshot.revisionId]));
    for (const [file, bytes] of [...snapshot.files].sort(([a], [b]) => a.localeCompare(b))) {
      hash.update(JSON.stringify([file, bytes.byteLength]));
      hash.update(bytes);
    }
    return hash.digest('hex');
  }
}
