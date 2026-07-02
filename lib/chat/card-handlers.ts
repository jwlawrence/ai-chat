import type { UseChatHelpers } from '@ai-sdk/react';
import type { StateStore } from '@json-render/core';
import type { UIMessage } from 'ai';
import { toast } from 'sonner';
import { CONTACT_FALLBACK_EMAIL } from '@/lib/brand/site';
import { makePressPart } from '@/lib/chat/press';
import {
  CONTACT_REQUIRED_FIELDS,
  parseContactFormFields,
  sendContactFormToEmail,
  validateContactFields,
} from '@/lib/contact/web3forms';
import { ACTION_REGISTRY } from '@/lib/json-render/catalog';

// ---------------------------------------------------------------------------
// Card action dispatchers — pure handler factories for RenderUICard
//
// Extracted from components/chat/conversation.tsx so unit tests can exercise
// lock/rollback/dispatch behaviour without mounting React, and so the
// component file stays presentation-only.
// ---------------------------------------------------------------------------

export type SendMessage = UseChatHelpers<UIMessage>['sendMessage'];

/** How long the email-delivery-failure toast stays on screen. */
const CONTACT_FAILURE_TOAST_MS = 10_000;

const CONTACT_FAILURE_DESCRIPTION = `The form submission did not reach Josh. Please email ${CONTACT_FALLBACK_EMAIL} directly.`;

/**
 * Build one async handler per endpoint-mode action.
 * Exported so unit tests can exercise it directly without mounting React.
 *
 * Supports two metadata fields from ACTION_REGISTRY:
 *  - `oneShot: true` — locks the card on press (mirrors sendToModel); rolls back on failure.
 *  - `responseEffect: 'navigate'` — reads `redirectTo` from the 2xx response body and
 *    calls navigate(url) after same-origin URL validation.
 */
export function buildEndpointHandlers(opts: {
  store: StateStore;
  inFlightRef: { current: Map<string, symbol> };
  actionNames: ReadonlySet<string>;
  lockedRef?: { current: boolean };
  setIsLocked?: (v: boolean) => void;
  navigate?: (url: string) => void;
}): Record<string, (params: Record<string, unknown>) => Promise<void>> {
  const navigate = opts.navigate ?? ((url: string) => window.location.assign(url));
  const { store, inFlightRef, actionNames } = opts;
  const entries = [...actionNames].map((actionName) => {
    const def = ACTION_REGISTRY.get(actionName);
    const oneShot = def?.oneShot === true;
    const responseEffect = def?.responseEffect;
    return [
      actionName,
      async (params: Record<string, unknown>) => {
        // oneShot guard — lock before fetch so double-click can't slip through.
        if (oneShot) {
          if (opts.lockedRef?.current) return;
          if (opts.lockedRef) opts.lockedRef.current = true;
          opts.setIsLocked?.(true);
        }

        const rollback = () => {
          if (oneShot) {
            if (opts.lockedRef) opts.lockedRef.current = false;
            opts.setIsLocked?.(false);
          }
        };

        const writeResponseTo =
          typeof params._writeResponseTo === 'string' ? params._writeResponseTo : undefined;
        const setPendingAt =
          typeof params._setPendingAt === 'string' ? params._setPendingAt : undefined;

        const postParams = Object.fromEntries(
          Object.entries(params).filter(([k]) => k !== '_writeResponseTo' && k !== '_setPendingAt'),
        );

        const key = writeResponseTo ?? actionName;
        const token = Symbol();
        inFlightRef.current.set(key, token);
        const isLatest = () => inFlightRef.current.get(key) === token;

        if (setPendingAt) {
          store.set(setPendingAt, true);
        }

        try {
          const res = await fetch(`/api/actions/${actionName}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(postParams),
          });
          if (!res.ok) {
            if (isLatest()) toast.error(`Action "${actionName}" failed (${res.status})`);
            rollback();
            return;
          }
          if (responseEffect === 'navigate') {
            const body = (await res.json().catch(() => null)) as { redirectTo?: string } | null;
            if (!body?.redirectTo || typeof body.redirectTo !== 'string') {
              toast.error(`Action "${actionName}" failed (no redirect URL)`);
              rollback();
              return;
            }
            if (!body.redirectTo.startsWith('/') || body.redirectTo.startsWith('//')) {
              toast.error(`Action "${actionName}" failed (unexpected redirect)`);
              rollback();
              return;
            }
            navigate(body.redirectTo);
            // No rollback — page is navigating away.
            return;
          }
          // Default endpoint dispatch: write response body to state if requested.
          if (writeResponseTo) {
            let body: unknown;
            try {
              body = await res.json();
            } catch {
              if (isLatest()) {
                toast.error(`Action "${actionName}" returned an invalid response`);
              }
              rollback();
              return;
            }
            if (isLatest()) store.set(writeResponseTo, body);
          }
        } catch (err) {
          if (isLatest()) toast.error(`Action "${actionName}" could not be reached`);
          console.error('[RenderUICard] endpoint action failed', actionName, err);
          rollback();
        } finally {
          if (setPendingAt && isLatest()) {
            store.set(setPendingAt, false);
          }
        }
      },
    ];
  });
  return Object.fromEntries(entries);
}

/**
 * Build the submitForm handler with mutable lock refs injected.
 * Exported so unit tests can exercise lock/rollback behaviour without React.
 */
export function buildSubmitFormHandler(opts: {
  store: StateStore;
  lockedRef: { current: boolean };
  setIsLocked: (v: boolean) => void;
  sendMessage: SendMessage;
  specRoot: string;
}): (params: Record<string, unknown>) => Promise<void> {
  const { store, lockedRef, setIsLocked, sendMessage, specRoot } = opts;
  return async (params: Record<string, unknown>) => {
    // Re-entry guard — must stay at the very top.
    if (lockedRef.current) return;

    const formName = String(params.formName ?? '');
    if (!formName) return;

    const formData = (store.get(`/${formName}`) as Record<string, unknown> | undefined) ?? {};

    // Contact form: run client-side validation BEFORE acquiring the lock or
    // sending anything. Errors are written to /_errors/contact/<field> so
    // field components can display them inline without touching the form data
    // itself. If any field is invalid, return early — the card stays editable.
    if (formName === 'contact') {
      const errors = validateContactFields(formData);
      for (const field of CONTACT_REQUIRED_FIELDS) {
        store.set(`/_errors/contact/${field}`, errors[field] ?? undefined);
      }
      if (Object.keys(errors).length > 0) return;
    }

    // All validation passed (or non-contact form) — acquire lock and proceed.
    lockedRef.current = true;
    setIsLocked(true);

    const label = String(params.label ?? `Submitted ${formName}`);
    const message = typeof params.message === 'string' ? params.message : undefined;
    const modelText = [
      `[Submitted form ${formName}: ${JSON.stringify(formData)}`,
      message ? ` — ${message}` : '',
      ']',
    ].join('');
    // Generate per-press idempotency key for the contact flow. Other forms
    // don't need it today; the server only consults submissionId when it
    // also detects formName === 'contact'.
    const submissionId =
      formName === 'contact'
        ? typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `s-${Date.now()}-${Math.random().toString(36).slice(2)}`
        : undefined;

    // For the contact form, fire the Web3Forms POST from the browser in
    // parallel with the server submit. Web3Forms sits behind Cloudflare's
    // managed bot challenge, which silently 403s server-side fetches but
    // passes through normal browser sessions. The access key is exposed via
    // NEXT_PUBLIC_WEB3FORMS_ACCESS_KEY — Web3Forms keys are public by design
    // (the value identifies a destination, not the sender, and is visible on
    // any documented HTML form pattern). Failures only land in the console;
    // the deterministic auto-reply card still renders from the server so the
    // visitor sees a clean acknowledgement either way.
    if (formName === 'contact') {
      const submission = parseContactFormFields(formData);
      if (submission) {
        void sendContactFormToEmail(submission, {
          accessKey: process.env.NEXT_PUBLIC_WEB3FORMS_ACCESS_KEY ?? '',
        })
          .then((r) => {
            if (!r.ok) {
              // Surface to the visitor instead of failing silently behind
              // the "Thanks, …" card — a confident-but-undelivered contact
              // form is the worst possible UX. Toast carries a direct
              // mailto: fallback so the visitor isn't stranded.
              console.error('[contact] Web3Forms client send failed', r);
              toast.warning('Email delivery failed', {
                description: CONTACT_FAILURE_DESCRIPTION,
                duration: CONTACT_FAILURE_TOAST_MS,
              });
            }
          })
          .catch((err) => {
            console.error('[contact] Web3Forms client send threw', err);
            toast.warning('Email delivery failed', {
              description: CONTACT_FAILURE_DESCRIPTION,
              duration: CONTACT_FAILURE_TOAST_MS,
            });
          });
      } else {
        console.error('[contact] form data failed validation before send', formData);
      }
    }

    try {
      await sendMessage({
        role: 'user',
        parts: [
          makePressPart({
            action: 'submitForm',
            label,
            message,
            data: formData,
            sourceRootId: specRoot,
            mode: 'model',
            formName,
            ...(submissionId ? { submissionId } : {}),
            // Contact form has its own server-emitted auto-reply card; the
            // "You pressed: Submitted contact" transcript chip would read
            // like a duplicate message. Other forms keep the default chip.
            ...(formName === 'contact' ? { hideTranscriptChip: true } : {}),
          }),
          { type: 'text', text: modelText },
        ],
      });
    } catch (err) {
      lockedRef.current = false;
      setIsLocked(false);
      console.error('[RenderUICard] submitForm failed', err);
    }
  };
}
