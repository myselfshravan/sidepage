const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const numberFmt = new Intl.NumberFormat("en-GB");

/** Dates are formatted in UTC on the server so output is stable across machines. */
export function formatDate(iso: string): string {
  return dateFmt.format(new Date(iso));
}

export function formatDateInZone(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone }).format(
    new Date(iso),
  );
}

export function formatWords(n: number): string {
  return `${numberFmt.format(n)} ${n === 1 ? "word" : "words"}`;
}

export function formatMinutes(n: number): string {
  if (n <= 0) return "Under a minute";
  if (n < 60) return `${n} min read`;
  const h = Math.floor(n / 60);
  const m = n % 60;
  return m ? `${h} h ${m} min read` : `${h} h read`;
}

export function chapterLabel(n: number): string {
  return `${n} ${n === 1 ? "chapter" : "chapters"}`;
}

export function romanize(n: number): string {
  const map: [number, string][] = [[1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"], [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];
  let out = "";
  for (const [v, s] of map) while (n >= v) { out += s; n -= v; }
  return out;
}
