import { describe, expect, it } from 'vitest';
import { buildSignInSpec, writeServerCard } from './server-card';

describe('buildSignInSpec', () => {
  it('uses type: not component: for element keys', () => {
    const spec = buildSignInSpec();
    for (const el of Object.values(spec.elements)) {
      expect(el).toHaveProperty('type');
      expect(el).not.toHaveProperty('component');
    }
  });

  it('contains exactly one Heading + two Buttons', () => {
    const spec = buildSignInSpec();
    const types = Object.values(spec.elements).map((e) => e.type);
    expect(types.filter((t) => t === 'Heading')).toHaveLength(1);
    expect(types.filter((t) => t === 'Button')).toHaveLength(2);
  });

  it('each Button binds signInWith with a valid provider', () => {
    const spec = buildSignInSpec();
    const buttons = Object.values(spec.elements).filter((e) => e.type === 'Button');
    const providers = buttons.map(
      (b) => (b.on as unknown as { press: { params: { provider: string } } }).press.params.provider,
    );
    expect(providers.sort()).toEqual(['github', 'google']);
    for (const b of buttons) {
      expect((b.on as unknown as { press: { action: string } }).press.action).toBe('signInWith');
    }
  });

  it('Button variants are valid catalog variants', () => {
    const spec = buildSignInSpec();
    const buttons = Object.values(spec.elements).filter(
      (e) => e.type === 'Button',
    ) as unknown as Array<{
      props: { variant: string };
    }>;
    const allowed = new Set(['primary', 'secondary', 'ghost', 'destructive']);
    for (const b of buttons) {
      expect(allowed.has(b.props.variant)).toBe(true);
    }
  });

  it('root element points to a valid element key', () => {
    const spec = buildSignInSpec();
    expect(spec.elements[spec.root]).toBeDefined();
  });

  it('returns a spec that passes specSchema validation', async () => {
    const { specSchema } = await import('@/lib/ai/tools/render-ui');
    const spec = buildSignInSpec();
    const result = specSchema.safeParse(spec);
    expect(result.success).toBe(true);
  });
});

describe('writeServerCard', () => {
  it('writes tool-input-available then tool-output-available with matching toolCallId', () => {
    const writes: unknown[] = [];
    const writer = { write: (chunk: unknown) => writes.push(chunk) };
    const spec = buildSignInSpec();
    const id = writeServerCard(
      writer as unknown as Parameters<typeof writeServerCard>[0],
      spec,
      'fixed-id',
    );
    expect(id).toBe('fixed-id');
    expect(writes).toHaveLength(2);
    expect(writes[0]).toMatchObject({
      type: 'tool-input-available',
      toolCallId: 'fixed-id',
      toolName: 'renderUI',
    });
    expect(writes[1]).toMatchObject({
      type: 'tool-output-available',
      toolCallId: 'fixed-id',
      output: { root: 'card' },
    });
  });

  it('puts buildSignInSpec output in the input chunk', () => {
    const writes: Array<{ input?: unknown }> = [];
    const writer = { write: (chunk: { input?: unknown }) => writes.push(chunk) };
    const spec = buildSignInSpec();
    writeServerCard(writer as unknown as Parameters<typeof writeServerCard>[0], spec, 'x');
    expect(writes[0].input).toEqual(spec);
  });

  it('generates a unique toolCallId when none provided', () => {
    const writes: Array<{ toolCallId: string }> = [];
    const writer = { write: (chunk: { toolCallId: string }) => writes.push(chunk) };
    const spec = buildSignInSpec();
    const a = writeServerCard(writer as unknown as Parameters<typeof writeServerCard>[0], spec);
    const b = writeServerCard(writer as unknown as Parameters<typeof writeServerCard>[0], spec);
    expect(a).not.toBe(b);
    expect(writes[0].toolCallId).toBe(a);
    expect(writes[2].toolCallId).toBe(b);
  });

  it('throws and logs when given an invalid spec', () => {
    const writes: unknown[] = [];
    const writer = { write: (chunk: unknown) => writes.push(chunk) };
    const invalidSpec = { root: 123, elements: 'not-an-object' } as unknown as Parameters<
      typeof writeServerCard
    >[1];
    expect(() =>
      writeServerCard(writer as unknown as Parameters<typeof writeServerCard>[0], invalidSpec, 'x'),
    ).toThrow('Invalid server-card spec');
    expect(writes).toHaveLength(0);
  });
});
