'use client';

import { useState } from 'react';
import { Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  type PromptInputMessage,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from '@/components/ai-elements/prompt-input';
import { MODEL_IDS, type ModelId } from '@/lib/ai/models';
import { ModelDropdown } from './model-dropdown';

const SHOW_MODEL_PICKER = MODEL_IDS.length > 1;

export function Composer({
  status,
  model,
  modelLocked,
  onModelChange,
  onSubmit,
  onStop,
}: {
  status: 'ready' | 'streaming' | 'submitted' | 'error';
  model: ModelId;
  modelLocked: boolean;
  onModelChange: (m: ModelId) => void;
  onSubmit: (text: string) => void;
  onStop: () => void;
}) {
  const [text, setText] = useState('');
  const isBusy = status === 'streaming' || status === 'submitted';

  function handleSubmit(message: PromptInputMessage) {
    const v = (message.text ?? text).trim();
    if (!v || isBusy) return;
    onSubmit(v);
    setText('');
  }

  return (
    <PromptInput onSubmit={handleSubmit} className="mx-auto w-full max-w-3xl">
      <PromptInputBody>
        <PromptInputTextarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Send a message..."
        />
        <PromptInputFooter>
          {SHOW_MODEL_PICKER ? (
            <PromptInputTools>
              <ModelDropdown value={model} onChange={onModelChange} disabled={modelLocked} />
            </PromptInputTools>
          ) : (
            <div />
          )}
          {isBusy ? (
            <Button type="button" size="icon" variant="ghost" onClick={onStop} aria-label="Stop">
              <Square className="size-4" />
            </Button>
          ) : (
            <PromptInputSubmit disabled={!text.trim()} />
          )}
        </PromptInputFooter>
      </PromptInputBody>
    </PromptInput>
  );
}
