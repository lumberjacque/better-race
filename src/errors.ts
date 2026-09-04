/** A task rejection recorded while a `raceUntil()` call kept looking for an accepted value. */
export interface RaceUntilRejection {
  /** The task whose promise rejected. */
  readonly key: string;

  /** The original rejection reason from that task. */
  readonly reason: unknown;
}

/**
 * Thrown when every `raceUntil()` task has settled but no fulfilled value was
 * accepted. Rejections are preserved in both `errors` and `rejections`.
 */
export class NoAcceptedResultError extends AggregateError {
  /** The rejected tasks, including their keys and original reasons. */
  readonly rejections: readonly RaceUntilRejection[];

  constructor(rejections: readonly RaceUntilRejection[]) {
    super(
      rejections.map(({ reason }) => reason),
      "raceUntil() completed without an accepted result.",
    );
    this.name = "NoAcceptedResultError";
    this.rejections = rejections;
  }
}
