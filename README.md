# SPegetti Slammer

SPegetti Slammer is a browser-based 3D game where you roam a sprawling city with a
10-pound sledgehammer and turn pedestrians, bot players, and cars into writhing strands
of spaghetti. It is built with [Three.js](https://threejs.org/) and loads from a single
static HTML page, so it can be hosted on GitHub Pages.

## Play

- **Live site (once GitHub Pages is enabled):**
  `https://thekrabber.github.io/SPeggeti_Slammer/`
- **Local:** serve the repo over http (e.g. `python3 -m http.server` in the repo root)
  and open `http://localhost:8000/`. Opening the raw `index.html` via `file://` will
  not work because it uses ES modules.

## Controls

| Action | Key |
|---|---|
| Move | **W A S D** (W+S cancel each other, A+D cancel each other) |
| Run (hold) | **Left Shift** |
| Look | **Mouse** (first-person, pointer locked) |
| Swing hammer | **Left Click** (3.5s cooldown, alternates right / left each swing) |
| Release mouse | **Esc** |

## Mechanics

- The city is a 12×12 block grid (~480 m across) with sidewalks, 2-lane roads,
  crosswalks, and buildings of varying heights.
- **Pedestrians** only walk on sidewalks and crosswalks. They never stop and pick
  random turns at intersections. Hit them with the hammer **head** and they become
  spaghetti; hit them with the **handle** and they just get bumped sideways.
- **Cars** only drive on roads, follow their lane, turn at intersections, and never
  stop. If a car runs into a pedestrian, bot, or you, that victim ragdolls into
  spaghetti and respawns 5 seconds later somewhere else in the city.
- **Bot players** (bright magenta hat) are local AI stand-ins for online players;
  they follow the same bump / spaghetti rules as pedestrians.

## Project layout

```
index.html       # page shell + HUD
styles.css       # HUD / menu styling
js/
  main.js        # bootstrap, main loop, scoring, wires everything together
  world.js       # procedural city (roads, sidewalks, crosswalks, buildings)
  entities.js    # pedestrians, bots, cars, spaghetti explosion, collision helpers
  player.js      # first-person controls + sledgehammer + hitboxes
.github/workflows/
  pages.yml      # GitHub Pages deploy
```

## Deploying to GitHub Pages

This repo ships with a GitHub Actions workflow at
[`.github/workflows/pages.yml`](./.github/workflows/pages.yml) that deploys the site
to GitHub Pages on every push to `main`. To enable it:

1. Go to the repo’s **Settings → Pages**.
2. Under **Build and deployment → Source**, select **GitHub Actions**.
3. The next push to `main` will publish the game at the URL above.

## Notes

- “Online” multiplayer is not wired to a real server — hosting on GitHub Pages
  (static only) rules out running a WebSocket backend from this repo alone. The
  bot players exist so that every player-to-player interaction in the brief
  (bumping, spaghettifying) still works and feels right. Wiring real multiplayer
  is a good follow-up PR once a small Node/WS server is added (hostable on
  Fly / Render / similar).
