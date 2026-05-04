/**
 * Empty teardown — the next run's globalSetup drops the schema before
 * re-applying migrations, so we don't need to clean up here.
 *
 * If you ever need to release resources (containers, network handles), do
 * it from this hook.
 */
export default async function globalTeardown(): Promise<void> {}
