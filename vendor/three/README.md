# Vendored Three.js

`three.module.js` and `addons/objects/Sky.js` are copied verbatim from the
`three` npm package (see `package.json` for the pinned version) so the game
runs as a plain static site with no build step and no `node_modules`
dependency at deploy time — the import map in `index.html` points here
instead of `node_modules`.

To upgrade: bump `three` in `package.json`, `npm install`, then re-copy:

```sh
cp node_modules/three/build/three.module.js vendor/three/three.module.js
cp node_modules/three/build/three.core.js vendor/three/three.core.js
cp node_modules/three/examples/jsm/objects/Sky.js vendor/three/addons/objects/Sky.js
```

(`three.core.js` is a chunk `three.module.js` imports internally as of the vendored version — check for other sibling `./xxx.js` imports at the top of `three.module.js` after any future upgrade.)
