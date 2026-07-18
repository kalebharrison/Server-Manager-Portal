import { validateKillRulesSchema } from '../status/stream-monitor.js';

export const registerKillRuleRoutes = ({
    app,
    requireAdmin,
    killRulesPath,
    loadFile,
    saveFile,
}) => {
    const KILL_RULES_PATH = killRulesPath;

    app.get('/api/kill-rules', requireAdmin, async (req, res) => {
        try {
            const rules = await loadFile(KILL_RULES_PATH, []);
            res.json(rules);
        } catch (e) {
            res.status(500).json({ error: 'Failed to load rules' });
        }
    });

    app.post('/api/kill-rules', requireAdmin, async (req, res) => {
        try {
            const rules = req.body;
            validateKillRulesSchema(rules);
            await saveFile(KILL_RULES_PATH, rules);
            res.json({ success: true });
        } catch (e) {
            res.status(e.message.startsWith('Rule') || e.message.startsWith('Each') || e.message.startsWith('Invalid') ? 400 : 500).json({ error: e.message || 'Failed to save rules' });
        }
    });

};
