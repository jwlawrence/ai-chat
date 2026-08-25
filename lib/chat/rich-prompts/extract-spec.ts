/**
 * Pull the literal "Spec shape:" JSON block out of a rich chip prompt.
 *
 * Every rich prompt ends with a `Spec shape:` marker followed by the exact
 * JSON the model is told to reproduce. Both the spec-shape test and the
 * Storybook stories read the real prompt through this helper rather than
 * keeping their own copy, so a story can never drift from what the chip
 * actually asks the model to draw.
 */
export const SPEC_SHAPE_MARKER = 'Spec shape:';

export function extractSpecShape(prompt: string): unknown {
  const idx = prompt.lastIndexOf(SPEC_SHAPE_MARKER);
  if (idx === -1) {
    throw new Error(`rich prompt is missing its "${SPEC_SHAPE_MARKER}" marker`);
  }
  return JSON.parse(prompt.slice(idx + SPEC_SHAPE_MARKER.length).trim());
}
