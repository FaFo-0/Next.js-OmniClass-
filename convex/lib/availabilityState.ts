import type { loadSlotSources } from "../calendar";
const minute = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
export function cellOverride(
  rows: Awaited<ReturnType<typeof loadSlotSources>>["exceptions"],
  date: string,
  startTime: string,
) {
  const start = minute(startTime);
  const covering = rows.filter(
    (row) =>
      row.date === date &&
      !row.timeOffGroupId &&
      minute(row.startTime) <= start &&
      minute(row.endTime) >= start + 30,
  );
  const winner = covering.find((row) => row.kind === "closed") ?? covering[0];
  return {
    value: winner ? winner.kind === "open" : null,
    token: winner?.editToken ?? winner?.createdAt,
  };
}
export function availabilityCellState(
  src: Awaited<ReturnType<typeof loadSlotSources>>,
  date: string,
  startTime: string,
  desired?: { value: boolean | null; token?: string },
) {
  const override = desired ?? cellOverride(src.exceptions, date, startTime);
  const start = minute(startTime);
  const inherited = src.vacancies
    .filter(
      (row) =>
        row.isActive &&
        row.dayOfWeek === new Date(`${date}T00:00:00Z`).getUTCDay() &&
        row.validFrom <= date &&
        (!row.validUntil || row.validUntil >= date) &&
        minute(row.startTime) <= start &&
        minute(row.endTime) >= start + 30,
    )
    .map(
      (row) =>
        `${row.startTime}:${row.endTime}:${row.validFrom}:${row.validUntil ?? ""}`,
    )
    .sort();
  return JSON.stringify({ override, inherited });
}
