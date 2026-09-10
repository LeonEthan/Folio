/**
 * PPTD authoring snapshot collection seam (adapted from the pinned upstream;
 * see source-manifest.json). This is the trust boundary: allowlist + lstat
 * without following links. Consumers only receive the collected Map.
 *
 * Folio adaptation: the only authoring entry is `design.pptd` (upstream also
 * admitted the runner-era case.yaml / commands.json / prompt.txt roots).
 * Upstream's AuthoringSnapshotError is replaced by a local error class so
 * the CAS workspace module is not migrated.
 */

import { lstatSync, readdirSync, readFileSync, realpathSync, type Stats } from "node:fs";
import { join, sep } from "node:path";

/** Snapshot collection integrity failure (symlink/hardlink/escape/non-regular). */
export class AuthoringSnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthoringSnapshotError";
  }
}

const ENTRY_PPTD = "design.pptd";
const ROOT_FILES = new Set([ENTRY_PPTD]);

function lstatOptional(path: string, label: string): Stats | null {
  try {
    return lstatSync(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new AuthoringSnapshotError(`collectAuthoring: lstat failed: ${label}: ${String(error)}`);
  }
}

/** 唯一 relpath 语法：design.pptd | pages/<单段>.page | media/<单段>。intake 与守护进程采集共用。 */
export function isAuthoringRelPath(rel: string): boolean {
  if (ROOT_FILES.has(rel)) return true;
  const pages = /^pages\/([^/]+)\.page$/.exec(rel);
  if (pages !== null && pages[1] !== "." && pages[1] !== "..") return true;
  const media = /^media\/([^/]+)$/.exec(rel);
  if (media !== null && media[1] !== "." && media[1] !== "..") return true;
  return false;
}

const posix = (p: string): string => p.split(sep).join("/");

export function collectAuthoring(dir: string): Map<string, Uint8Array> {
  let rootStat;
  try {
    rootStat = lstatSync(dir);
  } catch (error) {
    throw new AuthoringSnapshotError(`collectAuthoring: dir unreadable: ${String(error)}`);
  }
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
    throw new AuthoringSnapshotError("collectAuthoring: dir must be a real directory (not a symlink)");
  }
  const rootReal = realpathSync(dir);
  const out = new Map<string, Uint8Array>();

  // mustExist=true：entry 来自 readdir 列表，随后 lstat ENOENT = 采集期文件被抽走（TOCTOU），拒。
  const takeFile = (rel: string, mustExist = false): void => {
    const abs = join(dir, rel);
    const st = lstatOptional(abs, rel);
    if (st === null) {
      if (mustExist) {
        throw new AuthoringSnapshotError(`collectAuthoring: lstat failed: ${rel}: ENOENT`);
      }
      return;
    }
    if (st.isSymbolicLink()) {
      throw new AuthoringSnapshotError(`collectAuthoring: symlink rejected: ${rel}`);
    }
    if (!st.isFile()) {
      throw new AuthoringSnapshotError(`collectAuthoring: not a regular file: ${rel}`);
    }
    if (st.nlink !== 1) {
      throw new AuthoringSnapshotError(`collectAuthoring: hardlink rejected: ${rel} (nlink=${st.nlink})`);
    }
    const real = realpathSync(abs);
    const prefix = rootReal.endsWith(sep) ? rootReal : `${rootReal}${sep}`;
    if (real !== rootReal && !real.startsWith(prefix)) {
      throw new AuthoringSnapshotError(`collectAuthoring: path escapes dir: ${rel}`);
    }
    out.set(posix(rel), new Uint8Array(readFileSync(abs)));
  };

  for (const rootFile of ROOT_FILES) takeFile(rootFile);

  const takeDir = (subdir: string, accept: (name: string) => string | undefined): void => {
    const abs = join(dir, subdir);
    const st = lstatOptional(abs, subdir);
    if (st === null) return;
    if (st.isSymbolicLink()) {
      throw new AuthoringSnapshotError(`collectAuthoring: symlink rejected: ${subdir}`);
    }
    if (!st.isDirectory()) {
      throw new AuthoringSnapshotError(`collectAuthoring: not a directory: ${subdir}`);
    }
    for (const name of readdirSync(abs)) {
      const rel = accept(name);
      if (rel === undefined) {
        // 非 allowlist 入口：若是非普通文件（symlink/FIFO）仍须拒绝，不能静默跳过后门。
        const child = join(abs, name);
        const childSt = lstatSync(child);
        if (childSt.isSymbolicLink() || childSt.isFIFO() || childSt.isSocket() || childSt.isCharacterDevice() || childSt.isBlockDevice()) {
          throw new AuthoringSnapshotError(`collectAuthoring: non-regular entry rejected: ${subdir}/${name}`);
        }
        if (childSt.isFile() && childSt.nlink !== 1) {
          throw new AuthoringSnapshotError(`collectAuthoring: hardlink rejected: ${subdir}/${name} (nlink=${childSt.nlink})`);
        }
        // `pages/..page` 解析为 name=`.`，语法已拒；不得当普通非 allowlist 静默跳过。
        const attempted = `${subdir}/${name}`;
        const component = (/^pages\/([^/]+)\.page$/.exec(attempted) ?? /^media\/([^/]+)$/.exec(attempted))?.[1];
        if (component === ".") {
          throw new AuthoringSnapshotError(`collectAuthoring: relpath rejected: ${attempted}`);
        }
        continue;
      }
      takeFile(rel, true);
    }
  };

  takeDir("pages", (name) => (isAuthoringRelPath(`pages/${name}`) ? `pages/${name}` : undefined));
  takeDir("media", (name) => (isAuthoringRelPath(`media/${name}`) ? `media/${name}` : undefined));

  assertAuthoringEntry(out.keys());
  return out;
}

/** A collected authoring snapshot must contain exactly the design.pptd entry. */
export function assertAuthoringEntry(paths: Iterable<string>): void {
  const keys = new Set(paths);
  if (!keys.has(ENTRY_PPTD)) throw new AuthoringSnapshotError("authoring entry missing (design.pptd)");
}
