import type { PaginationOptions } from "convex/server";

export const HISTORY_DEFAULT_PAGE_SIZE = 20;
export const HISTORY_MAX_PAGE_SIZE = 50;
export const HISTORY_MAX_ROWS_READ = 1000;

export function normalizeHistoryPaginationOpts(
  paginationOpts: PaginationOptions,
): PaginationOptions {
  const numItems = Math.min(
    Math.max(Math.floor(paginationOpts.numItems), 1),
    HISTORY_MAX_PAGE_SIZE,
  );

  const maximumRowsRead = Math.min(
    Math.max(Math.floor(paginationOpts.maximumRowsRead ?? HISTORY_MAX_ROWS_READ), 1),
    HISTORY_MAX_ROWS_READ,
  );

  return {
    ...paginationOpts,
    numItems,
    maximumRowsRead,
  };
}

export function normalizeHistorySearch(value: string): string {
  return value.normalize("NFD").replaceAll(/\p{M}/gu, "").toLocaleLowerCase("es-MX").trim();
}

export function parseHistorySearchTerms(search: string | undefined): Array<string> {
  if (!search) {
    return [];
  }

  return normalizeHistorySearch(search).split(/\s+/u).filter(Boolean);
}
