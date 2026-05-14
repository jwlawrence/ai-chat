'use client';

import { Check, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MODEL_IDS, MODEL_LABELS, type ModelId } from '@/lib/ai/models';

export function ModelDropdown({
  value,
  onChange,
  disabled,
}: {
  value: ModelId;
  onChange: (v: ModelId) => void;
  disabled?: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="sm" disabled={disabled} className="gap-1" />}
      >
        {MODEL_LABELS[value]}
        <ChevronDown className="size-3.5 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {MODEL_IDS.map((id) => (
          <DropdownMenuItem key={id} onClick={() => onChange(id)}>
            <Check className={`mr-2 size-4 ${id === value ? '' : 'invisible'}`} />
            {MODEL_LABELS[id]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
