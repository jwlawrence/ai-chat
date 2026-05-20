'use client';

/**
 * @json-render/react registry — maps every catalog component to a shadcn-styled React
 * implementation.
 *
 * Architecture note on Tabs / Accordion children:
 * The json-render renderer resolves only the element-level `children` array into
 * ReactNodes before handing them to a component.  Tabs and Accordion embed their
 * child element keys inside *props* (e.g. `props.tabs[i].children`), so the
 * renderer never walks those automatically.  This file provides a small
 * `SpecContext` that a wrapping `SpecRenderer` component populates with the full
 * spec and a `renderChildren` helper.  Tabs / Accordion read from that context to
 * render their nested elements.
 */

import React, { createContext, useContext } from 'react';
import NextImage from 'next/image';
import { defineRegistry } from '@json-render/react';
import type { ComponentFn } from '@json-render/react';
import type { Spec } from '@json-render/core';
import type { ComponentRegistry } from '@json-render/react';

import {
  InfoIcon,
  CheckCircle2Icon,
  AlertTriangleIcon,
  AlertCircleIcon,
} from 'lucide-react';

import { catalog } from '@/lib/json-render/catalog';
import {
  Card as UiCard,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
} from '@/components/ui/card';
import { Button as UiButton } from '@/components/ui/button';
import { Badge as UiBadge } from '@/components/ui/badge';
import { Input as UiInput } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  Accordion as UiAccordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Tabs as UiTabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';

// ---------------------------------------------------------------------------
// SpecContext — gives Tabs / Accordion access to the flat spec for rendering
// their nested children (which live inside props, not element.children)
// ---------------------------------------------------------------------------

interface SpecContextValue {
  /** The full flat spec being rendered */
  spec: Spec;
  /** Render a list of element keys as ReactNodes */
  renderChildren: (keys: string[]) => React.ReactNode;
}

export const SpecContext = createContext<SpecContextValue | null>(null);

/**
 * Wrap `<Renderer>` with this provider so that Tabs / Accordion can render
 * their prop-level children.
 *
 * @example
 * ```tsx
 * <SpecRenderer spec={spec} registry={registry}>
 *   <Renderer spec={spec} registry={registry} />
 * </SpecRenderer>
 * ```
 */
export function SpecRenderer({
  spec,
  registry: reg,
  children,
}: {
  spec: Spec;
  registry: ComponentRegistry;
  children: React.ReactNode;
}) {
  const renderChildren = React.useCallback(
    (keys: string[]) =>
      keys.map((key) => {
        const el = spec.elements[key];
        if (!el) return null;
        const Comp = reg[el.type];
        if (!Comp) return null;
        // Recursively build children for this element
        const nested = el.children ? renderChildren(el.children) : undefined;
        // Stubs: action wiring (mode: 'local' | 'model' | 'endpoint') lands in
        // later phases. When ActionProvider is introduced, replace these with
        // real dispatch.
        return (
          <Comp
            key={key}
            element={el}
            emit={() => {}}
            on={() => ({ emit: () => {}, shouldPreventDefault: false, bound: false })}
            loading={false}
          >
            {nested}
          </Comp>
        );
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [spec, reg],
  );

  return <SpecContext.Provider value={{ spec, renderChildren }}>{children}</SpecContext.Provider>;
}

function useSpecContext() {
  return useContext(SpecContext);
}

// ---------------------------------------------------------------------------
// Button variant mapping: catalog → shadcn
// ---------------------------------------------------------------------------

type CatalogButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';
type ShadcnButtonVariant = 'default' | 'secondary' | 'ghost' | 'destructive';

const buttonVariantMap: Record<CatalogButtonVariant, ShadcnButtonVariant> = {
  primary: 'default',
  secondary: 'secondary',
  ghost: 'ghost',
  destructive: 'destructive',
};

// ---------------------------------------------------------------------------
// Badge variant mapping: catalog tone → shadcn variant
// ---------------------------------------------------------------------------

type CatalogBadgeTone = 'default' | 'success' | 'warning' | 'danger';
type ShadcnBadgeVariant = 'default' | 'secondary' | 'outline' | 'destructive';

const badgeToneMap: Record<CatalogBadgeTone, ShadcnBadgeVariant> = {
  default: 'default',
  success: 'secondary',
  warning: 'outline',
  danger: 'destructive',
};

// ---------------------------------------------------------------------------
// Callout tone → alert props mapping
// ---------------------------------------------------------------------------

type CalloutTone = 'info' | 'success' | 'warning' | 'danger';

const calloutIconMap: Record<CalloutTone, React.ReactNode> = {
  info: <InfoIcon className="size-4" />,
  success: <CheckCircle2Icon className="size-4" />,
  warning: <AlertTriangleIcon className="size-4" />,
  danger: <AlertCircleIcon className="size-4" />,
};

// ---------------------------------------------------------------------------
// Registry via defineRegistry
// ---------------------------------------------------------------------------

export const { registry } = defineRegistry(catalog, {
  components: {
    // ---- Card ---------------------------------------------------------------
    Card: (({ props, children }) => (
      <UiCard>
        {props.title && (
          <CardHeader>
            <CardTitle>{props.title}</CardTitle>
          </CardHeader>
        )}
        <CardContent>{children}</CardContent>
        {props.footer && <CardFooter>{props.footer}</CardFooter>}
      </UiCard>
    )) satisfies ComponentFn<typeof catalog, 'Card'>,

    // ---- Heading ------------------------------------------------------------
    Heading: (({ props }) => {
      const Tag = `h${props.level}` as 'h1' | 'h2' | 'h3' | 'h4';
      const sizeMap = {
        1: 'text-2xl font-bold',
        2: 'text-xl font-semibold',
        3: 'text-lg font-semibold',
        4: 'text-base font-medium',
      } as const;
      return <Tag className={sizeMap[props.level]}>{props.text}</Tag>;
    }) satisfies ComponentFn<typeof catalog, 'Heading'>,

    // ---- Text ---------------------------------------------------------------
    Text: (({ props }) => (
      <p className={props.muted ? 'text-muted-foreground text-sm' : 'text-sm'}>{props.text}</p>
    )) satisfies ComponentFn<typeof catalog, 'Text'>,

    // ---- Image --------------------------------------------------------------
    Image: (({ props }) => (
      <figure className="space-y-1">
        <NextImage
          src={props.src}
          alt={props.alt}
          width={800}
          height={450}
          className="w-full rounded-md object-cover"
          unoptimized
        />
        {props.caption && (
          <figcaption className="text-xs text-muted-foreground">{props.caption}</figcaption>
        )}
      </figure>
    )) satisfies ComponentFn<typeof catalog, 'Image'>,

    // ---- Link ---------------------------------------------------------------
    Link: (({ props }) => (
      <a
        href={props.href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary underline underline-offset-4 hover:opacity-80"
      >
        {props.text}
      </a>
    )) satisfies ComponentFn<typeof catalog, 'Link'>,

    // ---- Button -------------------------------------------------------------
    Button: (({ props }) => {
      const variant = props.variant
        ? buttonVariantMap[props.variant]
        : buttonVariantMap.primary;
      return (
        <UiButton variant={variant} disabled={props.disabled ?? false}>
          {props.label}
        </UiButton>
      );
    }) satisfies ComponentFn<typeof catalog, 'Button'>,

    // ---- List ---------------------------------------------------------------
    List: (({ props }) => {
      const Tag = props.ordered ? 'ol' : 'ul';
      return (
        <Tag className={props.ordered ? 'list-decimal pl-5 space-y-1' : 'list-disc pl-5 space-y-1'}>
          {props.items.map((item, i) => (
            <li key={i} className="text-sm">
              {item}
            </li>
          ))}
        </Tag>
      );
    }) satisfies ComponentFn<typeof catalog, 'List'>,

    // ---- Input --------------------------------------------------------------
    Input: (({ props }) => (
      <div className="space-y-1">
        {props.label && (
          <label htmlFor={props.name} className="text-sm font-medium">
            {props.label}
          </label>
        )}
        <UiInput
          id={props.name}
          name={props.name}
          type={props.kind ?? 'text'}
          placeholder={props.placeholder}
        />
      </div>
    )) satisfies ComponentFn<typeof catalog, 'Input'>,

    // ---- Select -------------------------------------------------------------
    Select: (({ props }) => (
      <div className="space-y-1">
        {props.label && (
          <span className="text-sm font-medium">{props.label}</span>
        )}
        <Select name={props.name}>
          <SelectTrigger className="w-full" aria-label={props.label}>
            <SelectValue placeholder="Select…" />
          </SelectTrigger>
          <SelectContent>
            {props.options.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    )) satisfies ComponentFn<typeof catalog, 'Select'>,

    // ---- Checkbox (using Switch as stand-in — no checkbox.tsx in base-nova) -
    Checkbox: (({ props }) => (
      <div className="flex items-center gap-2">
        <Switch id={props.name} name={props.name} />
        <label htmlFor={props.name} className="text-sm font-medium cursor-pointer">
          {props.label}
        </label>
      </div>
    )) satisfies ComponentFn<typeof catalog, 'Checkbox'>,

    // ---- Form ---------------------------------------------------------------
    Form: (({ props, children }) => (
      <form name={props.name} onSubmit={(e) => e.preventDefault()} className="space-y-3">
        {children}
      </form>
    )) satisfies ComponentFn<typeof catalog, 'Form'>,

    // ---- Tabs ---------------------------------------------------------------
    Tabs: (({ props }) => {
      const ctx = useSpecContext();
      const defaultTab = props.tabs[0]?.id ?? '';
      return (
        <UiTabs defaultValue={defaultTab}>
          <TabsList>
            {props.tabs.map((tab) => (
              <TabsTrigger key={tab.id} value={tab.id}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {props.tabs.map((tab) => (
            <TabsContent key={tab.id} value={tab.id}>
              {ctx ? ctx.renderChildren(tab.children) : null}
            </TabsContent>
          ))}
        </UiTabs>
      );
    }) satisfies ComponentFn<typeof catalog, 'Tabs'>,

    // ---- Accordion ----------------------------------------------------------
    Accordion: (({ props }) => {
      const ctx = useSpecContext();
      const firstId = props.items[0]?.id;
      return (
        <UiAccordion multiple defaultValue={firstId ? [firstId] : []}>
          {props.items.map((item) => (
            <AccordionItem key={item.id} value={item.id}>
              <AccordionTrigger>{item.label}</AccordionTrigger>
              <AccordionContent>
                {ctx ? ctx.renderChildren(item.children) : null}
              </AccordionContent>
            </AccordionItem>
          ))}
        </UiAccordion>
      );
    }) satisfies ComponentFn<typeof catalog, 'Accordion'>,

    // ---- Callout ------------------------------------------------------------
    Callout: (({ props }) => {
      const variant = props.tone === 'danger' ? 'destructive' : 'default';
      return (
        <Alert variant={variant}>
          {calloutIconMap[props.tone]}
          {props.title && <AlertTitle>{props.title}</AlertTitle>}
          <AlertDescription>{props.text}</AlertDescription>
        </Alert>
      );
    }) satisfies ComponentFn<typeof catalog, 'Callout'>,

    // ---- Badge --------------------------------------------------------------
    Badge: (({ props }) => {
      const variant = props.tone ? badgeToneMap[props.tone] : 'default';
      return <UiBadge variant={variant}>{props.label}</UiBadge>;
    }) satisfies ComponentFn<typeof catalog, 'Badge'>,

    // ---- Divider ------------------------------------------------------------
    Divider: (() => <Separator />) satisfies ComponentFn<typeof catalog, 'Divider'>,
  },
});
