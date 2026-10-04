# Architecture

CFX public server endpoint -> API polling -> H2 name detection -> MongoDB member/session/attendance -> Discord event queue -> Discord bot.

The web dashboard is admin-only through Discord OAuth2 and the configured admin role. Bot-to-API requests use `x-internal-secret` so slash commands do not depend on a browser session.
