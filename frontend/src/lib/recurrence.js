export function quarterForDate(quarters, iso) {
  return quarters.find((q) => iso >= q.start_date && iso <= q.end_date) || null;
}
