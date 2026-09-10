#!/usr/bin/env node
// finalize.mjs — validate a PPTD draft with the shared Folio PPTD validator
// (the same code the Folio daemon runs at intake after your turn) and promote
// it to design.pptd when clean.
//
// Usage: node finalize.mjs <path/to/design.pptd[.tmp]>
//
// Exit 0 (renaming a .tmp draft to design.pptd) on success; exit 1 with one
// "CODE path: message" line per diagnostic on failure. This is a self-check
// convenience, not a gate: Folio re-validates at intake regardless, and you
// may promote the draft yourself as long as the final entry is design.pptd.
//
// The validator ships pre-bundled in ./lib/folio-pptd.mjs (built from
// @folio/design-authoring at the app's pinned upstream revision), so this
// script runs anywhere Node 22+ is available, with no repo checkout.

import { existsSync, renameSync } from 'node:fs';
import path from 'node:path';
import { validate } from './lib/folio-pptd.mjs';

const draft = process.argv[2];
const isTmpDraft = typeof draft === 'string' && draft.endsWith('.pptd.tmp');
const isFinal = typeof draft === 'string' && path.basename(draft) === 'design.pptd';
if (!draft || (!isTmpDraft && !isFinal) || !existsSync(draft)) {
  console.error('usage: node finalize.mjs <path/to/design.pptd[.tmp]> (file must exist)');
  process.exit(2);
}

const resolved = path.resolve(draft);
const result = validate(resolved, { projectRoot: path.dirname(resolved) });

if (!result.ok) {
  for (const d of result.diagnostics) {
    console.error(`${d.code} ${d.path}: ${d.message}`);
  }
  console.error(`finalize: ${result.diagnostics.length} diagnostic(s); draft left in place`);
  process.exit(1);
}

if (isTmpDraft) {
  const target = resolved.slice(0, -'.tmp'.length);
  renameSync(resolved, target);
  console.log(`finalize: OK → ${target}`);
} else {
  console.log(`finalize: OK → ${resolved}`);
}
