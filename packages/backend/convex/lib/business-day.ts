export const DEFAULT_BUSINESS_TIME_ZONE = "America/Mexico_City";

export const businessTimeZones = [
  { value: DEFAULT_BUSINESS_TIME_ZONE, label: "Ciudad de México" },
  { value: "America/Bahia_Banderas", label: "Bahía de Banderas" },
  { value: "America/Cancun", label: "Cancún" },
  { value: "America/Chihuahua", label: "Chihuahua" },
  { value: "America/Ciudad_Juarez", label: "Ciudad Juárez" },
  { value: "America/Hermosillo", label: "Hermosillo" },
  { value: "America/Matamoros", label: "Matamoros" },
  { value: "America/Mazatlan", label: "Mazatlán" },
  { value: "America/Merida", label: "Mérida" },
  { value: "America/Monterrey", label: "Monterrey" },
  { value: "America/Ojinaga", label: "Ojinaga" },
  { value: "America/Tijuana", label: "Tijuana" },
] as const;

const DAY_MS = 86_400_000;

export function isBusinessDay(day: string): boolean {
  if (!/^[1-9]\d{3}-\d{2}-\d{2}$/.test(day)) {
    return false;
  }

  const date = new Date(`${day}T00:00:00Z`);

  return Number.isFinite(date.getTime()) && date.toISOString().startsWith(day);
}

export function shiftBusinessDay(day: string, days: number): string {
  const utcMidnight = Date.parse(`${day}T00:00:00Z`);

  return new Date(utcMidnight + days * DAY_MS).toISOString().split("T")[0];
}

export function businessCalendar(timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  function dayAt(timestamp: number): string {
    const parts = formatter.formatToParts(timestamp);
    const year = parts.find((part) => part.type === "year")?.value;
    const month = parts.find((part) => part.type === "month")?.value;
    const day = parts.find((part) => part.type === "day")?.value;

    return `${year}-${month}-${day}`;
  }

  function startOfDay(utcMidnight: number): number {
    // Search independently for each midnight, so a clock change can make a day 23 or 25 hours.
    const target = new Date(utcMidnight);

    const targetDay =
      target.getUTCFullYear() * 10_000 + (target.getUTCMonth() + 1) * 100 + target.getUTCDate();

    let start = utcMidnight - DAY_MS;
    let end = utcMidnight + DAY_MS;

    while (start < end) {
      const midpoint = Math.floor((start + end) / 2);
      const localDay = Number(dayAt(midpoint).replaceAll("-", ""));

      if (localDay < targetDay) {
        start = midpoint + 1;
      } else {
        end = midpoint;
      }
    }

    return start;
  }

  return {
    dayAt,
    bounds(day: string) {
      const midnight = Date.parse(`${day}T00:00:00Z`);

      return { start: startOfDay(midnight), end: startOfDay(midnight + DAY_MS) };
    },
  };
}
