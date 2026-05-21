import { z } from 'zod';

// A `{ $state: "/path" }` reference. Strict so unknown keys are caught.
export const stateRefSchema = z.object({ $state: z.string() }).strict();

// Generic helper: accept literal T OR { $state: "/path" }.
// Use these in catalog prop schemas instead of bare z.string()/z.number()/z.boolean()
// for user-facing display values that should support dynamic state refs.
export const dynStr = (desc?: string) =>
  z.union([z.string(), stateRefSchema]).describe(desc ?? '');
export const dynNum = (desc?: string) =>
  z.union([z.number(), stateRefSchema]).describe(desc ?? '');
export const dynBool = (desc?: string) =>
  z.union([z.boolean(), stateRefSchema]).describe(desc ?? '');

// Wrap an arbitrary literal schema so it also accepts a `{ $state: "/path" }` ref.
// Use for action params (endpoint or model mode) whose values the model may want
// to bind to state. json-render resolves `$state` refs to literal values before
// invoking handlers, so the schema's literal branch validates the resolved-form
// at route time, while the stateRefSchema branch accepts the raw-form at spec-
// emit (catalog-prop) validation time.
export const dynParam = <T extends z.ZodTypeAny>(literal: T) =>
  z.union([literal, stateRefSchema]);
