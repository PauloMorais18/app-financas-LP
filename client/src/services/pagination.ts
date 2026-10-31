// Read every page: the database can cap results below the requested page size.
export async function readAllPages<T>(fetchPage: (offset: number, limit: number) => Promise<{data: T[] | null; error: {message?: string} | null}>, pageSize = 500): Promise<T[]> {
  const rows: T[] = [];
  for (;;) {
    const {data, error} = await fetchPage(rows.length, pageSize);
    if (error) throw new Error(error.message || "Falha ao carregar movimentacoes.");
    if (!data?.length) return rows;
    rows.push(...data);
  }
}
