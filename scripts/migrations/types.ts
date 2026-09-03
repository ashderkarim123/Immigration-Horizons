/**
 * Migration contract (ADR-014).
 *
 * Every migration is a single `run({ dryRun })` rather than a plan/apply
 * pair, so the dry run cannot drift from what apply actually does — the two
 * execute the same code down to the last branch, and only the final write
 * is skipped. A dry run that is a separate reimplementation is a dry run
 * that lies.
 */

export type MigrationReport = {
  /** Documents that matched and would be (or were) changed. */
  changed: number;
  /** Documents already in the target state — proof of idempotency. */
  alreadyDone: number;
  /**
   * Documents that matched the shape but could NOT be resolved safely.
   *
   * Never silently dropped: module 11's acceptance criteria require that no
   * migration discards unresolved data, so these are counted, sampled, and
   * printed. Leaving a record untouched is always the correct outcome when
   * the right answer is ambiguous.
   */
  unresolved: number;
  /** Human-readable examples, capped — never the whole collection. */
  samples: string[];
  /** Why records went unresolved, keyed by reason. */
  unresolvedReasons: Record<string, number>;
};

export type Migration = {
  /** Stable, ordered identifier — `001-…`. Never renumber a shipped one. */
  id: string;
  description: string;
  /**
   * Why this migration exists and what it deliberately does not do.
   * Printed by the runner, so an operator sees the reasoning at the moment
   * they decide whether to apply it.
   */
  rationale: string;
  run(options: { dryRun: boolean }): Promise<MigrationReport>;
};

export function emptyReport(): MigrationReport {
  return { changed: 0, alreadyDone: 0, unresolved: 0, samples: [], unresolvedReasons: {} };
}

/** Caps the sample list so a migration over a large collection stays readable. */
export function addSample(report: MigrationReport, sample: string, limit = 10) {
  if (report.samples.length < limit) report.samples.push(sample);
}

export function noteUnresolved(report: MigrationReport, reason: string) {
  report.unresolved += 1;
  report.unresolvedReasons[reason] = (report.unresolvedReasons[reason] || 0) + 1;
}
