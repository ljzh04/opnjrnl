import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDebouncedSave } from './useDebouncedSave';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

function makeEntry(id = 'entry-1') {
  return { id };
}

it('fires onUpdate after delay', () => {
  const onUpdate = vi.fn();
  const entry = makeEntry();

  renderHook(() => useDebouncedSave(entry, 'Hello', '<p>World</p>', onUpdate, 600));

  expect(onUpdate).not.toHaveBeenCalled();

  act(() => { vi.advanceTimersByTime(600); });

  expect(onUpdate).toHaveBeenCalledTimes(1);
  expect(onUpdate).toHaveBeenCalledWith('entry-1', {
    title: 'Hello',
    content: '<p>World</p>',
    updatedAt: expect.any(Number),
  });
});

it('cancels save when title changes within delay', () => {
  const onUpdate = vi.fn();
  const entry = makeEntry();

  const { rerender } = renderHook(
    ({ title }) => useDebouncedSave(entry, title, '', onUpdate, 600),
    { initialProps: { title: 'First draft' } },
  );

  act(() => { vi.advanceTimersByTime(400); });

  rerender({ title: 'Revised draft' });

  act(() => { vi.advanceTimersByTime(600); });

  expect(onUpdate).toHaveBeenCalledTimes(1);
  expect(onUpdate).toHaveBeenCalledWith('entry-1', {
    title: 'Revised draft',
    content: '',
    updatedAt: expect.any(Number),
  });
});

it('cancels save when content changes within delay', () => {
  const onUpdate = vi.fn();
  const entry = makeEntry();

  const { rerender } = renderHook(
    ({ content }) => useDebouncedSave(entry, '', content, onUpdate, 600),
    { initialProps: { content: 'old' } },
  );

  act(() => { vi.advanceTimersByTime(300); });

  rerender({ content: 'new content' });

  act(() => { vi.advanceTimersByTime(600); });

  expect(onUpdate).toHaveBeenCalledTimes(1);
  expect(onUpdate).toHaveBeenCalledWith('entry-1', {
    title: '',
    content: 'new content',
    updatedAt: expect.any(Number),
  });
});

it('cancels save when entry becomes null', () => {
  const onUpdate = vi.fn();
  const { rerender } = renderHook(
    ({ entry }) => useDebouncedSave(entry, 'T', '', onUpdate, 600),
    { initialProps: { entry: makeEntry('e1') } },
  );

  act(() => { vi.advanceTimersByTime(400); });

  rerender({ entry: null });

  // ponytail: flush on entry change — saves e1's state before switching away
  expect(onUpdate).toHaveBeenCalledTimes(1);
  expect(onUpdate).toHaveBeenCalledWith('e1', {
    title: 'T',
    content: '',
    updatedAt: expect.any(Number),
  });
});

it('does not fire when entry is null from the start', () => {
  const onUpdate = vi.fn();
  renderHook(() => useDebouncedSave(null, 'T', '', onUpdate, 600));
  act(() => { vi.advanceTimersByTime(600); });
  expect(onUpdate).not.toHaveBeenCalled();
});

it('flushes pending edits when switching entries within delay', () => {
  const onUpdate = vi.fn();
  const entry1 = makeEntry('e1');
  const entry2 = makeEntry('e2');

  const { rerender } = renderHook(
    ({ entry, title }) => useDebouncedSave(entry, title, '', onUpdate, 600),
    { initialProps: { entry: entry1, title: 'Draft' } },
  );

  // User types, then clicks away before debounce fires
  act(() => { vi.advanceTimersByTime(300); });
  rerender({ entry: entry2, title: '' });

  // e1's state should be flushed immediately
  expect(onUpdate).toHaveBeenCalledTimes(1);
  expect(onUpdate).toHaveBeenCalledWith('e1', {
    title: 'Draft',
    content: '',
    updatedAt: expect.any(Number),
  });
});

it('skips flush if debounce already saved same values', () => {
  const onUpdate = vi.fn();
  const entry1 = makeEntry('e1');
  const entry2 = makeEntry('e2');

  const { rerender } = renderHook(
    ({ entry, title }) => useDebouncedSave(entry, title, '', onUpdate, 600),
    { initialProps: { entry: entry1, title: 'Final' } },
  );

  // Debounce fires — saves e1
  act(() => { vi.advanceTimersByTime(600); });
  expect(onUpdate).toHaveBeenCalledTimes(1);

  // Switch entries — flush should skip (debounce already saved these values)
  rerender({ entry: entry2, title: '' });
  expect(onUpdate).toHaveBeenCalledTimes(1);
});
