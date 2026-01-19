// app\lib\utils.ts

export function cn(...classes: (string | false | undefined | null)[]) {
  return classes.filter(Boolean).join(" ");
}

export function inRange(n: number, min?: number, max?: number) {
  if (typeof min === "number" && n < min) return false;
  if (typeof max === "number" && n > max) return false;
  return true;
}

export function inDateRange(dateISO: string, from?: string, to?: string) {
  if (from && dateISO < from) return false;
  if (to && dateISO > to) return false;
  return true;
}

export function safeIncludes(hay: string, needle: string) {
  return hay.toLowerCase().includes(needle.trim().toLowerCase());
}

export function toNumberOrUndef(v: string) {
  return v.trim() ? Number(v) : undefined;
}
