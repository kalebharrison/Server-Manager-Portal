export const ensureDeferredReply = async (interaction, options = { ephemeral: true }) => {
    if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply(options);
    }
};

export const replyOrEdit = async (interaction, payload) => {
    if (interaction.deferred) {
        const { ephemeral, ...rest } = payload;
        return interaction.editReply(rest);
    }
    if (interaction.replied) {
        return interaction.followUp({ ...payload, ephemeral: payload.ephemeral ?? true });
    }
    return interaction.reply(payload);
};
