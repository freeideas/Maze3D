# app/: the pages

Everything here is served as-is by `server/maze3d_server/app.py`. One page, one subdirectory, each with its own `index.html`, its CSS and JS, and a `README.md` (never served).

```text
index.html   sends you to welcome/
welcome/     what the game is, Play, best times
play/        the game
vendor/      third-party code, pinned
```

Rules: page-relative URLs only (`../play/`, `../ws`), plain HTML, CSS and ES modules, no build step. What is in Git is what is served.
