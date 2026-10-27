import { calendarSlotKey, type CalendarSlot } from "./calendarSlots";

export type AvailabilityCell = CalendarSlot & { expectedState: string };
export type AvailabilityEdit = {
  requestId: string;
  acknowledged?: boolean;
  changes: {
    date: string;
    startTime: string;
    open: boolean | null;
    expectedState: string;
  }[];
  cells: AvailabilityCell[];
};

/** Serialize writes, but show every gesture immediately, including rapid toggles.
 * Chain only our own versions; never rebase onto somebody else's edit and bypass
 * the server's conflict check. The version shape belongs to calendarAvailability.
 */
export class CalendarAvailabilityEdits<Receipt> {
  private pending: AvailabilityEdit[] = [];
  private acknowledged: AvailabilityEdit[] = [];
  private observed: readonly AvailabilityCell[] = [];
  private running = false;
  private active = true;

  constructor(private readonly callbacks: {
    save: (edit: AvailabilityEdit) => Promise<Receipt>;
    changed: (pending: readonly AvailabilityEdit[]) => void;
    saved: (receipt: Receipt, edit: AvailabilityEdit) => void;
    failed: (error: unknown) => void;
  }) {}

  get busy() { return this.pending.length > 0; }

  resume() { this.active = true; }
  pause() { this.active = false; this.pending = []; this.acknowledged = []; }

  private publish() { this.callbacks.changed([...this.acknowledged, ...this.pending]); }

  /** Keep our saved version until the subscription catches up. A genuinely newer
   * version must be shown, rather than hidden behind our optimistic overlay. */
  observe(source: readonly AvailabilityCell[]) {
    this.observed = source;
    const latest = new Map(source.map(cell => [calendarSlotKey(cell), cell]));
    const remove = new Set<string>();
    for (const [key, actual] of latest) {
      const chain = this.acknowledged.flatMap(edit => {
        const cell = edit.cells.find(cell => calendarSlotKey(cell) === key);
        const before = edit.changes.find(change => calendarSlotKey(change) === key);
        return cell && before ? [{ edit, cell, before }] : [];
      });
      const matched = chain.map(item => item.cell.expectedState).lastIndexOf(actual.expectedState);
      const stale = chain.some(item => item.before.expectedState === actual.expectedState);
      chain.forEach((item, index) => {
        if (index <= matched || (matched < 0 && !stale)) remove.add(`${item.edit.requestId}|${key}`);
      });
    }
    if (!remove.size) return;
    this.acknowledged = this.acknowledged.flatMap(edit => {
      const cells = edit.cells.filter(cell => !remove.has(`${edit.requestId}|${calendarSlotKey(cell)}`));
      return cells.length ? [{ ...edit, cells }] : [];
    });
    this.publish();
  }

  enqueue(source: readonly AvailabilityCell[], open: boolean | null, requestId: string) {
    if (!this.active) return;
    const optimistic = new Map(
      [...this.acknowledged, ...this.pending].flatMap((edit) => edit.cells.map((cell) => [calendarSlotKey(cell), cell] as const)),
    );
    const seen = new Set<string>();
    const cells = source.filter((cell) => {
      const key = calendarSlotKey(cell);
      if (!cell.editable || cell.busy || cell.eventId || cell.timeOff || seen.has(key)) return false;
      seen.add(key);
      return true;
    }).map((cell) => optimistic.get(calendarSlotKey(cell)) ?? cell);
    if (!cells.length) return;
    const changes = cells.map(({ date, startTime, expectedState }) => ({ date, startTime, open, expectedState }));
    const edit = { requestId, changes, cells: cells.map((cell) => {
      const state = JSON.parse(cell.expectedState) as { inherited: string[] };
      return {
        ...cell,
        open: open ?? state.inherited.length > 0,
        expectedState: JSON.stringify({
          override: { value: open, token: open === null ? undefined : requestId },
          inherited: state.inherited,
        }),
      };
    }) };
    this.pending.push(edit);
    this.publish();
    void this.flush();
  }

  private async flush() {
    if (this.running) return;
    this.running = true;
    try {
      while (this.active && this.pending.length) {
        const edit = this.pending[0];
        try {
          const receipt = await this.callbacks.save(edit);
          if (!this.active || this.pending[0] !== edit) break;
          this.pending.shift();
          this.acknowledged.push({ ...edit, acknowledged: true });
          this.callbacks.saved(receipt, edit);
          this.publish();
          this.observe(this.observed);
        } catch (error) {
          // Later gestures may depend on this version. Roll back all unsaved
          // gestures together; the authoritative query supplies the saved state.
          if (this.active) {
            this.pending = [];
            this.publish();
            this.callbacks.failed(error);
          }
          break;
        }
      }
    } finally { this.running = false; }
  }
}
