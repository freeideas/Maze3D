# Deployment

Monster Maze runs on **contabix** (reached as `ordinarydata.com`), from `/home/ace/Desktop/prjx/Maze3D/`, as the systemd unit `maze3d` on **127.0.0.1:8770**. Caddy forwards **<https://maze3d.endlessmind.com/>** to it, the same way it forwards `maze.endlessmind.com` to Endless Maze (port 8760). DNS for endlessmind.com is on Cloudflare.

## Updating

Check the checkout is clean, then `git pull --ff-only`. Page files (`app/`) are read on every request, so they need no restart; browsers may keep an old copy for up to five minutes. Server changes need `sudo systemctl restart maze3d`, which ends every game in progress: players' pages reconnect by themselves and start their level over.

## Setting it up

1. DNS: an `A` record for `maze3d.endlessmind.com` pointing at the server, as `maze.endlessmind.com` has.
2. `sudo cp deploy/maze3d.service /etc/systemd/system/ && sudo systemctl enable --now maze3d`
3. Caddy: add the block in `deploy/Caddyfile.snippet` next to Endless Maze's, add `maze3d.endlessmind.com` to `@allowed_domains`, back up the Caddyfile first, then `sudo caddy validate --config /etc/caddy/Caddyfile` and `sudo systemctl reload caddy`.

## Data

`data/` holds `progress.json` (each guest's highest level and best times) and `best.json` (the best time on each level). Both are rewritten whole on every finish. Losing them loses guests' levels and the best-times table, nothing else.

## Limits

One process holds every game in memory. It sends each player 20 small updates a second, so a few hundred players at once is comfortable. The service is capped at 512 MB.
