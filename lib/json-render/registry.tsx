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

import type { Spec, VisibilityCondition } from '@json-render/core';
import type { ComponentFn, ComponentRegistry, EventHandle } from '@json-render/react';
import { defineRegistry, useActions, useIsVisible } from '@json-render/react';
import { AlertCircleIcon, AlertTriangleIcon, CheckCircle2Icon, InfoIcon } from 'lucide-react';
import NextImage from 'next/image';
import React, { createContext, useContext } from 'react';
import {
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Accordion as UiAccordion,
} from '@/components/ui/accordion';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge as UiBadge } from '@/components/ui/badge';
import { Button as UiButton } from '@/components/ui/button';
import {
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  Card as UiCard,
} from '@/components/ui/card';
import { Input as UiInput } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { TabsContent, TabsList, TabsTrigger, Tabs as UiTabs } from '@/components/ui/tabs';
import { catalog, resolveActionMode } from '@/lib/json-render/catalog';

// ---------------------------------------------------------------------------
// SpecContext — gives Tabs / Accordion access to the flat spec for rendering
// their nested children (which live inside props, not element.children)
// ---------------------------------------------------------------------------

interface SpecContextValue {
  /** The full flat spec being rendered */
  spec: Spec;
  /** Render a list of element keys as ReactNodes */
  renderChildren: (keys: string[], visited?: Set<string>) => React.ReactNode;
  /**
   * Whether this card is locked for model-mode actions.
   * When true, buttons whose `on.press` action has mode='model' render
   * as disabled. Local-mode (setState) buttons are unaffected.
   */
  isLocked: boolean;
  /** Lock this card — called by RenderUICard after a model-mode press fires. */
  lock: () => void;
}

export const SpecContext = createContext<SpecContextValue | null>(null);

/**
 * Wrap `<Renderer>` with this provider so that Tabs / Accordion can render
 * their prop-level children.
 *
 * Action wiring: SpecRenderer uses `useActions()` from the surrounding
 * `ActionProvider` (mounted by `JSONUIProvider`) so that `on.press` bindings
 * on Tabs/Accordion nested children dispatch through the same action context as
 * the rest of the spec. The built-in `setState` action is handled automatically
 * by `ActionProvider` — no custom handler is required for local-mode actions.
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
  isLocked = false,
  lock = () => {},
  children,
}: {
  spec: Spec;
  registry: ComponentRegistry;
  /** Whether this card is locked for model-mode actions (passed from RenderUICard). */
  isLocked?: boolean;
  /** Callback to lock the card when a model-mode action fires. */
  lock?: () => void;
  children: React.ReactNode;
}) {
  // Grab the real action executor from ActionProvider (mounted by JSONUIProvider).
  // This replaces the previous no-op stubs so that Tabs/Accordion nested children
  // honour `on.press` bindings (e.g. setState) just like top-level elements.
  const { execute } = useActions();

  const renderChildren = React.useCallback(
    (keys: string[], visited: Set<string> = new Set()) =>
      keys.map((key) => {
        // Fix #8: Cycle guard — if a key has already been visited in this render
        // path, we have a circular reference. Return null and warn once to prevent
        // an infinite render loop.
        if (visited.has(key)) {
          console.warn(
            `[json-render] Cycle detected: element "${key}" appears more than once in the render path. Skipping to prevent infinite loop.`,
          );
          return null;
        }

        const el = spec.elements[key];
        if (!el) return null;
        const Comp = reg[el.type];
        if (!Comp) return null;

        // Mark this key as visited before recursing into children.
        const nextVisited = new Set(visited);
        nextVisited.add(key);

        // Recursively build children for this element, passing the visited set.
        const nested = el.children ? renderChildren(el.children, nextVisited) : undefined;

        // Build on/emit functions that forward through ActionProvider.
        const onBindings = el.on as
          | Record<string, { action: string; params?: Record<string, unknown> }>
          | undefined;

        // Model-mode lock: if the card is locked AND this element is a Button
        // with a model-mode press binding, inject `disabled: true` into its props
        // so the Button component renders in a greyed-out state without needing
        // any special logic inside the ComponentFn. Local-mode buttons are
        // unaffected because resolveActionMode('setState') === 'local'.
        const pressAction = onBindings?.press?.action;
        const effectiveEl =
          isLocked && el.type === 'Button' && pressAction !== undefined &&
          resolveActionMode(pressAction) === 'model'
            ? { ...el, props: { ...(el.props as Record<string, unknown>), disabled: true } }
            : el;

        // Fix #12: Derive emit from on so there is a single dispatch path.
        const on = (eventName: string): EventHandle => {
          const binding = onBindings?.[eventName];
          if (!binding) return { emit: () => {}, shouldPreventDefault: false, bound: false };
          return {
            emit: () => {
              void execute(binding);
            },
            shouldPreventDefault: false,
            bound: true,
          };
        };

        const emit = (eventName: string): void => on(eventName).emit();

        // Build the rendered node first, then optionally gate it behind a
        // visibility check (Fix #9). We build the node unconditionally and wrap
        // it in VisibleChild so useIsVisible is called inside a proper React
        // component (hooks-rules compliant).
        const node = (
          <Comp key={key} element={effectiveEl} emit={emit} on={on} loading={false}>
            {nested}
          </Comp>
        );

        if (effectiveEl.visible !== undefined) {
          return (
            <VisibleChild
              key={key}
              condition={effectiveEl.visible as VisibilityCondition | undefined}
              node={node}
            />
          );
        }

        return node;
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [spec, reg, execute, isLocked],
  );

  return (
    <SpecContext.Provider value={{ spec, renderChildren, isLocked, lock }}>
      {children}
    </SpecContext.Provider>
  );
}

/**
 * Tiny wrapper that evaluates a visibility condition inside a React component
 * so `useIsVisible` can be called at the top level (hooks rules compliant).
 * Used by renderChildren (Fix #9) to honour `visible` on Tabs/Accordion nested
 * children that are rendered outside the main `<Renderer>` tree.
 *
 * We pass the already-composed child JSX as `node` to avoid needing to call
 * Comp (which is difficult to type generically). The visibility gate simply
 * renders or suppresses that pre-built node.
 */
function VisibleChild({
  condition,
  node,
}: {
  condition: VisibilityCondition | undefined;
  node: React.ReactNode;
}) {
  const visible = useIsVisible(condition);
  if (!visible) return null;
  return <>{node}</>;
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
    // `emit('press')` dispatches the element's `on.press` ActionBinding through
    // ActionProvider. For local-mode actions (e.g. setState) this is handled
    // by the built-in ActionProvider handler — no custom entry in `handlers`
    // is required. Repeated presses keep working because local-mode never locks
    // the card.
    //
    // Model-mode lock: SpecRenderer.renderChildren injects `disabled: true` into
    // the props of any Button whose press action is model-mode when the card is
    // locked. This happens before the ComponentFn is called, so the Button just
    // reads `props.disabled` as usual — no special lock logic needed here.
    Button: (({ props, emit }) => {
      const variant = props.variant ? buttonVariantMap[props.variant] : buttonVariantMap.primary;
      return (
        <UiButton
          variant={variant}
          disabled={props.disabled ?? false}
          onClick={() => emit('press')}
        >
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
        {props.label && <span className="text-sm font-medium">{props.label}</span>}
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
              <AccordionContent>{ctx ? ctx.renderChildren(item.children) : null}</AccordionContent>
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
