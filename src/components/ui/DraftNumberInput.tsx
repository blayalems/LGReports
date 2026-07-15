import { useEffect, useRef, useState, type FocusEvent, type InputHTMLAttributes, type KeyboardEvent } from 'react';

export interface DraftNumberInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'defaultValue' | 'onChange'> {
  value: number | null | undefined;
  onCommit: (value: number | null) => void;
}

/**
 * Keeps multi-digit editing local and commits once on blur/Enter. Persisting each
 * keypress is unsafe for revisioned async repositories because the first refresh
 * can otherwise rerender the field before the next key arrives.
 */
export function DraftNumberInput({ value, onCommit, min, max, onBlur, onFocus, onKeyDown, ...props }: DraftNumberInputProps) {
  const external = value == null ? '' : String(value);
  const [draft, setDraft] = useState(external);
  const editing = useRef(false);

  useEffect(() => {
    if (!editing.current) setDraft(external);
  }, [external]);

  const commit = () => {
    editing.current = false;
    const trimmed = draft.trim();
    let next: number | null = trimmed === '' ? null : Number(trimmed);
    if (next != null && !Number.isFinite(next)) {
      setDraft(external);
      return;
    }
    if (next != null && typeof min === 'number') next = Math.max(min, next);
    if (next != null && typeof max === 'number') next = Math.min(max, next);
    const normalized = next == null ? '' : String(next);
    setDraft(normalized);
    if (normalized !== external) onCommit(next);
  };

  const handleBlur = (event: FocusEvent<HTMLInputElement>) => {
    commit();
    onBlur?.(event);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') event.currentTarget.blur();
    if (event.key === 'Escape') {
      setDraft(external);
      event.currentTarget.blur();
    }
    onKeyDown?.(event);
  };

  return (
    <input
      {...props}
      type="number"
      min={min}
      max={max}
      value={draft}
      onFocus={(event) => {
        editing.current = true;
        onFocus?.(event);
      }}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
    />
  );
}
