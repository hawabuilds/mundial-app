/** Auto-inserted fixtures await an X thread before collection may run. */
export const FIXTURE_STATUS_NEEDS_THREAD = "needs_thread";

/** Tweet id registered — eligible for collection when kickoff window opens. */
export const FIXTURE_STATUS_READY = "ready";

export type FixtureLifecycleStatus =
  | typeof FIXTURE_STATUS_NEEDS_THREAD
  | typeof FIXTURE_STATUS_READY
  | null;
