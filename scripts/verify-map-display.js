const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const originalEditor = {text:'保存前の精緻化記述'};
const stack = name => ({isStack:true,isMaximised:false,contentItems:[{config:{componentName:name},editor:originalEditor}],toggleMaximise(){this.isMaximised=!this.isMaximised;}});
const keyword=stack('mainContents'), hypothesis=stack('extraContent');
const components=[keyword,hypothesis].map(parent=>({config:parent.contentItems[0].config,parent}));
const buttons=components.map(c=>({dataset:{mapExpand:c.config.componentName},setAttribute(k,v){this[k]=v;}}));
const listeners={};
const context={window:{},myLayout:{root:{getItemsByFilter:filter=>components.filter(filter)}},requestAnimationFrame:fn=>fn(),updateLayoutSize(){},
  document:{querySelectorAll:()=>buttons,addEventListener:(name,fn)=>listeners[name]=fn,getElementById:()=>({open:false})}};
const main=fs.readFileSync(require.resolve('../JS/main.js'),'utf8');
vm.runInNewContext(main.slice(main.indexOf('// Enlarge existing Golden Layout items')),context);
context.window.toggleWorkspaceMap('mainContents');assert.equal(keyword.isMaximised,true);
context.window.toggleWorkspaceMap('extraContent');assert.equal(keyword.isMaximised,false);assert.equal(hypothesis.isMaximised,true);
assert.equal(buttons[1].textContent,'元の配置に戻す');assert.strictEqual(hypothesis.contentItems[0].editor,originalEditor);
listeners.keydown({key:'Escape'});assert.equal(hypothesis.isMaximised,false);assert.equal(originalEditor.text,'保存前の精緻化記述');
// Production process-map opening/closing logic preserves the existing map and editor.
const summary={textContent:'',focus(){this.focused=true;}};
const drawer={open:true,attributes:{},querySelector:()=>summary,setAttribute(k,v){this.attributes[k]=v;},removeAttribute(k){delete this.attributes[k];}};
const layout={inert:false};const processMap={nodes:[{content:'既存ノード'}]};let saves=0, redraws=0;
const processContext={elements:{drawer},document:{getElementById:()=>layout},state:{initialized:true,map:processMap,network:{redraw(){redraws++;}}},
  window:{dispatchEvent(){}},Event:class {},requestAnimationFrame:fn=>fn(),initializeNetwork(){},saveNow(){saves++;},loadInitialMap(){throw Error('Map must not be reloaded on reopening');}};
const processSource=fs.readFileSync(require.resolve('../JS/process-map.js'),'utf8');
const start=processSource.indexOf('  function toggleProcessMap()');
vm.runInNewContext(processSource.slice(start,processSource.indexOf('  function bindElements()',start)),processContext);
processContext.toggleProcessMap();assert.equal(layout.inert,true);assert.equal(drawer.attributes['aria-modal'],'true');assert(redraws);
drawer.open=false;processContext.toggleProcessMap();assert.equal(layout.inert,false);assert.equal(saves,1);
assert.strictEqual(processContext.state.map,processMap);drawer.open=true;processContext.toggleProcessMap();assert.strictEqual(processContext.state.map,processMap);
console.log('map-display: expand, switch, Escape, restore, process-map open/close and editor retention passed');
