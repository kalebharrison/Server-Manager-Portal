export const createSerialJobQueue = ({ log = () => {} } = {}) => {
    let tail = Promise.resolve();

    const run = (name, task) => {
        const queued = tail.catch(() => {}).then(async () => {
            const startedAt = Date.now();
            log(`[JobQueue] Starting ${name}.`);
            try {
                return await task();
            } finally {
                log(`[JobQueue] Finished ${name} in ${Date.now() - startedAt}ms.`);
            }
        });
        tail = queued.catch(() => {});
        return queued;
    };

    return { run };
};
