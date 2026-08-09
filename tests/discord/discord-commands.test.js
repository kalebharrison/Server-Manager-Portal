import assert from 'node:assert/strict';
import test from 'node:test';
import { InteractionContextType } from 'discord.js';

import { buildDiscordSlashCommands } from '../../lib/discord/discord-commands.js';

test('guild commands stay out of DMs and DM commands stay out of guilds', () => {
    const guild = buildDiscordSlashCommands({ contexts: [InteractionContextType.Guild] });
    const dms = buildDiscordSlashCommands({ contexts: [InteractionContextType.BotDM] });
    assert.equal(guild.length, 10);
    assert.deepEqual(guild.map((command) => command.name), dms.map((command) => command.name));
    assert.ok(guild.every((command) => command.contexts?.length === 1
        && command.contexts[0] === InteractionContextType.Guild));
    assert.ok(dms.every((command) => command.contexts?.length === 1
        && command.contexts[0] === InteractionContextType.BotDM));
});
