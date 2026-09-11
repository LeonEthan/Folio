# Drain the design worker before application exit

Status: implemented
Translation: pending
Date: 2026-09-12

## Abstract

An installed diagnostic observed a design read from an orphan worker after Electron
closed, during directory cleanup. The existing design service ended stdin only when
an editor was open and did not wait for its queued work or child exit. Application
quit now flushes editors first, seals worker admission, drains accepted requests and
waits for the worker's exit. Missing artwork reads also stop creating directories.
Normal installed regression remains necessary; this does not attribute every earlier
cleanup failure to this worker.

## Evidence and decision

The [installed matrix](../../proposed/testing/2026-09-11-installed-five-agent-matrix.md)
owns the diagnostic history and exact evidence. Its second instrumented creation
site observed a late `read` with PPID 1 inside the cleanup window. Recursive mkdir
completion proves that call returned, not that it created a new directory. That
round exited successfully despite the orphan, so successful cleanup alone did not
establish a correct application shutdown.

Keep the existing JSON-line worker and serial request queue. A close operation
seals new admissions synchronously, allows already accepted operations to finish,
ends stdin and awaits the actual child exit event. Failed operations do not skip
the remaining accepted queue. A closed worker cannot start again. No retry, grace
period, new IPC or process scheduler is introduced. Removing read's mkdir alone
would leave the observed orphan lifetime unaddressed.

Editor flush and its existing cancellation decision precede shutdown. Cancelling
quit retains usable views and a usable worker; successful flush disposes views and
then drains the worker. Normal application quit performs this even without open
Bento views. Existing direct verification and fatal exits also await worker close.
Create/save still create their directory and retain existing validation, locking,
asset and revision checks. Missing reads reject without creating filesystem state.

## Verification and limits

Deterministic worker tests use explicit response, stream-finish and child-exit
signals to verify queued draining, admission rejection, failure handling, cancelled
quit reuse and save-before-dispose ordering. The store test observes ENOENT and an
absent chats directory after a missing read. No harness timeout or cleanup behavior
changes. No installed build or native run is part of this source change; root will
coordinate the normal package regression. The barrier does not add a timeout or
claim that a hung worker will exit on its own.

Source validation passed: root `pnpm check` (including public boundaries) and
`pnpm format`. Documentation validation was rerun after adding translation metadata.
