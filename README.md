# Pokopia Comfort Optimizer

Search a Pokemon, see what it likes, and get the list of items that match —
ranked by how many of its favorites each item hits.

A static site: plain HTML, CSS, and JavaScript reading pre-built JSON files.
No backend, no build step, no dependencies.

## Use it

Serve the folder over HTTP and open it:

```bash
python -m http.server 8765
```

(Opening `index.html` directly off disk won't work — the browser blocks the
JSON files over `file://`.)

To publish: push to `main` and enable GitHub Pages on `main` / root.

## What's in it

| File | |
| --- | --- |
| `index.html`, `app.js`, `styles.css` | the whole app |
| `data/items.json` | 1788 items — name, category, use, tags, icon |
| `data/pokemon.json` | 366 Pokemon — favorites, sprite, ideal habitat |
| `data/tags.json` | the 48 favorite tags |

The data was compiled from [pokopia.gamertw.com](https://pokopia.gamertw.com/item),
[serebii.net](https://www.serebii.net/pokemonpokopia/basinpokedex.shtml), and a
community [favorites spreadsheet](https://docs.google.com/spreadsheets/d/1YbVctFDD0irBiHuOg0eDDq5k_DQR4ToR5DcTLB3I5Jk/edit?gid=0#gid=0).
Item and Pokemon images are hotlinked from those sites.
