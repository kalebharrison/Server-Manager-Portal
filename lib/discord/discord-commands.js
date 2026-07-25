import { SlashCommandBuilder } from 'discord.js';

export const buildDiscordSlashCommands = () => ([
    new SlashCommandBuilder()
        .setName('request')
        .setDescription('Search and request media through the portal')
        .addStringOption((option) => option.setName('query').setDescription('Title to search').setRequired(true))
        .addStringOption((option) => option
            .setName('type')
            .setDescription('Movie or TV')
            .addChoices(
                { name: 'Movie', value: 'movie' },
                { name: 'TV', value: 'tv' },
                { name: 'All', value: 'all' },
            )),
    new SlashCommandBuilder()
        .setName('myrequests')
        .setDescription('Show your recent portal requests')
        .addStringOption((option) => option
            .setName('filter')
            .setDescription('Status filter')
            .addChoices(
                { name: 'All recent', value: 'all' },
                { name: 'Pending', value: 'pending' },
                { name: 'Processing', value: 'processing' },
                { name: 'Available', value: 'available' },
            )),
    new SlashCommandBuilder()
        .setName('issue')
        .setDescription('Report or manage media issues')
        .addSubcommand((sub) => sub
            .setName('report')
            .setDescription('Open a form to report an issue')
            .addStringOption((option) => option.setName('title').setDescription('Title of the media').setRequired(true))
            .addStringOption((option) => option.setName('details').setDescription('What is wrong').setRequired(true))
            .addStringOption((option) => option
                .setName('type')
                .setDescription('Issue type')
                .addChoices(
                    { name: 'Video', value: '1' },
                    { name: 'Audio', value: '2' },
                    { name: 'Subtitles', value: '3' },
                    { name: 'Other', value: '4' },
                )))
        .addSubcommand((sub) => sub
            .setName('list')
            .setDescription('List your open portal issues'))
        .addSubcommand((sub) => sub
            .setName('view')
            .setDescription('View one of your issues')
            .addStringOption((option) => option.setName('id').setDescription('Issue id').setRequired(true)))
        .addSubcommand((sub) => sub
            .setName('comment')
            .setDescription('Comment on one of your issues')
            .addStringOption((option) => option.setName('id').setDescription('Issue id').setRequired(true))
            .addStringOption((option) => option.setName('message').setDescription('Comment text').setRequired(true))),
    new SlashCommandBuilder()
        .setName('stats')
        .setDescription('Your personal watch stats summary'),
    new SlashCommandBuilder()
        .setName('live')
        .setDescription('See what is streaming now'),
    new SlashCommandBuilder()
        .setName('queue')
        .setDescription('See downloads / titles on the way'),
    new SlashCommandBuilder()
        .setName('status')
        .setDescription('Service status snapshot'),
    new SlashCommandBuilder()
        .setName('discover')
        .setDescription('Browse trending or popular titles')
        .addStringOption((option) => option
            .setName('category')
            .setDescription('Browse category')
            .addChoices(
                { name: 'Trending', value: 'trending' },
                { name: 'Popular', value: 'popular' },
                { name: 'Upcoming', value: 'upcoming' },
                { name: 'Movies', value: 'movies' },
                { name: 'TV', value: 'tv' },
            )),
    new SlashCommandBuilder()
        .setName('ask')
        .setDescription('Ask in natural language (request, stats, queue, …)')
        .addStringOption((option) => option.setName('text').setDescription('What do you want to do?').setRequired(true)),
    new SlashCommandBuilder()
        .setName('help')
        .setDescription('Show portal Discord bot commands'),
].map((command) => command.toJSON()));
