"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "public", "play.html"), "utf8");
const landingHtml = fs.readFileSync(path.join(root, "public", "index.html"), "utf8");
const css = fs.readFileSync(path.join(root, "public", "css", "style.css"), "utf8");
const app = fs.readFileSync(path.join(root, "public", "js", "app.js"), "utf8");
const bossGame = fs.readFileSync(path.join(root, "public", "js", "alliance-boss-game.js"), "utf8");
const bossGame3d = fs.readFileSync(path.join(root, "public", "js", "alliance-boss-3d.js"), "utf8");
const city3d = fs.readFileSync(path.join(root, "public", "js", "city-3d.js"), "utf8");
const routes = fs.readFileSync(path.join(root, "src", "routes.js"), "utf8");
const { BUILDINGS } = require("../src/catalog");

test("alliance is the first item inside the command menu", () => {
  for (const shell of [html, landingHtml]) {
    assert.equal((shell.match(/data-view="alliance"/g) || []).length, 1);
    assert.match(shell, /<span class="nav-group">Kommando<\/span>\s*<button data-view="alliance">Allianz/);
    assert.ok(shell.indexOf('<span class="nav-group">Kommando</span>') < shell.indexOf('<span class="nav-group">Bauen</span>'));
  }
});

test("alliance planet uses a dedicated vertical scroll surface", () => {
  assert.match(app, /alliance-planet-open/);
  assert.match(css, /\.shell\.view-home\.alliance-planet-open \.view/);
  assert.match(css, /touch-action:pan-y/);
});

test("mobile layout contract covers primary game surfaces", () => {
  assert.match(css, /Mobile layout contract/);
  for (const selector of [".ally-layout", ".battle-grid", ".mail-layout", ".settings-grid", ".group-origin-list"]) {
    assert.ok(css.includes(selector), `missing responsive rule for ${selector}`);
  }
  assert.match(css, /body\[data-mode="play"\] input/);
});

test("mobile chrome exposes three resources, an expander and map search toggle", () => {
  assert.match(app, /\["metal", "energy", "crystal"\]/);
  assert.match(app, /RESOURCE_VIEWS = new Set\(\["command", "infra", "research", "yard"\]\)/);
  assert.match(app, /res-primary/);
  assert.match(app, /res-secondary/);
  assert.match(app, /class="res-more"/);
  assert.match(app, /class="resource-toggle"/);
  assert.match(app, /class="map-search-toggle"/);
  assert.match(app, /mapTools\?\.classList\.toggle\("open"\)/);
  assert.doesNotMatch(app, /map-view-switch/);
  assert.doesNotMatch(app, /data-map-view="sector"/);
  assert.match(app, /tree-hide-owned/);
  assert.match(app, /Bekannte ausblenden/);
  assert.match(css, /\.resources\.expanded \.res-more/);
  assert.match(css, /\.shell:not\(\.show-resources\) #resources/);
  assert.match(css, /\.map-view-switch \{ display: none !important; \}/);
  assert.match(css, /\.map-search-toggle/);
  assert.match(css, /right: 10px;/);
  assert.match(css, /\.tree-hide-known/);
  assert.match(css, /\.tree\.hide-owned \.tree-node\.owned/);
});

test("mobile catalog cards are image-first and the colony uses an isometric planet diorama", () => {
  assert.match(css, /flex-direction:column/);
  assert.match(css, /\.og-row>\.og-art/);
  assert.match(app, /id="city-actions"/);
  assert.match(app, /Schiffe produzieren/);
  assert.match(app, /class="city-view diorama/);
  assert.match(app, /empty-pad-iso\.png/);
  assert.match(app, /base-iso-planet\.jpg/);
  assert.match(app, /base-iso-planet-mobile\.jpg/);
  assert.match(app, /buildings-iso\/\$\{plot\.id\}\.png/);
  assert.match(css, /\.city-view\.diorama/);
  assert.match(css, /\.city-empty-pad/);
  assert.match(css, /\.city-actions/);
  assert.equal(fs.existsSync(path.join(root, "public", "assets", "colony", "base-iso-planet.jpg")), true);
  assert.equal(fs.existsSync(path.join(root, "public", "assets", "colony", "base-iso-planet-mobile.jpg")), true);
  assert.equal(fs.existsSync(path.join(root, "public", "assets", "colony", "empty-pad-iso.png")), true);
  const buildingArt = fs.readdirSync(path.join(root, "public", "assets", "colony", "buildings-iso")).filter((name) => name.endsWith(".png"));
  for (const id of Object.keys(BUILDINGS)) assert.ok(buildingArt.includes(`${id}.png`), `missing colony sprite for ${id}`);
});

test("funk splits messages, combat reports and spy reports", () => {
  assert.match(app, /data-news="messages"/);
  assert.match(app, /data-news="combat"/);
  assert.match(app, /data-news="spy"/);
  assert.match(app, /function reportChannel/);
  assert.match(app, /kind === "combat"\) return "combat"/);
  assert.match(app, /kind === "spy"\) return "spy"/);
});

test("star map uses cinematic art and labels every detailed system", () => {
  assert.match(bossGame3d, /alliance-war-titan-v1\.png/);
  assert.match(fs.readFileSync(path.join(root, "public", "js", "map.js"), "utf8"), /starfield-nebula-v1\.png/);
  assert.match(fs.readFileSync(path.join(root, "public", "js", "map.js"), "utf8"), /s\.planetCount \? ` · \$\{s\.planetCount\}`/);
  assert.match(routes, /planetCount: planetCounts\[s\.id\]/);
  assert.match(css, /KOMMANDOZENTRALE/);
  assert.match(css, /grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.equal(fs.existsSync(path.join(root, "public", "assets", "map", "starfield-nebula-v1.png")), true);
  assert.match(css, /\.shell\.view-home \.city-commander\{display:none!important\}/);
  assert.match(css, /\.shell\.view-home \.dock\{display:none!important\}/);
});

test("alliance boss is grounded, returns fire and scales player hull from score", () => {
  assert.match(bossGame, /alliance-war-titan-v1\.png/);
  assert.match(bossGame, /maxPlayerHp.*playerScore/);
  assert.match(bossGame, /function enemyFire/);
  assert.match(bossGame, /GEFECHTS-HÜLLE/);
  assert.doesNotMatch(bossGame, /enemy-interceptor|escorts/);
  assert.match(app, /playerScore: state\.snap\?\.empire\?\.score/);
});

test("alliance boss prefers a real WebGL scene with a safe 2D fallback", () => {
  assert.match(bossGame, /canRunAllianceBoss3D\(\)/);
  assert.match(bossGame3d, /new THREE\.WebGLRenderer/);
  assert.match(bossGame3d, /PerspectiveCamera/);
  assert.match(bossGame3d, /shadowMap\.enabled = true/);
  assert.match(bossGame3d, /Raycaster/);
  assert.match(bossGame3d, /function bossShoot/);
  assert.match(bossGame3d, /alliance-war-titan-v1\.png/);
  assert.match(bossGame3d, /alliance-cannon-housing-v2-web\.png/);
  assert.match(bossGame3d, /barrelPivot\.lookAt\(smoothedAim\)/);
  assert.match(bossGame3d, /barrelPivot\.rotateY\(Math\.PI\)/);
  assert.match(bossGame3d, /function muzzleFromScreen\(side\)/);
  assert.match(bossGame3d, /child\.material\.colorWrite=false/);
  assert.match(bossGame3d, /cannonSprite\.position\.x=pointerNdc\.x\*\.9/);
  assert.match(bossGame3d, /cannonSpriteMat\.rotation=-pointerNdc\.x\*\.09/);
  assert.match(bossGame3d, /cannon\.traverse\(child=>\{if\(child\.isMesh\)child\.visible=false/);
  assert.match(bossGame3d, /boss\.position\.x=Math\.sin/);
  assert.match(bossGame3d, /makeGroundTexture/);
  assert.match(bossGame3d, /if\(!obj\)\{combo=Math\.max/);
  assert.match(bossGame3d, /CylinderGeometry\(\.115,\.19,8\.4/);
  assert.doesNotMatch(bossGame3d, /enemy-interceptor|escorts/);
  assert.equal(fs.existsSync(path.join(root, "public", "vendor", "three.module.min.js")), true);
  assert.equal(fs.existsSync(path.join(root, "public", "vendor", "three.core.min.js")), true);
});

test("loopback localhost automatically enables unlimited local boss testing", () => {
  assert.match(routes, /const loopback = address === "127\.0\.0\.1"/);
  assert.match(routes, /hostname === "localhost"/);
  assert.match(routes, /if \(!loopback\) return false/);
});
