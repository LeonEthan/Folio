# Bento resource CI verification

Status: proposed
Translation: pending

## Abstract

Folio needs evidence that its pinned Bento resource closure builds on macOS,
Windows and Linux. A dedicated verification branch runs the same builder and
resource hash probe on all three GitHub-hosted platforms. It publishes no app
and uses a read-only repository token. Results remain pending until the jobs finish.

## Scope

The branch contains only the resource package, submodule registration and CI
workflow. The package README records source provenance and license boundaries.
Checkout disables automatic CRLF conversion so source hashes and patches retain
their pinned bytes on Windows. This tests resource compilation and integrity;
it does not establish Windows/Linux Electron runtime or installer support.
