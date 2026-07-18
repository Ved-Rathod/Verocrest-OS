/**
 * Next.js instrumentation hook — runs once when the server process starts.
 * Registers the concrete Inngest publisher into platform-event-bus so that the
 * post-commit `publishToBus` calls in domain services fan out onto the bus
 * (Sprint 3.2 decisions #2 + #4). Guarded to the Node.js runtime — the Edge
 * middleware runtime never emits.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { registerBusPublisher } = await import('@verocrest/platform-jobs/server');
    registerBusPublisher();
  }
}
