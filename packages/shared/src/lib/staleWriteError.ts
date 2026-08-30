// Thrown by useUpdatePage / useUpdateCanvas when an autosave PATCH is sent with an
// `expectedUpdatedAt` that no longer matches the row — i.e. another tab or another workspace
// editor wrote to it first (the set_*_updated_at trigger bumped `updated_at`, so the
// `.eq("updated_at", …)` filter matches zero rows and PostgREST's `.single()` returns PGRST116).
//
// The editor treats this as a hard conflict (reload, don't retry) rather than the generic
// transient-error retry path — retrying would loop forever, and merging the local edit back
// would clobber whatever the other writer just saved.
export class StaleWriteError extends Error {
  constructor() {
    super(
      "This item was changed somewhere else (another tab, or another editor) since it was last loaded here.",
    );
    this.name = "StaleWriteError";
  }
}
