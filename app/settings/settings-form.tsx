'use client';

import type { Spec } from '@json-render/core';
import { createStateStore } from '@json-render/core';
import { JSONUIProvider, Renderer, useStateStore, useStateValue } from '@json-render/react';
import { useEffect, useMemo, useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button as UiButton } from '@/components/ui/button';
import { type ByokRecord, loadByok, saveByok } from '@/lib/byok/storage';
import { registry, SpecRenderer } from '@/lib/json-render/registry';

const SPEC: Spec = {
  root: 'form',
  elements: {
    form: {
      type: 'Form',
      props: { name: 'byok' },
      children: ['key', 'baseUrl', 'gpt-5.4-mini', 'gpt-5.4', 'apiVersion'],
    },
    key: {
      type: 'Input',
      props: { name: 'key', label: 'API key', kind: 'password' },
      children: [],
    },
    baseUrl: {
      type: 'Input',
      props: {
        name: 'baseUrl',
        label: 'Azure Foundry base URL',
        placeholder: 'https://<resource>.openai.azure.com',
      },
      children: [],
    },
    'gpt-5.4-mini': {
      type: 'Input',
      props: { name: 'gpt-5.4-mini', label: 'Deployment name for gpt-5.4-mini (required)' },
      children: [],
    },
    'gpt-5.4': {
      type: 'Input',
      props: { name: 'gpt-5.4', label: 'Deployment name for gpt-5.4 (optional)' },
      children: [],
    },
    apiVersion: {
      type: 'Input',
      props: {
        name: 'apiVersion',
        label: 'API version (optional, default 2025-04-01-preview)',
      },
      children: [],
    },
  },
};

type SubmitState =
  | { kind: 'idle' }
  | { kind: 'validating' }
  | { kind: 'saved' }
  | { kind: 'error'; message: string };

function SubmitButton({ onResult }: { onResult: (s: SubmitState) => void }) {
  const store = useStateStore();
  const validating = useStateValue<boolean>('/validating') ?? false;

  async function handleClick() {
    const key = (store.get('/byok/key') as string | undefined)?.trim();
    const baseUrl = (store.get('/byok/baseUrl') as string | undefined)?.trim();
    const miniDeployment = (store.get('/byok/gpt-5.4-mini') as string | undefined)?.trim();
    const fullDeployment = (store.get('/byok/gpt-5.4') as string | undefined)?.trim();
    const apiVersion = (store.get('/byok/apiVersion') as string | undefined)?.trim();
    if (!key || !baseUrl || !miniDeployment) {
      onResult({
        kind: 'error',
        message: 'Key, base URL, and gpt-5.4-mini deployment are required.',
      });
      return;
    }
    store.set('/validating', true);
    onResult({ kind: 'validating' });
    // 30s ceiling: longer than any reasonable Azure round-trip, short enough
    // that a stuck request doesn't leave the button greyed out indefinitely.
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30_000);
    try {
      const res = await fetch('/api/byok/validate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          key,
          baseUrl,
          deploymentName: miniDeployment,
          ...(apiVersion ? { apiVersion } : {}),
        }),
        signal: controller.signal,
      });
      if (res.status === 200) {
        const deployments: Record<string, string> = { 'gpt-5.4-mini': miniDeployment };
        if (fullDeployment) deployments['gpt-5.4'] = fullDeployment;
        const record: ByokRecord = {
          key,
          baseUrl,
          deployments,
          ...(apiVersion ? { apiVersion } : {}),
        };
        try {
          saveByok(record);
        } catch (err) {
          // localStorage quota / private-mode failures. Surface as a recoverable
          // error so the user knows the save didn't land.
          const msg = err instanceof Error ? err.message : 'Could not save locally';
          onResult({ kind: 'error', message: `Validated, but local save failed: ${msg}` });
          return;
        }
        onResult({ kind: 'saved' });
      } else if (res.status === 401) {
        onResult({ kind: 'error', message: 'Sign in required.' });
      } else if (res.status === 422) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        onResult({ kind: 'error', message: body.error ?? 'Azure rejected the credentials.' });
      } else {
        onResult({ kind: 'error', message: `Request failed (${res.status})` });
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        onResult({ kind: 'error', message: 'Validation timed out after 30 seconds.' });
      } else {
        const msg = err instanceof Error ? err.message : 'Network error';
        onResult({ kind: 'error', message: msg });
      }
    } finally {
      clearTimeout(timeoutId);
      store.set('/validating', false);
    }
  }

  return (
    <UiButton onClick={handleClick} disabled={validating}>
      {validating ? 'Validating…' : 'Validate & save'}
    </UiButton>
  );
}

function StatusAlert({
  state,
  initiallyConfigured,
}: {
  state: SubmitState;
  initiallyConfigured: boolean;
}) {
  if (state.kind === 'saved') {
    return (
      <Alert>
        <AlertTitle>Saved</AlertTitle>
        <AlertDescription>
          BYOK credentials are stored locally and will be sent on each chat.
        </AlertDescription>
      </Alert>
    );
  }
  if (state.kind === 'error') {
    return (
      <Alert variant="destructive">
        <AlertTitle>Validation failed</AlertTitle>
        <AlertDescription>{state.message}</AlertDescription>
      </Alert>
    );
  }
  if (state.kind === 'idle' && initiallyConfigured) {
    return <p className="text-sm text-muted-foreground">BYOK is already configured.</p>;
  }
  return null;
}

export function SettingsForm() {
  const [initiallyConfigured, setInitiallyConfigured] = useState(false);
  const [submitState, setSubmitState] = useState<SubmitState>({ kind: 'idle' });
  const store = useMemo(() => createStateStore({}), []);

  useEffect(() => {
    setInitiallyConfigured(loadByok() !== null);
  }, []);

  return (
    <JSONUIProvider registry={registry} store={store}>
      <SpecRenderer spec={SPEC} registry={registry}>
        <Renderer spec={SPEC} registry={registry} />
      </SpecRenderer>
      <SubmitButton onResult={setSubmitState} />
      <StatusAlert state={submitState} initiallyConfigured={initiallyConfigured} />
    </JSONUIProvider>
  );
}
