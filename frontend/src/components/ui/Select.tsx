import * as React from 'react';
import * as RadixSelect from '@radix-ui/react-select';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface SelectOption {
  label: string;
  value: string;
  /** Optional grouping label — items with the same `group` render under
   *  a single visual divider with this header. */
  group?: string;
  disabled?: boolean;
}

export interface SelectProps {
  /** Stable string keys identifying each option. Keep them ASCII-safe; the
   *  empty string is reserved for the placeholder state. */
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  /** Optional id propagated to the trigger so a sibling <label htmlFor="…">
   *  can wire up to it. */
  id?: string;
  /** Compact density — same height as our other 9-tall toolbar inputs. */
  size?: 'sm' | 'md';
  /** Width override; defaults to w-full. */
  className?: string;
  /** Allow the user to clear the selection back to the placeholder.
   *  Renders a "(none)" entry at the top with value=''. */
  allowClear?: boolean;
  /** Custom label for the clear entry. Defaults to "(none)". */
  clearLabel?: string;
  'aria-label'?: string;
}

/**
 * Custom Select primitive built on @radix-ui/react-select. Matches the
 * editorial theme: subtle border, calm primary focus ring, restrained
 * animation. Replaces native <select> across the app for a more polished
 * dropdown that opens with a smooth fade-and-slide and shows a checkmark
 * beside the selected item.
 *
 * Accessibility:
 *   - Full keyboard nav (↑/↓/Home/End/typeahead) via radix.
 *   - Trigger gets aria-label from the prop or falls back to placeholder.
 *   - Selected option exposed via the standard SelectValue.
 */
export function Select({
  options,
  value,
  onChange,
  placeholder = 'Select…',
  disabled,
  id,
  size = 'md',
  className,
  allowClear,
  clearLabel = '(none)',
  'aria-label': ariaLabel,
}: SelectProps) {
  // Group options by their optional `group` key to render visual sections.
  const groups = React.useMemo(() => {
    const map = new Map<string, SelectOption[]>();
    for (const opt of options) {
      const key = opt.group ?? '';
      const list = map.get(key) ?? [];
      list.push(opt);
      map.set(key, list);
    }
    return map;
  }, [options]);

  // Radix forbids `<Item value="">` — empty string is reserved on the Root
  // for "no selection / show placeholder". For the optional clear entry we
  // use a sentinel and translate it back to '' at the boundary.
  const CLEAR_SENTINEL = '__select_clear__';

  return (
    <RadixSelect.Root
      value={value}
      onValueChange={(v) => onChange(v === CLEAR_SENTINEL ? '' : v)}
      disabled={disabled}
    >
      <RadixSelect.Trigger
        id={id}
        aria-label={ariaLabel ?? placeholder}
        className={cn(
          'inline-flex items-center justify-between gap-2 w-full',
          'bg-surface border border-border-strong rounded-md',
          'text-text-main placeholder:text-text-subtle',
          'transition-colors',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
          'data-[placeholder]:text-text-muted',
          'disabled:cursor-not-allowed disabled:bg-surface-2 disabled:opacity-60',
          'hover:border-primary/40',
          // Density
          size === 'sm' ? 'h-9 px-2.5 text-xs' : 'h-10 px-3 text-sm',
          className,
        )}
      >
        <RadixSelect.Value placeholder={placeholder} />
        <RadixSelect.Icon asChild>
          <ChevronDown
            size={size === 'sm' ? 14 : 16}
            className="text-text-muted transition-transform duration-150 data-[state=open]:rotate-180"
          />
        </RadixSelect.Icon>
      </RadixSelect.Trigger>

      <RadixSelect.Portal>
        <RadixSelect.Content
          position="popper"
          sideOffset={6}
          className={cn(
            'z-[60] overflow-hidden rounded-md shadow-lg',
            'bg-surface border border-border',
            // Match the trigger's width so the dropdown doesn't visually float.
            'min-w-[var(--radix-select-trigger-width)]',
            // Subtle fade-in on open. Radix sets data-state="open|closed".
            'origin-top transition-[opacity,transform] duration-100',
            'data-[state=open]:opacity-100 data-[state=closed]:opacity-0',
            'data-[state=open]:scale-100 data-[state=closed]:scale-95',
          )}
        >
          <RadixSelect.Viewport className="p-1 max-h-[min(60vh,360px)]">
            {allowClear && (
              <Item value={CLEAR_SENTINEL} label={clearLabel} muted />
            )}
            {Array.from(groups.entries()).map(([group, items], gi) => (
              <React.Fragment key={group || `__g${gi}`}>
                {gi > 0 && <RadixSelect.Separator className="h-px bg-border my-1" />}
                {group && (
                  <RadixSelect.Group>
                    <RadixSelect.Label className="px-2 pt-1.5 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-text-subtle">
                      {group}
                    </RadixSelect.Label>
                    {items.map((opt) => (
                      <Item key={opt.value} value={opt.value} label={opt.label} disabled={opt.disabled} />
                    ))}
                  </RadixSelect.Group>
                )}
                {!group &&
                  items.map((opt) => (
                    <Item key={opt.value} value={opt.value} label={opt.label} disabled={opt.disabled} />
                  ))}
              </React.Fragment>
            ))}
          </RadixSelect.Viewport>
        </RadixSelect.Content>
      </RadixSelect.Portal>
    </RadixSelect.Root>
  );
}

/** A single item in the dropdown — separated so the clear / grouped /
 *  ungrouped paths share styling. `muted` = the (none) clear entry. */
function Item({
  value,
  label,
  disabled,
  muted,
}: {
  value: string;
  label: string;
  disabled?: boolean;
  muted?: boolean;
}) {
  return (
    <RadixSelect.Item
      value={value}
      disabled={disabled}
      className={cn(
        'relative flex items-center gap-2 select-none rounded-sm cursor-pointer',
        'px-2 py-1.5 text-sm text-text-main',
        'data-[highlighted]:bg-primary-bg data-[highlighted]:text-primary',
        'data-[state=checked]:font-medium',
        'data-[disabled]:opacity-50 data-[disabled]:cursor-not-allowed',
        'focus:outline-none',
        muted && 'text-text-muted italic',
      )}
    >
      <span className="w-4 inline-flex items-center justify-center shrink-0">
        <RadixSelect.ItemIndicator>
          <Check size={14} className="text-primary" />
        </RadixSelect.ItemIndicator>
      </span>
      <RadixSelect.ItemText>{label}</RadixSelect.ItemText>
    </RadixSelect.Item>
  );
}
