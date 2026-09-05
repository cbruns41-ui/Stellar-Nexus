// Local integration check against an isolated server at :3100.
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { CITY_PLOTS } from "../public/js/city.mjs";
const base = "http://localhost:3100";
const debug = 9347;
const folder = new URL("../tmp/colony-review/", import.meta.url);
await mkdir(folder, { recursive: true });
const server = spawn(process.execPath, ["server.js"], {
  cwd: fileURLToPath(new URL("../", import.meta.url)),
  env: { ...process.env, PORT: "3100", DATABASE_PATH: fileURLToPath(new URL("../tmp/colony-verification.db", import.meta.url)) },
  stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
});
let serverReady = false, serverError = "";
server.stdout.on("data", data => { if (String(data).includes("http://localhost:3100")) serverReady = true; });
server.stderr.on("data", data => { serverError += String(data); });
const chrome = spawn("C:/Program Files/Google/Chrome/Application/chrome.exe", [
  "--headless=new", "--no-first-run", "--no-default-browser-check", "--enable-webgl",
  "--enable-unsafe-swiftshader", "--disable-background-timer-throttling",
  "--user-data-dir=" + fileURLToPath(new URL("../tmp/colony-chrome/", import.meta.url)),
  "--remote-debugging-port=" + debug, "--window-size=1440,960", "about:blank",
], { stdio: "ignore", windowsHide: true });
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let ws;
try {
  for (let i=0;i<100 && !serverReady && server.exitCode===null;i++) await pause(100);
  assert.ok(serverReady,"Isolated server started: " + serverError);
  let browser;
  for (let i = 0; i < 60; i++) {
    try { browser = await fetch(`http://127.0.0.1:${debug}/json/version`).then(r => r.json()); break; } catch { await pause(250); }
  }
  assert.ok(browser, "Chrome debugger started");
  const auth = await fetch(base + "/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "Admin", password: "Wurm4444" }) });
  const token = /sn_session=([^;]+)/.exec(auth.headers.get("set-cookie") || "")?.[1];
  assert.ok(token, "Isolated test account login");
  const page = await fetch(`http://127.0.0.1:${debug}/json/new?about:blank`, { method: "PUT" }).then(r => r.json());
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.addEventListener("open", resolve); ws.addEventListener("error", reject); });
  let counter = 0;
  const pending = new Map(), errors = [], requests = [];
  ws.addEventListener("message", event => {
    const data = JSON.parse(event.data);
    if (data.method === "Network.requestWillBeSent") requests.push({ url: data.params.request.url, method: data.params.request.method });
    if (data.method === "Runtime.exceptionThrown") errors.push(data.params.exceptionDetails.text + " " + (data.params.exceptionDetails.exception?.description || ""));
    if (data.method === "Runtime.consoleAPICalled" && ["error", "warning"].includes(data.params.type)) errors.push(data.params.args.map(a => a.value || a.description).join(" "));
    if (pending.has(data.id)) { const { resolve, reject } = pending.get(data.id); pending.delete(data.id); data.error ? reject(new Error(data.error.message)) : resolve(data.result || {}); }
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++counter; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const value = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (value.exceptionDetails) throw new Error(value.exceptionDetails.exception?.description || value.exceptionDetails.text);
    return value.result?.value;
  };
  await send("Network.enable"); await send("Page.enable"); await send("Runtime.enable");
  await send("Network.setCookie", { name: "sn_session", value: token, url: base + "/" });
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: base + "/" });
  async function until(expression, timeout = 90000) {
    const start = Date.now();
    while (Date.now() - start < timeout) { const result = await evaluate(expression); if (result) return result; await pause(250); }
    throw new Error("Timed out: " + expression + "\n" + errors.join("\n"));
  }
  async function shot(name) {
    const result = await send("Page.captureScreenshot", { format: "png", fromSurface: true });
    await writeFile(new URL(name + ".png", folder), Buffer.from(result.data, "base64"));
  }
  await until(`document.querySelector('.living-colony.is-unity') && document.querySelectorAll('.colony-marker:not([hidden])').length > 5`);
  await pause(1000);
  await evaluate(`window.__colonyFrame = null; window.__colonyOriginalFrame = window.stellarNexusColony.onFrame; window.stellarNexusColony.onFrame = frame => { window.__colonyFrame = frame; window.__colonyOriginalFrame(frame); };`);
  await until(`window.__colonyFrame?.anchors.length === 22`);
  console.log("Unity loaded", await evaluate(`({canvas: [document.querySelector('canvas#colony-unity-canvas').width,document.querySelector('canvas#colony-unity-canvas').height],markers:document.querySelectorAll('.colony-marker:not([hidden])').length})`));
  await shot("desktop-base");
  for (const plot of CITY_PLOTS) {
    await evaluate(`document.querySelector('.colony-card-close')?.click()`);
    const point = await evaluate(`(() => {
      const spec = ${JSON.stringify(plot)};
      const a = window.__colonyFrame.anchors.find(p => p.id === 'command');
      const b = window.__colonyFrame.anchors.find(p => p.id === 'energy_array');
      const x = spec.outline.reduce((sum,p) => sum+p.x,0)/spec.outline.length;
      const y = spec.outline.reduce((sum,p) => sum+p.y,0)/spec.outline.length;
      const r=document.querySelector('.living-colony').getBoundingClientRect();
      return { x:r.left+(a.x+(x-.50)*(b.x-a.x)/(.546-.50))*r.width,
        y:r.top+(a.y+(y-.47)*(b.y-a.y)/(.298-.47))*r.height };
    })()`);
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", ...point });
    await send("Input.dispatchMouseEvent", { type: "mousePressed", button: "left", clickCount: 1, ...point });
    await pause(100);
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", button: "left", clickCount: 1, ...point });
    await until(`document.querySelector('.colony-marker.selected')?.dataset.colonyMarker === '${plot.id}'`, 2500);
  }
  console.log("22 actual Unity collider clicks passed");
  await evaluate(`document.querySelector('.colony-card-close')?.click()`);
  await evaluate(`document.querySelector('[data-city-building="shipyard"]').click()`);
  await until(`!document.querySelector('#city-actions').hidden`);
  await pause(250);
  console.log("Shipyard card", await evaluate(`document.querySelector('#city-actions').innerText`));
  await shot("desktop-shipyard");
  await evaluate(`document.querySelector('[data-colony-info]').click()`);
  await until(`document.querySelector('#bldg-shipyard')`);
  assert.equal(await evaluate(`document.querySelector('#bldg-shipyard').classList.contains('focus-row')`), true);
  assert.equal(await evaluate(`document.querySelector('#colony-unity-layer').hidden`), true);
  await evaluate(`document.querySelector('[data-view="command"]').click()`);
  await until(`document.querySelectorAll('.colony-marker:not([hidden])').length > 5`);
  // Mutate only this script's explicitly isolated verification database.
  const db = new DatabaseSync(fileURLToPath(new URL("../tmp/colony-verification.db", import.meta.url)));
  const testPlanet = db.prepare("SELECT p.id,p.empire_id FROM planets p JOIN empires e ON e.id=p.empire_id JOIN users u ON u.id=e.user_id WHERE u.username='Admin' AND COALESCE(p.alliance_id,0)=0 ORDER BY p.id LIMIT 1").get();
  assert.ok(testPlanet, "Isolated fixture planet exists");
  // Use the selected account's current planet in case the seed provides several.
  const authHeaders = { cookie: "sn_session=" + token };
  const snap = await fetch(base + "/api/state", { headers: authHeaders }).then(r => r.json());
  const pid = snap.planet.id;
  db.prepare("UPDATE planets SET metal=10000,energy=10000,helium=6000,titan=2500,crystal=3500 WHERE id=?").run(pid);
  db.prepare("INSERT INTO buildings(planet_id,building_id,level) VALUES(?, 'command', 2) ON CONFLICT(planet_id,building_id) DO UPDATE SET level=2").run(pid);
  await send("Page.reload");
  await until(`document.querySelector('[data-city-building="command"] b')?.textContent === '2'`);
  await until(`document.querySelectorAll('.colony-marker:not([hidden])').length > 5`);
  await evaluate(`document.querySelector('[data-city-building="command"]').click()`);
  await until(`document.querySelector('[data-colony-upgrade]') && !document.querySelector('[data-colony-upgrade]').disabled`);
  const beforeBuild = requests.filter(r => r.url.includes("/api/build") && r.method === "POST").length;
  await evaluate(`document.querySelector('[data-colony-upgrade]').click()`);
  await until(`document.querySelector('[data-city-building="command"]')?.dataset.status === 'upgrading'`);
  assert.equal(requests.filter(r => r.url.includes("/api/build") && r.method === "POST").length - beforeBuild, 1, "One tap submits one build");
  assert.equal(await evaluate(`document.querySelector('[data-city-building="command"] b').textContent`), "2", "Level stays current during upgrade");
  await shot("desktop-upgrading");
  const pendingBuild = await fetch(base + "/api/state", { headers: authHeaders }).then(r => r.json());
  const buildingDeadline = pendingBuild.queue.find(q => q.planetId === pid && q.kind === "building" && q.itemId === "command").completesAt;
  db.prepare("UPDATE queue SET completes_at=? WHERE planet_id=? AND kind='building' AND item_id='command'").run(Date.now()-10,pid);
  await evaluate(`window.__realNow = Date.now; Date.now = () => window.__realNow() + ${buildingDeadline - Date.now() + 800};`);
  await until(`document.querySelector('[data-city-building="command"] b')?.textContent === '3'`, 8000);
  await evaluate(`Date.now = window.__realNow;`);
  await evaluate(`document.querySelector('[data-city-building="shipyard"]').click()`);
  await until(`document.querySelector('[data-city-building="shipyard"]').dataset.status === 'idle'`);
  // Start a real production order; shorten only the isolated queue for completion.
  const shipResult = await fetch(base + "/api/ship", { method: "POST", headers: { ...authHeaders, "content-type":"application/json" }, body:JSON.stringify({ id:"probe", qty:1, planetId:pid }) });
  assert.equal(shipResult.ok,true,"Real ship order accepted");
  await send("Page.reload");
  await until(`document.querySelector('[data-city-building="shipyard"]')?.dataset.status === 'active'`);
  await until(`document.querySelectorAll('.colony-marker:not([hidden])').length > 5`);
  await evaluate(`document.querySelector('[data-city-building="shipyard"]').click()`);
  await shot("desktop-producing");
  const pendingShip = await fetch(base + "/api/state", { headers: authHeaders }).then(r => r.json());
  const shipDeadline = pendingShip.queue.find(q => q.planetId === pid && q.kind === "ship").completesAt;
  db.prepare("UPDATE queue SET completes_at=? WHERE planet_id=? AND kind='ship'").run(Date.now()-10,pid);
  await evaluate(`window.__realNow = Date.now; Date.now = () => window.__realNow() + ${shipDeadline - Date.now() + 800};`);
  await until(`document.querySelector('[data-city-building="shipyard"]')?.dataset.status === 'idle'`, 8000);
  await until(`document.querySelector('.colony-job')?.hidden === true`, 8000);
  await evaluate(`Date.now = window.__realNow;`);
  console.log("Upgrade, exact current level, production and return to sleep passed");
  // Restore the first tutorial objective in this isolated account.
  db.prepare("DELETE FROM quests WHERE empire_id=? AND quest_id IN ('mine2','helium1')").run(snap.empire.id);
  db.prepare("UPDATE buildings SET level=1 WHERE planet_id=? AND building_id='matter_mine'").run(pid);
  await send("Page.reload");
  await until(`document.querySelector('.city-commander .city-quest[data-highlight-building="matter_mine"]')`);
  assert.match(await evaluate(`document.querySelector('.city-commander').innerText`), /Metall-Mine auf Stufe 2/);
  assert.match(await evaluate(`document.querySelector('.city-quest-reward').textContent`), /350 Met.*180 En.*40 XP/);
  await evaluate(`document.querySelector('.city-commander .city-quest').click()`);
  await until(`document.querySelector('#bldg-matter_mine.focus-row')`);
  await evaluate(`document.querySelector('[data-view="command"]').click()`);
  const mineBuild = await fetch(base + "/api/build", {method:"POST",headers:{...authHeaders,"content-type":"application/json"},body:JSON.stringify({id:"matter_mine",planetId:pid})});
  assert.equal(mineBuild.ok,true,"Tutorial build accepted");
  await send("Page.reload");
  await until(`document.querySelector('[data-city-building="matter_mine"]')?.dataset.status === 'upgrading'`);
  const mineState = await fetch(base + "/api/state", {headers:authHeaders}).then(r=>r.json());
  const mineDeadline = mineState.queue.find(q=>q.planetId===pid && q.kind==='building' && q.itemId==='matter_mine').completesAt;
  db.prepare("UPDATE queue SET completes_at=? WHERE planet_id=? AND kind='building' AND item_id='matter_mine'").run(Date.now()-10,pid);
  await evaluate(`window.__realNow=Date.now; Date.now=()=>window.__realNow()+${mineDeadline-Date.now()+800};`);
  await until(`document.querySelector('.city-commander [data-claim="mine2"]')`,8000);
  await evaluate(`Date.now=window.__realNow;`);
  const beforeClaim = requests.filter(r=>r.url.endsWith('/api/quest/claim') && r.method==='POST').length;
  await evaluate(`const claim=document.querySelector('.city-commander [data-claim="mine2"]'); claim.click(); claim.click();`);
  await until(`document.querySelector('.city-commander h3')?.textContent === 'Treibstoff'`);
  assert.equal(requests.filter(r=>r.url.endsWith('/api/quest/claim') && r.method==='POST').length-beforeClaim,1,"Reward is submitted once");
  assert.ok(db.prepare("SELECT 1 FROM quests WHERE empire_id=? AND quest_id='mine2'").get(snap.empire.id),"Tutorial reward recorded");
  console.log("Tutorial build routing, live reward and next objective passed");
  db.close();
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 2 });
  await evaluate(`document.querySelector('.colony-card-close')?.click(); window.__colonyFrame = null; window.__colonyOriginalFrame = window.stellarNexusColony.onFrame; window.stellarNexusColony.onFrame = frame => { window.__colonyFrame=frame; window.__colonyOriginalFrame(frame); };`);
  await evaluate(`document.querySelector('#colony-unity-canvas').dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true, cancelable: true }))`);
  await until(`window.__colonyFrame?.anchors.length === 22`);
  await pause(1500);
  await shot("mobile-base");
  const railBox = await evaluate(`(() => { const r=document.querySelector('.city-commander').getBoundingClientRect(); return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,height:r.height}; })()`);
  assert.ok(railBox.height > 44 && railBox.height < 150 && railBox.left >= 0 && railBox.right <= 390 && railBox.bottom <= 844,"Compact tutorial rail is visible inside the mobile screen");
  const beforePan = await evaluate(`window.__colonyFrame.anchors.find(p => p.id === 'command').x`);
  await send("Input.dispatchTouchEvent", { type:"touchStart", touchPoints:[{x:250,y:400,id:1}] });
  for (let n=1;n<=6;n++) {
    await pause(45);
    await send("Input.dispatchTouchEvent", { type:"touchMove", touchPoints:[{x:250-n*18,y:400+n*3,id:1}] });
  }
  await send("Input.dispatchTouchEvent", { type:"touchEnd", touchPoints:[] });
  await pause(400);
  const afterPan = await evaluate(`window.__colonyFrame.anchors.find(p => p.id === 'command').x`);
  assert.ok(Math.abs(afterPan-beforePan)>.05,"Touch drag pans the Unity camera");
  assert.equal(await evaluate(`document.querySelectorAll('.colony-marker.selected').length`),0,"Drag does not select a building");
  const beforePinch = await evaluate(`Math.abs(window.__colonyFrame.anchors.find(p => p.id === 'shipyard').x-window.__colonyFrame.anchors.find(p => p.id === 'command').x)`);
  await send("Input.dispatchTouchEvent", { type:"touchStart", touchPoints:[{x:135,y:400,id:1},{x:255,y:400,id:2}] });
  for(let n=1;n<=5;n++) {
    await pause(45);
    await send("Input.dispatchTouchEvent", { type:"touchMove", touchPoints:[{x:135-n*7,y:400,id:1},{x:255+n*7,y:400,id:2}] });
  }
  await send("Input.dispatchTouchEvent", { type:"touchEnd", touchPoints:[] });
  await pause(500);
  const afterPinch = await evaluate(`Math.abs(window.__colonyFrame.anchors.find(p => p.id === 'shipyard').x-window.__colonyFrame.anchors.find(p => p.id === 'command').x)`);
  assert.ok(afterPinch > beforePinch*1.2,"Two-finger pinch zooms the Unity camera");
  assert.equal(await evaluate(`document.querySelectorAll('.colony-marker.selected').length`),0,"Pinch does not select a building");
  console.log("Touch pan and two-finger zoom passed");
  await evaluate(`document.querySelector('#colony-unity-canvas').dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true, cancelable: true }))`);
  await evaluate(`document.querySelector('[data-colony-focus="shipyard"]').click()`);
  await pause(800);
  await shot("mobile-shipyard");
  const box = await evaluate(`(() => { const r=document.querySelector('#city-actions').getBoundingClientRect(); return {left:r.left,right:r.right,top:r.top,bottom:r.bottom}; })()`);
  assert.ok(box.left >= 0 && box.right <= 390 && box.top >= 0 && box.bottom <= 844, "Mobile selection stays inside screen");
  assert.equal(await evaluate(`document.documentElement.scrollWidth <= innerWidth`), true, "No horizontal page overflow");
  console.log("Mobile card bounds", box);
  await send("Emulation.setEmulatedMedia", { features:[{name:"prefers-reduced-motion",value:"reduce"}] });
  const animation = await evaluate(`getComputedStyle(document.querySelector('.colony-marker[data-status="idle"] .colony-sleep i')).animationName`);
  assert.equal(animation,"none","Reduced-motion preference disables sleeping animation");
  await evaluate(`document.querySelector('.colony-card-close')?.click()`);
  const ordersPoint = await evaluate(`(() => { const r=document.querySelector('.colony-orders').getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2}; })()`);
  await send("Input.dispatchTouchEvent", { type:"touchStart", touchPoints:[{...ordersPoint,id:1}] });
  await send("Input.dispatchTouchEvent", { type:"touchEnd", touchPoints:[] });
  await until(`document.querySelector('#colony-quests')`);
  assert.equal(await evaluate(`document.querySelector('#game').dataset.view`), "command", "Tasks open on the base");
  assert.equal(await evaluate(`document.querySelectorAll('[data-colony-camera]').length`), 0, "No camera buttons cover the base");
  const tasks = await evaluate(`document.querySelector('#colony-quests').innerText`);
  assert.match(tasks, /Tagesorder/);
  assert.match(tasks, /Wochenorder/);
  assert.match(tasks, /Kampagne/);
  const tasksBox = await evaluate(`(() => { const r=document.querySelector('#colony-quests').getBoundingClientRect(); return {left:r.left,right:r.right,top:r.top,bottom:r.bottom}; })()`);
  assert.ok(tasksBox.left >= 0 && tasksBox.right <= 390 && tasksBox.top >= 0 && tasksBox.bottom <= 844, "Tasks fit the mobile screen");
  await shot("mobile-tasks");
  await send("Input.dispatchTouchEvent", { type:"touchStart", touchPoints:[{x:180,y:640,id:1}] });
  for(let n=1;n<=6;n++) {
    await pause(45);
    await send("Input.dispatchTouchEvent", { type:"touchMove", touchPoints:[{x:180,y:640-n*30,id:1}] });
  }
  await send("Input.dispatchTouchEvent", { type:"touchEnd", touchPoints:[] });
  await until(`document.querySelector('.colony-quests-content').scrollTop > 40`, 2500);
  await evaluate(`document.querySelector('.colony-quests .city-sheet-close').click()`);
  await until(`!document.querySelector('#colony-quests')`);
  assert.equal(await evaluate(`document.activeElement?.classList.contains('colony-orders')`), true, "Closing tasks restores button focus");
  await evaluate(`document.querySelector('.colony-orders').click()`);
  await until(`document.querySelector('#colony-quests')`);
  const taskTarget = await evaluate(`(() => { const b=[...document.querySelectorAll('#colony-quests [data-view-jump]')].find(b=>b.dataset.viewJump!=='command'); const target=b.dataset.viewJump; b.click(); return target; })()`);
  await until(`document.querySelector('#game').dataset.view === ${JSON.stringify(taskTarget)}`);
  console.log("Daily/weekly tasks, mobile touch scrolling, close and task routing passed");
  await writeFile(new URL("browser-errors.json", folder), JSON.stringify(errors, null, 2));
  console.log("Browser messages", JSON.stringify(errors));
  assert.deepEqual(errors, [], "No browser errors or warnings");
  await writeFile(new URL("verification.json", folder), JSON.stringify({
    passed: true, checkedAt: new Date().toISOString(), engine: "Unity 6000.6.0f1 WebGL",
    desktop: { width: 1440, height: 960 }, mobile: { width: 390, height: 844, deviceScaleFactor: 2 },
    checks: ["22 real collider clicks", "building info routing", "single build submission", "live current level", "ship production", "live return to idle", "touch pan", "two-finger pinch", "mobile card containment", "reduced motion", "daily and weekly tasks", "task touch scrolling", "task routing", "tutorial build routing", "live tutorial reward", "single reward submission", "next tutorial objective", "mobile tutorial rail"],
    browserErrors: errors,
  }, null, 2));
} finally {
  ws?.close(); chrome.kill(); server.kill();
}
