'use client';

import { Paperclip, Square, X } from 'lucide-react';
import { useState } from 'react';
import {
  PromptInput,
  PromptInputButton,
  PromptInputFooter,
  type PromptInputMessage,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  usePromptInputAttachments,
} from '@/components/ai-elements/prompt-input';
import { Button } from '@/components/ui/button';
import { MODEL_IDS, type ModelId } from '@/lib/ai/models';
import { cn } from '@/lib/utils';
import { ModelDropdown } from './model-dropdown';
import { UsageMeter } from './usage-meter';

const SHOW_MODEL_PICKER = MODEL_IDS.length > 1;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

function SubmitButton({ disabledByText }: { disabledByText: boolean }) {
  const attachments = usePromptInputAttachments();
  const hasFiles = attachments.files.length > 0;
  return <PromptInputSubmit disabled={disabledByText && !hasFiles} />;
}

function AttachButton() {
  const attachments = usePromptInputAttachments();
  return (
    <PromptInputButton onClick={() => attachments.openFileDialog()} aria-label="Attach images">
      <Paperclip className="size-4" />
    </PromptInputButton>
  );
}

function AttachmentChips() {
  const attachments = usePromptInputAttachments();
  if (attachments.files.length === 0) return null;
  return (
    <div className="flex w-full flex-wrap gap-2 px-2.5 pt-2.5">
      {attachments.files.map((f) => (
        <div
          key={f.id}
          className="group relative size-16 overflow-hidden rounded-md border border-border bg-card"
        >
          {f.mediaType?.startsWith('image/') ? (
            // biome-ignore lint/performance/noImgElement: data/blob URLs aren't supported by next/image
            <img src={f.url} alt={f.filename ?? 'attachment'} className="size-full object-cover" />
          ) : (
            <div className="flex size-full items-center justify-center text-muted-foreground text-xs">
              file
            </div>
          )}
          <button
            type="button"
            onClick={() => attachments.remove(f.id)}
            aria-label="Remove attachment"
            className="absolute right-1 top-1 flex size-5 items-center justify-center rounded-full bg-background/80 text-foreground opacity-0 ring-1 ring-border transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
          >
            <X className="size-3" />
          </button>
        </div>
      ))}
    </div>
  );
}

export function Composer({
  status,
  model,
  modelLocked,
  sessionId,
  onModelChange,
  onSubmit,
  onStop,
  disabled,
}: {
  status: 'ready' | 'streaming' | 'submitted' | 'error';
  model: ModelId;
  modelLocked: boolean;
  sessionId: string | undefined;
  onModelChange: (m: ModelId) => void;
  onSubmit: (message: PromptInputMessage) => void;
  onStop: () => void;
  disabled?: boolean;
}) {
  const [text, setText] = useState('');
  const isBusy = status === 'streaming' || status === 'submitted';

  function handleSubmit(message: PromptInputMessage) {
    if (disabled) return;
    const t = (message.text ?? text).trim();
    if (!t && message.files.length === 0) return;
    if (isBusy) return;
    onSubmit({ text: t, files: message.files });
    setText('');
  }

  return (
    <PromptInput
      onSubmit={handleSubmit}
      accept="image/*"
      multiple
      maxFileSize={MAX_FILE_SIZE}
      className={cn('mx-auto w-full max-w-3xl', disabled && 'pointer-events-none opacity-60')}
    >
      <AttachmentChips />
      <PromptInputTextarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={disabled ? 'Sign in to chat freely' : 'Send a message...'}
        disabled={disabled}
      />
      <PromptInputFooter>
        <PromptInputTools>
          <AttachButton />
          {SHOW_MODEL_PICKER ? (
            <ModelDropdown
              value={model}
              onChange={onModelChange}
              disabled={modelLocked || !!disabled}
            />
          ) : null}
          <UsageMeter sessionId={sessionId} model={model} />
        </PromptInputTools>
        {isBusy ? (
          <Button type="button" size="icon" variant="ghost" onClick={onStop} aria-label="Stop">
            <Square className="size-4" />
          </Button>
        ) : (
          <SubmitButton disabledByText={!text.trim() || !!disabled} />
        )}
      </PromptInputFooter>
    </PromptInput>
  );
}
