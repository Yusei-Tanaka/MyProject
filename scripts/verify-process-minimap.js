const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const document = { activeElement: null, createElement: tag => new Element(tag) };
class Element {
  constructor(tag) {
    this.tag = tag;
    this.children = [];
    this.attributes = {};
    this.events = {};
    this.style = {};
    this.scrollTop = 0;
  }
  setAttribute(key, value) { this.attributes[key] = value; }
  appendChild(child) { this.children.push(child); }
  replaceChildren() { this.children = []; }
  addEventListener(name, handler) { this.events[name] = handler; }
  contains(node) { return this === node || this.children.some(child => child.contains(node)); }
  focus() { document.activeElement = this; }
  getBoundingClientRect() { return this.bounds || { top: 0, bottom: 100 }; }
}
const descendants = node => node.children.flatMap(child => [child, ...descendants(child)]);
const viewport = new Element('nav'), count = new Element('span'), moves = [], frames = [];
const hierarchy = [
  { mapId: 'root', title: 'Root', parentMapId: null },
  { mapId: 'a', title: '長いマップ名も先頭の七文字だけに切り詰めず表示する', parentMapId: 'root' },
  { mapId: 'b', title: 'Branch B', parentMapId: 'root' },
  { mapId: 'aa', title: 'Nested', parentMapId: 'a' },
  { mapId: 'elsewhere', title: 'Other tree', parentMapId: null },
];
const context = {
  state: { hierarchy, currentMapId: 'a', breadcrumbs: [{ mapId: 'root' }], loading: false },
  elements: { minimap: viewport, minimapCount: count },
  document, requestAnimationFrame: fn => frames.push(fn),
  openMap: async id => moves.push(id), setStatus() {},
};
const source = fs.readFileSync(require.resolve('../JS/process-map.js'), 'utf8');
vm.createContext(context);
vm.runInContext(source.slice(source.indexOf('  function buildHierarchyOverview'), source.indexOf('  function showEmptyInspector')), context);
const render = () => {
  context.renderHierarchyMinimap();
  return descendants(viewport).filter(item => item.tag === 'button');
};
const flushFrames = () => { while (frames.length) frames.shift()(); };

async function verify() {
  const overview = context.buildHierarchyOverview(hierarchy, 'root');
  assert.deepEqual(Array.from(overview, item => item.mapId), ['root', 'a', 'aa', 'b']);
  assert.equal(overview[2].parent.mapId, 'a');
  let buttons = render();
  assert.equal(count.textContent, '4');
  assert.equal(buttons.length, 4);
  assert.equal(buttons.filter(item => item.attributes['aria-current'] === 'location').length, 1);
  assert.equal(buttons[1].children[1].textContent, hierarchy[1].title);
  assert(buttons.every(item => item.type === 'button'));
  await buttons[0].events.click();
  assert.deepEqual(moves, ['root']);
  await buttons[1].events.click();
  assert.equal(moves.length, 1);
  buttons[1].events.keydown({ key: 'ArrowDown', preventDefault() {} });
  assert.equal(document.activeElement, buttons[2]);
  buttons[2].events.keydown({ key: 'Home', preventDefault() {} });
  assert.equal(document.activeElement, buttons[0]);
  buttons[0].events.keydown({ key: 'End', preventDefault() {} });
  assert.equal(document.activeElement, buttons[3]);
  context.state.loading = true;
  await buttons[3].events.click();
  assert.equal(moves.length, 1);
  context.state.loading = false;

  // Saving before navigation must not allow a second click to open another map.
  let finishNavigation;
  context.openMap = id => new Promise(resolve => { moves.push(id); finishNavigation = resolve; });
  const pending = buttons[2].events.click();
  await buttons[3].events.click();
  assert.deepEqual(moves, ['root', 'aa']);
  finishNavigation();
  await pending;
  flushFrames();

  // A keyboard user's focus and current location survive the map bundle refresh.
  document.activeElement = buttons[2];
  context.state.currentMapId = 'aa';
  buttons = render();
  buttons[2].bounds = { top: 180, bottom: 220 };
  flushFrames();
  assert.equal(document.activeElement, buttons[2]);
  assert.equal(viewport.scrollTop, 124);

  // Wide/deep trees remain complete, scoped to this root, and cycle-safe.
  const manyMaps = Array.from({ length: 60 }, (_, index) => ({
    mapId: `child-${index}`, title: `Map ${index}`, parentMapId: index ? `child-${index - 1}` : 'root',
  }));
  context.state.hierarchy = [...hierarchy, ...manyMaps];
  assert.equal(render().length, 64);
  flushFrames();
  const cycle = [{ mapId: 1, parentMapId: 2 }, { mapId: 2, parentMapId: 1 }];
  assert.equal(context.buildHierarchyOverview(cycle, 1).length, 2);
  context.state.hierarchy = [];
  assert.equal(render().length, 0);
  assert.equal(count.textContent, '0');
  assert.equal(viewport.children[0].textContent, 'まだマップがありません。');
  console.log('process-minimap: hierarchy, current location, full titles, navigation guards, keyboard focus, scrolling and deep trees passed');
}
verify().catch(error => { console.error(error); process.exitCode = 1; });
