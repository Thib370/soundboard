// Discord connector slot. Sounds already reach Discord through the same virtual mic; chat/call control comes later.
class DiscordConnector { get id() { return 'discord'; } async connect() { throw new Error('Discord connector not implemented yet'); } async disconnect() {} }
module.exports = { DiscordConnector };
