import { costAggregator } from './cost-aggregator';
import { journalLoggingSubscriber } from './logging-subscriber';
import { knowledgeIndexer } from './knowledge-indexer';
import { memoryWriter } from './memory-writer';
import { eventMetricsSubscriber } from './metrics-subscriber';
import { reconcileJournal } from './reconcile-journal';

/** Every Inngest function served at /api/inngest (apps/web). */
export const functions = [
  journalLoggingSubscriber,
  eventMetricsSubscriber,
  reconcileJournal,
  costAggregator,
  memoryWriter,
  knowledgeIndexer,
];
