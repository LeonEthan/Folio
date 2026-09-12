import path from 'node:path';
import { designId } from './store';
import { designTurnInputDir, readFrozenManifest } from './turn-input';
import { lstat, mkdir } from 'node:fs/promises';

export interface DesignWorkspace {
  /** Lody's resolved host directory; this does not change Agent cwd. */
  workspaceRoot: string;
  /** Existing per-session dispatch facts and receipts. */
  inputWorkdir: string;
  /** Only this directory's design.pptd/pages/media are Agent output. */
  artifactWorkdir: string;
  /** Application-owned projection; outside the artifact collector's allowlist. */
  projectionWorkdir: string;
}

/** No registry or relocation: identity namespaces new project drafts. */
export function resolveDesignWorkspace(args: {
  workspaceRoot: string;
  sessionId: string;
  artworkId: string;
  legacyWorkdir: string;
}): DesignWorkspace {
  designId.parse(args.artworkId);
  designId.parse(args.sessionId);
  const workspaceRoot = path.resolve(args.workspaceRoot);
  const inputWorkdir = path.resolve(args.legacyWorkdir);
  const artifactWorkdir =
    workspaceRoot === inputWorkdir
      ? inputWorkdir
      : path.join(workspaceRoot, '.folio', 'artworks', args.artworkId, args.sessionId);
  return {
    workspaceRoot,
    inputWorkdir,
    artifactWorkdir,
    projectionWorkdir: path.join(path.dirname(inputWorkdir), args.artworkId, 'design-current'),
  };
}

export function designWorkspacePointer(workspace: DesignWorkspace, turnId?: string): string {
  const inputDirectory = turnId
    ? designTurnInputDir(workspace.inputWorkdir, turnId)
    : path.join(workspace.inputWorkdir, 'design-input');
  return [
    `Design authoring directory: ${workspace.artifactWorkdir}. Write design.pptd, pages/ and media/ here; render and final collection use this directory.`,
    `Saved current canvas projection: ${workspace.projectionWorkdir}/design.pptd. Its .folio-current.json records the saved revision. This is application input, not an Agent draft or a submitted result. Copy it and its required pages/media into the authoring directory only if you choose to work from it; preserve existing drafts.`,
    `Previous chat drafts remain accessible at ${workspace.inputWorkdir}; they are never relocated or overwritten.`,
    `Frozen turn inputs and references: ${inputDirectory}. Earlier durable collection diagnostics are in ${path.join(workspace.inputWorkdir, 'design-input')}/<turnId>/receipt.json; on explicit continuation inspect the previous receipt and retained draft. Agent cwd remains ${workspace.workspaceRoot}.`,
  ].join('\n');
}

/** Manifest paths are evidence, never path authority. Legacy turns name the old chat root. */
export function resolveDesignTurnWorkspace(
  workspace: DesignWorkspace,
  manifest: { artifactWorkdir?: string; artworkId?: string },
  artworkId: string
): DesignWorkspace {
  if (manifest.artworkId !== undefined && manifest.artworkId !== artworkId) {
    throw Error('frozen design input belongs to another artwork');
  }
  if (manifest.artifactWorkdir === undefined) {
    return {
      ...workspace,
      artifactWorkdir: workspace.inputWorkdir,
    };
  }
  if (manifest.artifactWorkdir !== workspace.artifactWorkdir) {
    throw Error('design workspace changed since dispatch; frozen input and drafts were preserved');
  }
  return workspace;
}

/** Shared preparation/render/image context. Only the Session supplies workspaceRoot. */
export async function resolveDesignContext(
  args: Parameters<typeof resolveDesignWorkspace>[0] & {
    turnId?: string;
    /** Historical reads may not guess a project draft when its frozen input is absent. */
    requireTurnManifest?: boolean;
  }
): Promise<DesignWorkspace> {
  const workspace = resolveDesignWorkspace(args);
  const manifest = args.turnId
    ? await readFrozenManifest(designTurnInputDir(workspace.inputWorkdir, args.turnId), args.turnId)
    : undefined;
  if (args.requireTurnManifest && !manifest && workspace.workspaceRoot !== workspace.inputWorkdir)
    throw Error(
      'frozen design input is unavailable; original draft location cannot be established'
    );
  const resolved = manifest
    ? resolveDesignTurnWorkspace(workspace, manifest, args.artworkId)
    : workspace;
  await ensureDesignDirectory(
    resolved.artifactWorkdir === resolved.inputWorkdir
      ? resolved.inputWorkdir
      : resolved.workspaceRoot,
    resolved.artifactWorkdir
  );
  return resolved;
}

/** Reject redirected namespace components before any app write or MCP asset access. */
export async function ensureDesignDirectory(
  root: string,
  directory: string,
  create = false
): Promise<void> {
  const relative = path.relative(root, directory);
  if (path.isAbsolute(relative) || relative.split(path.sep).includes('..')) {
    throw Error('design directory escapes its trusted root');
  }
  let current = root;
  for (const component of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, component);
    if (create)
      await mkdir(current).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== 'EEXIST') throw error;
      });
    const stat = await lstat(current).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT' && !create) return undefined;
      throw error;
    });
    if (stat === undefined) return;
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw Error('design directory is redirected');
  }
}
