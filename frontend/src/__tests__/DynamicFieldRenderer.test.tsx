import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DynamicFieldRenderer } from '../components/DynamicFieldRenderer';
import type { DynamicField } from '../types/api';

function field(over: Partial<DynamicField> = {}): DynamicField {
  return {
    id: '1',
    key: 'note',
    label: 'Note',
    type: 'text',
    isRequired: false,
    isActive: true,
    sortOrder: 0,
    validation: {},
    visibility: { roles: '*' },
    locking: 'none',
    isSystem: false,
    options: [],
    ...over,
  } as DynamicField;
}

describe('DynamicFieldRenderer', () => {
  it('renders a textarea for type=text and emits changes', () => {
    const onChange = vi.fn();
    render(<DynamicFieldRenderer field={field()} value="" onChange={onChange} />);
    const ta = screen.getByLabelText(/Note/);
    fireEvent.change(ta, { target: { value: 'hello' } });
    expect(onChange).toHaveBeenCalledWith('hello');
  });

  it('renders a number input that emits numeric values', () => {
    const onChange = vi.fn();
    render(<DynamicFieldRenderer field={field({ type: 'number', label: 'Cost' })} value={null} onChange={onChange} />);
    const input = screen.getByLabelText(/Cost/);
    fireEvent.change(input, { target: { value: '12' } });
    expect(onChange).toHaveBeenLastCalledWith(12);
    fireEvent.change(input, { target: { value: '' } });
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it('shows a required marker', () => {
    render(<DynamicFieldRenderer field={field({ isRequired: true })} value="" onChange={() => {}} />);
    expect(screen.getByText('*')).toBeTruthy();
  });

  it('shows a lock indicator when locked and disables the input', () => {
    render(
      <DynamicFieldRenderer
        field={field({ locking: 'first_writer_wins' })}
        value="x"
        onChange={() => {}}
        locked
        lockOwner="42"
      />,
    );
    expect(screen.getByText('🔒')).toBeTruthy();
    const ta = screen.getByLabelText(/Note/) as HTMLTextAreaElement;
    expect(ta.disabled).toBe(true);
  });

  it('renders a dropdown filtered to active options', () => {
    const onChange = vi.fn();
    const f = field({
      type: 'dropdown',
      label: 'Priority',
      options: [
        { id: '1', value: 'low', label: 'Low', sortOrder: 0, isActive: true },
        { id: '2', value: 'archived', label: 'Archived', sortOrder: 1, isActive: false },
      ],
    });
    render(<DynamicFieldRenderer field={f} value={null} onChange={onChange} />);
    const select = screen.getByLabelText(/Priority/) as HTMLSelectElement;
    expect(select.options.length).toBe(2);   // placeholder + 1 active
    expect(select.options[1].textContent).toBe('Low');
  });

  it('surfaces a per-field error message', () => {
    render(<DynamicFieldRenderer field={field()} value="" onChange={() => {}} error="REQUIRED" />);
    expect(screen.getByText('REQUIRED')).toBeTruthy();
  });
});
