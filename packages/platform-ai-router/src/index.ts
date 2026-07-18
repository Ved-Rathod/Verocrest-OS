// @verocrest/platform-ai-router — client-safe surface: types + pure logic
// (pricing math, capability catalogue, prompt registry pure parts, circuit
// breaker, budget gate). The runtime — createRouter/createServerRouter and the
// provider registry — is server-only: './server'.
export {
  MEMORY_SCOPES,
  RouterError,
  type Capability,
  type CapabilityConfig,
  type MemoryHitCitation,
  type MemoryScope,
  type RouterCall,
  type RouterErrorCode,
  type RouterMetadata,
  type RouterResult,
  type RouterWorkspaceContext,
} from './types';
export {
  MODEL_PRICING,
  actualCostUsd,
  estimateCostUsd,
  estimateTokens,
  getModelPricing,
  type ModelPricing,
} from './pricing';
export { CAPABILITY_CONFIGS, getCapabilityConfig } from './capabilities';
export { BASELINE_PROMPTS, getBaselinePrompt, type PromptDefinition } from './prompts/baselines';
export {
  clearPromptCacheForTests,
  promptHash,
  resolvePrompt,
  substituteVariables,
  type PromptStore,
  type ResolvedPrompt,
} from './prompts/registry';
export { checkBudget, resetBudgetWarningsForTests, type BudgetCheckResult } from './budget';
export {
  isCallAllowed,
  recordFailure,
  recordSuccess,
  resetCircuitBreakersForTests,
} from './circuit-breaker';
export {
  MEMORY_POLICY,
  assertScopesAllowed,
  chunkText,
  getMemoryPolicy,
  memoryContentHash,
  queryHash,
  resetQueryEmbeddingCacheForTests,
  withMemory,
  writeMemory,
  type Chunk,
  type MemoryHit,
  type MemoryPolicy,
  type MemoryRequest,
  type MemoryStore,
  type MemoryWriteRecord,
} from './memory';
