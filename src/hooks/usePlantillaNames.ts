import { useEffect, useState } from 'react';
import { fetchSlotsByJobPosting, normalizeItemNumber } from '../lib/plantillaSlots';
import { plantillaLabel } from '../lib/plantillaRules';

/**
 * Plantilla display names for screens that only hold an application or
 * posting row, so they never print a plantilla's internal key (`item_number`).
 *
 *   nameFor(itemNumber)        -> "Plantilla 2", or '' when unknown
 *   summaryForPosting(postId)  -> "Plantilla 1", "3 plantillas", or ''
 *
 * Unknown values resolve to '' — callers show nothing rather than a code.
 */
export function usePlantillaNames(enabled = true) {
  const [byKey, setByKey] = useState<Map<string, string>>(new Map());
  const [byPosting, setByPosting] = useState<Map<string, string[]>>(new Map());

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void fetchSlotsByJobPosting().then((grouped) => {
      if (cancelled) return;
      const keys = new Map<string, string>();
      const postings = new Map<string, string[]>();
      grouped.forEach((slots, postingId) => {
        postings.set(postingId, slots.map((slot) => plantillaLabel(slot)));
        slots.forEach((slot) => keys.set(normalizeItemNumber(slot.itemNumber), plantillaLabel(slot)));
      });
      setByKey(keys);
      setByPosting(postings);
    });
    return () => { cancelled = true; };
  }, [enabled]);

  const nameFor = (itemNumber: string | null | undefined): string =>
    byKey.get(normalizeItemNumber(itemNumber)) ?? '';

  const summaryForPosting = (jobPostingId: string | number | null | undefined): string => {
    const labels = byPosting.get(String(jobPostingId ?? '')) ?? [];
    if (labels.length === 0) return '';
    return labels.length === 1 ? labels[0] : `${labels.length} plantillas`;
  };

  return { nameFor, summaryForPosting };
}
