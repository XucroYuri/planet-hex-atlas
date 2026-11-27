// The map normally asks for one year. The complete panel is loaded on entry to a longitudinal tool.
export function createObservationStore(readAsset, firstYear, lastYear) {
  let history = null;
  let pendingHistory = null;
  const annual = new Map();
  const pending = new Map();
  const touch = (year, rows) => {
    annual.delete(year);
    annual.set(year, rows);
    while (annual.size > 8) annual.delete(annual.keys().next().value);
  };
  return {
    value(region, indicator, year) {
      if (history) return history[region]?.[indicator]?.[year - firstYear] ?? null;
      return annual.get(year)?.[region]?.[indicator] ?? null;
    },
    ready(year) { return Boolean(history || annual.has(year)); },
    async ensureYear(year) {
      if (!Number.isInteger(year) || year < firstYear || year > lastYear) throw Error('Invalid observation year');
      if (history) return;
      if (annual.has(year)) { touch(year, annual.get(year)); return; }
      if (pending.has(year)) return pending.get(year);
      const request = readAsset(`annual/${year}.json`).then((data) => {
        if (data.year !== year || !data.regions) throw Error('Invalid annual observations');
        if (!history) touch(year, data.regions);
      }).finally(() => pending.delete(year));
      pending.set(year, request);
      return request;
    },
    async ensureHistory() {
      if (history) return;
      if (!pendingHistory) pendingHistory = readAsset('observations.json').then((data) => {
        if (!data.WLD?.pop) throw Error('Invalid observation panel');
        history = data;
        annual.clear();
      }).finally(() => { pendingHistory = null; });
      return pendingHistory;
    },
  };
}
