// @vitest-environment jsdom

/**
 * W — NewChatButton regression guard.
 *
 * Asserts:
 *   1. Clicking NewChatButton triggers window.location.assign('/chat') when
 *      chat status is 'ready'.
 *   2. Clicking NewChatButton does NOT navigate when status is 'streaming'
 *      or 'submitted'.
 *
 * The Sidebar uses useChatStatus() to read status from ChatStatusContext.
 * Tests mount with a controlled ChatStatusContext value to avoid wiring the
 * full layout tree.
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// We test only the NewChatButton behaviour, so we stub out the heavier
// sub-components that appear in Sidebar.
// ---------------------------------------------------------------------------

vi.mock('@/components/sidebar/sidebar-list', () => ({
  SidebarList: () => null,
}));

vi.mock('@/components/sidebar/account-section', () => ({
  AccountSection: () => null,
}));

vi.mock('@/components/theme-toggle', () => ({
  ThemeToggle: () => null,
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('@/components/ui/sheet', () => ({
  Sheet: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SheetContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SheetHeader: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SheetTitle: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  SheetTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import type React from 'react';
import { ChatStatusContext } from './chat-status-context';
import { Sidebar } from './sidebar';

afterEach(cleanup);

// jsdom does not allow vi.spyOn(window.location, 'assign') because the
// property is not writable. Replace the whole location object with a plain
// object that carries a vi.fn() for assign, then restore it in cleanup.
let assignMock: ReturnType<typeof vi.fn>;

function mockLocationAssign() {
  assignMock = vi.fn();
  Object.defineProperty(window, 'location', {
    value: { assign: assignMock },
    writable: true,
    configurable: true,
  });
}

function restoreLocation() {
  Object.defineProperty(window, 'location', {
    value: { assign: (() => {}) as typeof window.location.assign },
    writable: true,
    configurable: true,
  });
}

// ---------------------------------------------------------------------------
// Helper: render Sidebar with a controlled chat status
// ---------------------------------------------------------------------------

function renderWithStatus(status: 'ready' | 'streaming' | 'submitted' | 'error') {
  const setStatus = vi.fn();
  return render(
    <ChatStatusContext.Provider value={{ status, setStatus }}>
      <Sidebar user={null} />
    </ChatStatusContext.Provider>,
  );
}

describe('W — NewChatButton: navigates on click when ready', () => {
  it('calls window.location.assign("/chat") when status is ready', () => {
    mockLocationAssign();
    renderWithStatus('ready');

    // Desktop sidebar renders the first NewChatButton.
    const buttons = screen.getAllByRole('button', { name: /new chat/i });
    fireEvent.click(buttons[0]);

    expect(assignMock).toHaveBeenCalledWith('/chat');
    restoreLocation();
  });
});

describe('W — NewChatButton: does NOT navigate when streaming or submitted', () => {
  it('is disabled and does not navigate when status is "streaming"', () => {
    mockLocationAssign();
    renderWithStatus('streaming');

    const buttons = screen.getAllByRole('button', { name: /new chat/i });
    expect(buttons[0]).toBeDisabled();
    fireEvent.click(buttons[0]);
    expect(assignMock).not.toHaveBeenCalled();
    restoreLocation();
  });

  it('is disabled and does not navigate when status is "submitted"', () => {
    mockLocationAssign();
    renderWithStatus('submitted');

    const buttons = screen.getAllByRole('button', { name: /new chat/i });
    expect(buttons[0]).toBeDisabled();
    fireEvent.click(buttons[0]);
    expect(assignMock).not.toHaveBeenCalled();
    restoreLocation();
  });
});
