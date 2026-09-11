import { exportPptd } from '@folio/design-authoring';
import { mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { designOperation, type DesignPayload } from './store';
import { ensureDesignDirectory, type DesignWorkspace } from './workspace';
import { DesignSyncBaseline } from './sync-baseline';
import { readDesignArtifact } from './artifact';

export type DesignToolEvent =
  | { phase: 'generation'; generation: string; runtimeVersion: string }
  | {
      phase: 'call';
      generation: string;
      callId: string;
      tool: 'read' | 'write' | 'edit';
      path: string;
      partial?: boolean;
      offset?: number;
      limit?: number;
    }
  | { phase: 'result'; callId: string; isError: boolean; text?: string; partial?: boolean };

/** One active turn, created only from the daemon's resolved Session identity. */
export class DesignSyncService {
  readonly baseline = new DesignSyncBaseline();
  private revision: string | undefined;
  private projected: Map<string, Uint8Array> | undefined;
  private pending = Promise.resolve();
  private readonly writes = new Set<string>();
  private readonly seenWrites = new Set<string>();
  private artifactDigest: string | undefined;
  getAttempt() {
    const baseline = this.baseline.getAttempt();
    return baseline && this.artifactDigest
      ? { ...baseline, artifactDigest: this.artifactDigest }
      : undefined;
  }
  private readonly partialReads = new Map<string, boolean>();

  constructor(
    readonly context: {
      artworkId: string;
      workspace: DesignWorkspace;
      dataRoot: string;
      assertActive: () => void;
      read?: () => Promise<DesignPayload>;
    }
  ) {}

  handle(event: DesignToolEvent): Promise<void> {
    const operation = this.pending.then(() => this.apply(event));
    this.pending = operation.catch(() => {});
    return operation;
  }

  private async current(): Promise<DesignPayload> {
    this.context.assertActive();
    return this.context.read
      ? this.context.read()
      : designOperation(this.context.dataRoot, {
          operation: 'read',
          sessionId: this.context.artworkId,
        });
  }

  private async apply(event: DesignToolEvent): Promise<void> {
    this.context.assertActive();
    if (event.phase === 'generation') {
      if (event.runtimeVersion !== '0.85.1')
        throw Error(
          'Folio design hooks currently require verified Pi 0.85.1; choose that runtime explicitly'
        );
      this.baseline.beginGeneration(event.generation);
      return;
    }
    if (event.phase === 'result') {
      if (this.writes.delete(event.callId)) {
        if (!event.isError) {
          const artifact = await readDesignArtifact(this.context.workspace.artifactWorkdir);
          this.artifactDigest = artifact.status === 'present' ? artifact.digest : undefined;
        }
        return;
      }
      const partial = this.partialReads.get(event.callId);
      this.partialReads.delete(event.callId);
      this.baseline.finishRead(event.callId, {
        isError: event.isError,
        text: event.text,
        partial: partial === undefined || partial || event.partial === true,
      });
      return;
    }
    const { workspace, artworkId } = this.context;
    const absolute = path.resolve(workspace.workspaceRoot, event.path);
    const projectionPath = path.relative(workspace.projectionWorkdir, absolute);
    const inProjection =
      projectionPath !== '' &&
      !path.isAbsolute(projectionPath) &&
      !projectionPath.split(path.sep).includes('..');
    const draftPath = path.relative(workspace.artifactWorkdir, absolute).split(path.sep).join('/');
    const inDraft = draftPath === 'design.pptd' || /^(pages|media)\//.test(draftPath);
    if (event.tool !== 'read') {
      if (inProjection) throw Error('DESIGN_INPUT_READ_ONLY: write the separate authoring draft');
      if (!inDraft) return;
      const current = await this.current();
      this.baseline.checkWrite(event.generation, {
        artworkId,
        draftId: workspace.artifactWorkdir,
        revisionId: current.revisionId,
      });
      if (this.seenWrites.has(event.callId)) throw Error('Duplicate controlled write');
      if (this.seenWrites.size >= 10000) throw Error('Design write limit reached');
      this.seenWrites.add(event.callId);
      this.artifactDigest = undefined;
      this.writes.add(event.callId);
      return;
    }
    if (!inProjection) return;
    const current = await this.current();
    await this.project(current);
    const textFiles = new Map(
      [...(this.projected ?? [])].filter(
        ([file]) => file === 'design.pptd' || file.startsWith('pages/')
      )
    );
    const file = projectionPath.split(path.sep).join('/');
    // Native image reads are useful but do not attest the entire textual design.
    if (!textFiles.has(file)) return;
    this.baseline.beginRead(
      event.callId,
      {
        artworkId,
        draftId: workspace.artifactWorkdir,
        revisionId: current.revisionId,
        files: textFiles,
      },
      file,
      { offset: event.offset, limit: event.limit }
    );
    this.partialReads.set(event.callId, event.partial === true);
  }

  private async project(current: DesignPayload): Promise<void> {
    if (this.revision === current.revisionId) return;
    const { workspace } = this.context;
    const assets = new Map(
      Object.entries(current.assets).map(([hash, encoded]) => [
        hash,
        Buffer.from(encoded.slice(encoded.indexOf(',') + 1), 'base64'),
      ])
    );
    const files = exportPptd(current.doc as unknown as Parameters<typeof exportPptd>[0], assets);
    await ensureDesignDirectory(workspace.artifactWorkdir, workspace.projectionWorkdir);
    await mkdir(workspace.artifactWorkdir, { recursive: true });
    const staging = await mkdtemp(path.join(workspace.artifactWorkdir, '.design-projection-'));
    const previous = `${staging}-previous`;
    try {
      for (const [file, bytes] of files) {
        const destination = path.join(staging, file);
        await mkdir(path.dirname(destination), { recursive: true });
        await writeFile(destination, bytes, { flag: 'wx' });
      }
      this.context.assertActive();
      // Temporary publication paths are not artifacts and are never retained history.
      await rename(workspace.projectionWorkdir, previous).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== 'ENOENT') throw error;
      });
      await rename(staging, workspace.projectionWorkdir);
      this.projected = files;
      this.revision = current.revisionId;
    } finally {
      await rm(staging, { recursive: true, force: true });
      await rm(previous, { recursive: true, force: true });
    }
  }
}
