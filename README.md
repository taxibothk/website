# RideBot HK website

Static site for RideBot HK: book a Hong Kong taxi on Telegram, estimate a fare (official meter table +
tunnel tolls on the route), airport fares by district, and driver sign-up. English, 繁體中文, 简体中文.

Live: https://taxibothk.com/

`data.js` is generated from the bot's fare data (`site/build.py` in the RideBot project), so the site
and the bots quote the same way. Place search: Photon (OpenStreetMap); routes: OSRM.
