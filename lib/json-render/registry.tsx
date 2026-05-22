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
import { defineRegistry, useActions, useIsVisible, useStateStore } from '@json-render/react';
import { AlertCircleIcon, AlertTriangleIcon, CheckCircle2Icon, InfoIcon } from 'lucide-react';
import NextImage from 'next/image';
import React, { createContext, useContext, useEffect } from 'react';
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
}

export const SpecContext = createContext<SpecContextValue | null>(null);

// ---------------------------------------------------------------------------
// FormContext — propagates the enclosing Form's `name` to child field
// components (Input, Select, Checkbox) so they can auto-bind to
// /{formName}/{fieldName} in the shared StateStore.
// ---------------------------------------------------------------------------

type FormContextValue = { name: string };
const FormContext = createContext<FormContextValue | null>(null);
export function useFormContext(): FormContextValue | null {
  return useContext(FormContext);
}

/**
 * Returns true when an element has at least one event binding whose action
 * resolves to model mode. Checks ALL `on.<event>` bindings, not just
 * `on.press`, so future event types are covered automatically.
 *
 * Model-mode-bound elements become inert after a press fires: the user already
 * issued the turn; re-pressing would duplicate it. Local-mode (setState) buttons
 * on the same card are unaffected and keep working.
 */
function isModelModeBound(el: Spec['elements'][string]): boolean {
  const onBindings = el.on as Record<string, { action?: string }> | undefined;
  if (!onBindings) return false;
  return Object.values(onBindings).some(
    (b) => b.action !== undefined && resolveActionMode(b.action) === 'model',
  );
}

/**
 * Returns true for form-input element types that accept user input without an
 * explicit `on.<event>` binding. When a card locks via a model-mode submit,
 * these must also become non-interactive so the user cannot keep editing fields
 * whose values have already been submitted and persisted.
 *
 * Phase 5 readiness: form-field locking is wired here alongside button locking
 * so the applyLockToSpec contract is complete before endpoint-mode form submit
 * is introduced.
 */
function isFormField(elType: string): boolean {
  return elType === 'Input' || elType === 'Select' || elType === 'Checkbox';
}

/**
 * Returns a new spec where:
 *  - Every element with a model-mode event binding has `disabled: true`
 *    injected into its props.
 *  - Every form-field element (Input, Select, Checkbox) has `disabled: true`
 *    injected — when the card is locked they should not accept further input
 *    because the submitted state has already been sent to the model.
 *
 * When `isLocked` is false, returns the original spec unchanged (no
 * allocation). Both json-render's upstream Renderer and SpecRenderer's
 * renderChildren consume the returned spec, so top-level and nested elements
 * both reflect lock state through a single source of truth.
 */
export function applyLockToSpec(spec: Spec, isLocked: boolean): Spec {
  if (!isLocked) return spec;
  const newElements: Record<string, Spec['elements'][string]> = {};
  for (const [key, el] of Object.entries(spec.elements)) {
    if (isModelModeBound(el) || isFormField(el.type)) {
      newElements[key] = {
        ...el,
        props: { ...(el.props as Record<string, unknown>), disabled: true },
      };
    } else {
      newElements[key] = el;
    }
  }
  return { ...spec, elements: newElements };
}

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
 * Lock display is handled by `applyLockToSpec()` in RenderUICard, which injects
 * `disabled: true` into model-mode-bound elements (and Phase 5 form-field props)
 * before the spec reaches Renderer. SpecContext is not consulted for lock state —
 * the pre-processed spec is the single source of truth.
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
        // Model-mode lock display is handled inside the Button component itself
        // (it reads isLocked from SpecContext), so this branch doesn't need to
        // inject `disabled: true` — same lock applies to top-level and nested
        // buttons through one source of truth.
        const node = (
          <Comp key={key} element={el} emit={emit} on={on} loading={false}>
            {nested}
          </Comp>
        );

        if (el.visible !== undefined) {
          return (
            <VisibleChild
              key={key}
              condition={el.visible as VisibilityCondition | undefined}
              node={node}
            />
          );
        }

        return node;
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [spec, reg, execute],
  );

  return <SpecContext.Provider value={{ spec, renderChildren }}>{children}</SpecContext.Provider>;
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
// Dynamic prop helpers
//
// Catalog props like `text`, `label`, etc. now accept `string | { $state: string }`
// so the model can wire them to live state. At runtime, json-render's
// `resolveElementProps` resolves all `{ $state }` refs to their current values
// before the component function is called — the component always receives a
// resolved string/boolean/etc. at runtime.
//
// The TypeScript types on the component's `props` argument reflect the Zod
// schema (i.e. `string | { $state: string }`), which React JSX rejects for
// children and prop slots that expect `string`. These helpers are typed casts
// only — they do no runtime work. The only unsafe scenario (wrong resolved type)
// surfaces as a React render warning, not a crash.
// ---------------------------------------------------------------------------

/** Cast a dynamic string prop to `string` for JSX. */
const ds = (v: string | { $state: string } | undefined): string => v as unknown as string;
/** Cast a dynamic boolean prop to `boolean | undefined` for JSX. */
const db = (v: boolean | { $state: string } | undefined): boolean | undefined =>
  v as unknown as boolean | undefined;

// ---------------------------------------------------------------------------
// Registry via defineRegistry
// ---------------------------------------------------------------------------

export const { registry } = defineRegistry(catalog, {
  components: {
    // ---- Card ---------------------------------------------------------------
    Card: (({ props, children }) => (
      <UiCard className="bg-card/80 border border-border">
        {props.title && (
          <CardHeader>
            <CardTitle>{ds(props.title)}</CardTitle>
          </CardHeader>
        )}
        <CardContent>{children}</CardContent>
        {props.footer && <CardFooter>{ds(props.footer)}</CardFooter>}
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
      return <Tag className={sizeMap[props.level]}>{ds(props.text)}</Tag>;
    }) satisfies ComponentFn<typeof catalog, 'Heading'>,

    // ---- Text ---------------------------------------------------------------
    Text: (({ props }) => (
      <p className={db(props.muted) ? 'text-muted-foreground text-sm' : 'text-sm'}>
        {ds(props.text)}
      </p>
    )) satisfies ComponentFn<typeof catalog, 'Text'>,

    // ---- Image --------------------------------------------------------------
    Image: (({ props }) => (
      <figure className="space-y-1">
        <NextImage
          src={props.src}
          alt={ds(props.alt)}
          width={800}
          height={450}
          className="w-full max-h-72 rounded-md object-cover"
          unoptimized
        />
        {props.caption && (
          <figcaption className="text-xs text-muted-foreground">{ds(props.caption)}</figcaption>
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
        {ds(props.text)}
      </a>
    )) satisfies ComponentFn<typeof catalog, 'Link'>,

    // ---- Button -------------------------------------------------------------
    // `emit('press')` dispatches the element's `on.press` ActionBinding through
    // ActionProvider. For local-mode actions (e.g. setState) this is handled
    // by the built-in ActionProvider handler — no custom entry in `handlers`
    // is required. Repeated presses keep working because local-mode never locks
    // the card.
    //
    // Lock display is handled by applyLockToSpec() in RenderUICard, which injects
    // disabled:true into model-mode Button props (and Phase 5 form-field props)
    // before the spec reaches Renderer. SpecContext is not consulted for lock state.
    Button: (({ props, emit }) => {
      const variant = props.variant ? buttonVariantMap[props.variant] : buttonVariantMap.primary;
      return (
        <UiButton
          variant={variant}
          disabled={db(props.disabled) ?? false}
          onClick={() => emit('press')}
        >
          {ds(props.label)}
        </UiButton>
      );
    }) satisfies ComponentFn<typeof catalog, 'Button'>,

    // ---- List ---------------------------------------------------------------
    List: (({ props }) => {
      const Tag = db(props.ordered) ? 'ol' : 'ul';
      return (
        <Tag
          className={db(props.ordered) ? 'list-decimal pl-5 space-y-1' : 'list-disc pl-5 space-y-1'}
        >
          {props.items.map((item, i) => (
            <li key={i} className="text-sm">
              {ds(item)}
            </li>
          ))}
        </Tag>
      );
    }) satisfies ComponentFn<typeof catalog, 'List'>,

    // ---- Input --------------------------------------------------------------
    // When rendered inside a Form, auto-binds to /{formName}/{fieldName} in
    // the shared StateStore via FormContext. Falls back to uncontrolled if no
    // FormContext is present (e.g. a standalone Input outside a Form).
    Input: (({ props }) => {
      const formCtx = useFormContext();
      const store = useStateStore();
      const statePath = formCtx ? `/${formCtx.name}/${props.name}` : null;
      // Seed the store on mount if the path has no value yet.
      // biome-ignore lint/correctness/useExhaustiveDependencies: store identity is stable per card mount; only statePath change matters
      useEffect(() => {
        if (statePath && store.get(statePath) === undefined) {
          store.set(statePath, '');
        }
      }, [statePath]);
      if (!formCtx && process.env.NODE_ENV !== 'production') {
        console.warn(
          `[json-render] Input "${props.name}" rendered outside a Form — not bound to store`,
        );
      }
      const value = statePath ? ((store.get(statePath) as string | undefined) ?? '') : undefined;
      return (
        <div className="space-y-1">
          {props.label && (
            <label htmlFor={props.name} className="text-sm font-medium">
              {ds(props.label)}
            </label>
          )}
          <UiInput
            id={props.name}
            name={props.name}
            type={props.kind ?? 'text'}
            placeholder={ds(props.placeholder)}
            disabled={db((props as { disabled?: boolean | { $state: string } }).disabled) ?? false}
            {...(statePath
              ? {
                  value,
                  onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
                    store.set(statePath, e.target.value),
                }
              : {})}
          />
        </div>
      );
    }) satisfies ComponentFn<typeof catalog, 'Input'>,

    // ---- Select -------------------------------------------------------------
    // When inside a Form, auto-binds to /{formName}/{fieldName} in the store.
    Select: (({ props }) => {
      const formCtx = useFormContext();
      const store = useStateStore();
      const statePath = formCtx ? `/${formCtx.name}/${props.name}` : null;
      const defaultSelectValue = ds(props.options[0]?.value);
      // Seed the store on mount if the path has no value yet.
      // biome-ignore lint/correctness/useExhaustiveDependencies: store identity is stable per card mount; only statePath matters
      useEffect(() => {
        if (statePath && store.get(statePath) === undefined) {
          store.set(statePath, defaultSelectValue ?? '');
        }
      }, [statePath]);
      if (!formCtx && process.env.NODE_ENV !== 'production') {
        console.warn(
          `[json-render] Select "${props.name}" rendered outside a Form — not bound to store`,
        );
      }
      const storeValue = statePath ? (store.get(statePath) as string | undefined) : undefined;
      const selectValue = storeValue ?? defaultSelectValue ?? '';
      return (
        <div className="space-y-1">
          {props.label && <span className="text-sm font-medium">{ds(props.label)}</span>}
          <Select
            name={props.name}
            disabled={db((props as { disabled?: boolean | { $state: string } }).disabled) ?? false}
            value={statePath ? selectValue : undefined}
            onValueChange={statePath ? (v) => store.set(statePath, v) : undefined}
          >
            <SelectTrigger className="w-full" aria-label={ds(props.label)}>
              <SelectValue placeholder="Select…" />
            </SelectTrigger>
            <SelectContent>
              {props.options.map((opt) => (
                <SelectItem key={ds(opt.value)} value={ds(opt.value)}>
                  {ds(opt.label)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      );
    }) satisfies ComponentFn<typeof catalog, 'Select'>,

    // ---- Checkbox (using Switch as stand-in — no checkbox.tsx in base-nova) -
    // When inside a Form, auto-binds to /{formName}/{fieldName} as a boolean.
    Checkbox: (({ props }) => {
      const formCtx = useFormContext();
      const store = useStateStore();
      const statePath = formCtx ? `/${formCtx.name}/${props.name}` : null;
      // Seed the store on mount if the path has no value yet.
      // biome-ignore lint/correctness/useExhaustiveDependencies: store identity is stable per card mount; only statePath matters
      useEffect(() => {
        if (statePath && store.get(statePath) === undefined) {
          store.set(statePath, false);
        }
      }, [statePath]);
      if (!formCtx && process.env.NODE_ENV !== 'production') {
        console.warn(
          `[json-render] Checkbox "${props.name}" rendered outside a Form — not bound to store`,
        );
      }
      const checked = statePath
        ? ((store.get(statePath) as boolean | undefined) ?? false)
        : undefined;
      return (
        <div className="flex items-center gap-2">
          <Switch
            id={props.name}
            name={props.name}
            disabled={db((props as { disabled?: boolean | { $state: string } }).disabled) ?? false}
            {...(statePath
              ? {
                  checked,
                  onCheckedChange: (v: boolean) => store.set(statePath, v),
                }
              : {})}
          />
          <label htmlFor={props.name} className="text-sm font-medium cursor-pointer">
            {ds(props.label)}
          </label>
        </div>
      );
    }) satisfies ComponentFn<typeof catalog, 'Checkbox'>,

    // ---- Form ---------------------------------------------------------------
    // Wraps children in FormContext.Provider so child Input/Select/Checkbox
    // components can discover the form name and auto-bind to state paths.
    Form: (({ props, children }) => (
      <FormContext.Provider value={{ name: props.name }}>
        <form name={props.name} onSubmit={(e) => e.preventDefault()} className="space-y-3">
          {children}
        </form>
      </FormContext.Provider>
    )) satisfies ComponentFn<typeof catalog, 'Form'>,

    // ---- Tabs ---------------------------------------------------------------
    Tabs: (({ props }) => {
      const ctx = useSpecContext();
      const store = useStateStore();
      const defaultTab = props.tabs[0]?.id ?? '';
      const valueStatePath = props.valueStatePath as string | undefined;
      const controlledValue = valueStatePath
        ? ((store.get(valueStatePath) as string | undefined) ?? defaultTab)
        : undefined;
      return (
        <UiTabs
          defaultValue={valueStatePath ? undefined : defaultTab}
          value={controlledValue}
          onValueChange={valueStatePath ? (v) => store.set(valueStatePath, v) : undefined}
        >
          <TabsList>
            {props.tabs.map((tab) => (
              <TabsTrigger key={tab.id} value={tab.id}>
                {ds(tab.label)}
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
              <AccordionTrigger>{ds(item.label)}</AccordionTrigger>
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
          {props.title && <AlertTitle>{ds(props.title)}</AlertTitle>}
          <AlertDescription>{ds(props.text)}</AlertDescription>
        </Alert>
      );
    }) satisfies ComponentFn<typeof catalog, 'Callout'>,

    // ---- Badge --------------------------------------------------------------
    Badge: (({ props }) => {
      const variant = props.tone ? badgeToneMap[props.tone] : 'default';
      return <UiBadge variant={variant}>{ds(props.label)}</UiBadge>;
    }) satisfies ComponentFn<typeof catalog, 'Badge'>,

    // ---- Divider ------------------------------------------------------------
    Divider: (() => <Separator />) satisfies ComponentFn<typeof catalog, 'Divider'>,
  },
});
