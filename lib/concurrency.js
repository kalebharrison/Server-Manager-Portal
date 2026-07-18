export const mapWithConcurrency = async (items, concurrency, worker) => {
    const list = Array.isArray(items) ? items : [];
    const limit = Math.max(1, Number(concurrency) || 1);
    const results = new Array(list.length);
    let nextIndex = 0;

    const runners = Array.from({ length: Math.min(limit, list.length) }, async () => {
        while (nextIndex < list.length) {
            const index = nextIndex++;
            results[index] = await worker(list[index], index);
        }
    });
    await Promise.all(runners);
    return results;
};
