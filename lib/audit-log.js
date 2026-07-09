import { randomUUID } from 'crypto';

export const createAuditLogger = ({ auditLogPath, loadFile, saveFile, log }) => {
    return async (event, actor, target = null, details = {}) => {
        try {
            const auditLog = await loadFile(auditLogPath, []);
            auditLog.unshift({
                id: randomUUID(),
                timestamp: new Date().toISOString(),
                event,
                actor: actor ? {
                    id: actor.id || actor.plexId || null,
                    plexId: actor.plexId || actor.id || null,
                    username: actor.username || null,
                    email: actor.email || null,
                    isAdmin: !!actor.isAdmin
                } : null,
                target: target ? {
                    id: target.id || target.plexId || null,
                    plexId: target.plexId || target.id || null,
                    username: target.username || null,
                    email: target.email || null
                } : null,
                details
            });
            await saveFile(auditLogPath, auditLog.slice(0, 5000));
        } catch (error) {
            log(`Failed to write audit log: ${error.message}`);
        }
    };
};
