import { z } from 'zod';

// Re-export the global registry for convenience, though direct usage of z.globalRegistry is also fine.
export const registry = z.globalRegistry;
