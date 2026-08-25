// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Row } from './row';

describe('Row renderer', () => {
  afterEach(cleanup);

  it('renders children inside a flex wrapper', () => {
    render(
      <Row>
        <span>alpha</span>
        <span>beta</span>
      </Row>,
    );
    expect(screen.getByText('alpha')).toBeInTheDocument();
    expect(screen.getByText('beta')).toBeInTheDocument();
    const wrapper = document.querySelector('[data-slot="row"]');
    expect(wrapper).not.toBeNull();
    expect(wrapper).toHaveClass('flex');
    expect(wrapper).toHaveClass('w-full');
  });

  it.each([
    { gap: 'tight' as const, expectedClass: 'gap-2' },
    { gap: 'normal' as const, expectedClass: 'gap-4' },
    { gap: 'loose' as const, expectedClass: 'gap-6' },
  ])('applies the $gap gap class', ({ gap, expectedClass }) => {
    render(
      <Row gap={gap}>
        <span>child</span>
      </Row>,
    );
    const wrapper = document.querySelector('[data-slot="row"]');
    expect(wrapper).toHaveClass(expectedClass);
  });

  it.each([
    { align: 'start' as const, expectedClass: 'items-start' },
    { align: 'center' as const, expectedClass: 'items-center' },
    { align: 'end' as const, expectedClass: 'items-end' },
    { align: 'stretch' as const, expectedClass: 'items-stretch' },
  ])('applies the $align align class', ({ align, expectedClass }) => {
    render(
      <Row align={align}>
        <span>child</span>
      </Row>,
    );
    const wrapper = document.querySelector('[data-slot="row"]');
    expect(wrapper).toHaveClass(expectedClass);
  });

  it('uses normal gap and stretch align by default', () => {
    render(
      <Row>
        <span>child</span>
      </Row>,
    );
    const wrapper = document.querySelector('[data-slot="row"]');
    expect(wrapper).toHaveClass('gap-4');
    expect(wrapper).toHaveClass('items-stretch');
  });

  // A Row of Badges used to stretch each pill into an equal slot, leaving one
  // badge marooned per third of the card. Hugging + wrapping is now the
  // default; equal columns are opt-in for KPI/Chart/Table rows.
  it('hugs and wraps by default so small children keep their natural width', () => {
    render(
      <Row>
        <span>child</span>
      </Row>,
    );
    const wrapper = document.querySelector('[data-slot="row"]');
    expect(wrapper).toHaveClass('flex-wrap');
    expect(wrapper).toHaveAttribute('data-fill', 'false');
  });

  it('does not wrap when fill is set, so slots stay on one line', () => {
    render(
      <Row fill>
        <span>child</span>
      </Row>,
    );
    const wrapper = document.querySelector('[data-slot="row"]');
    expect(wrapper).not.toHaveClass('flex-wrap');
    expect(wrapper).toHaveAttribute('data-fill', 'true');
  });
});
