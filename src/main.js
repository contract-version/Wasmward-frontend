import { createVersionGuard } from '@wasmward/core';
import { createApp } from './app.js';
import { CONTRACT_ID, configFor, PROFILE_NAMES } from './demo-config.js';

// The page itself: the real document and the real Wasmward guard. The behaviour is in app.js.
void createApp({
  document,
  createGuard: createVersionGuard,
  configFor,
  contractId: CONTRACT_ID,
  profileNames: PROFILE_NAMES,
}).run();
