const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const originalEditor = {text:'保存前の精緻化記述'};
const stack = name => ({isStack:true,isMaximised:false,contentItems:[{config:{componentName:name},editor:originalEditor}],toggleMaximise(){this.isMaximised=!this.isMaximised;}});
const keyword=stack('mainContents'), process=stack('extraContent');
const components=[keyword,process].map(parent=>({config:parent.contentItems[0].config,parent}));
const buttons=components.map(c=>({dataset:{mapExpand:c.config.componentName},setAttribute(k,v){this[k]=v;}}));
const listeners={};
const context={window:{},myLayout:{root:{getItemsByFilter:filter=>components.filter(filter)}},requestAnimationFrame:fn=>fn(),updateLayoutSize(){},
  document:{querySelectorAll:()=>buttons,addEventListener:(name,fn)=>listeners[name]=fn,getElementById:()=>({open:false})}};
const main=fs.readFileSync(require.resolve('../JS/main.js'),'utf8');
vm.runInNewContext(main.slice(main.indexOf('// Enlarge existing Golden Layout items')),context);
context.window.toggleWorkspaceMap('mainContents');assert.equal(keyword.isMaximised,true);
context.window.toggleWorkspaceMap('extraContent');assert.equal(keyword.isMaximised,false);assert.equal(process.isMaximised,true);
assert.equal(buttons[1].textContent,'元の配置に戻す');assert.strictEqual(process.contentItems[0].editor,originalEditor);
listeners.keydown({key:'Escape'});assert.equal(process.isMaximised,false);assert.equal(originalEditor.text,'保存前の精緻化記述');
// Golden Layout sizes the maximised map; a second recursive resize must not shrink it back to the split layout.
const resizedMap={width:0,height:0};
const resizeContext={document:{getElementById:()=>({clientWidth:1400,clientHeight:700})},notifyVisualResize(){},
  myLayout:{updateSize(width,height){resizedMap.width=width;resizedMap.height=height;},root:{contentItems:[{callDownwards(){resizedMap.width*=.8;resizedMap.height*=.7;}}]}}};
vm.runInNewContext(main.slice(main.indexOf('function updateLayoutSize()'),main.indexOf('let resizeTimer')),resizeContext);
resizeContext.updateLayoutSize();assert.equal(resizedMap.width,1400);assert.equal(resizedMap.height,700);
// Opening/closing the hypothesis drawer notifies the existing controller without replacing editor DOM.
const summary={textContent:'',focus(){this.focused=true;}};
const drawer={id:'hypothesisWorkspaceDrawer',dataset:{title:'仮説構造化ワークスペースを開く'},open:true,editor:originalEditor,attributes:{},querySelector:()=>summary,setAttribute(k,v){this.attributes[k]=v;},removeAttribute(k){delete this.attributes[k];}};
const layout={inert:false};const events=[];let redraws=0;
const drawerContext={document:{getElementById:()=>layout},window:{dispatchEvent:event=>events.push(event)},
  CustomEvent:class {constructor(type,options){this.type=type;this.detail=options.detail;}},requestAnimationFrame:fn=>fn(),notifyVisualResize(){redraws++;}};
const start=main.indexOf('function toggleWorkspaceDrawer(');
vm.runInNewContext(main.slice(start,main.indexOf("document.addEventListener('DOMContentLoaded'",start)),drawerContext);
drawerContext.toggleWorkspaceDrawer(drawer);assert.equal(layout.inert,true);assert.equal(drawer.attributes['aria-modal'],'true');assert(summary.focused);
assert.equal(events[0].detail.id,drawer.id);assert.equal(events[0].detail.open,true);
drawer.open=false;drawerContext.toggleWorkspaceDrawer(drawer);assert.equal(layout.inert,false);assert.equal(drawer.attributes['aria-modal'],undefined);assert.equal(summary.textContent,drawer.dataset.title);
drawer.open=true;drawerContext.toggleWorkspaceDrawer(drawer);assert.strictEqual(drawer.editor,originalEditor);assert.equal(redraws,3);
context.document.getElementById=()=>drawer;listeners.keydown({key:'Escape'});assert.equal(drawer.open,false);
// The full existing process editor occupies Golden Layout, and the hypothesis editor occupies the drawer.
const html=fs.readFileSync(require.resolve('../main.html'),'utf8');
const processTemplate=html.slice(html.indexOf('id="extra-content-content"'),html.indexOf('<script src="JS/runtime-config.js"'));
assert(processTemplate.includes('id="processMapNetwork"'));assert(processTemplate.includes('id="processNodeForm"'));assert(processTemplate.includes('id="processChildGrainBtn"'));
const drawerTemplate=html.slice(html.indexOf('id="hypothesisWorkspaceDrawer"'),html.indexOf('</details>'));
assert(drawerTemplate.includes('class="extra-content-area"'));assert(drawerTemplate.includes('id="myDiagramDiv"'));assert(!drawerTemplate.includes('id="processMapNetwork"'));
console.log('map-display: map placement, expand, switch, Escape, restore, drawer events and editor retention passed');
