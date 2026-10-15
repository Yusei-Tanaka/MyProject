const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
class Element {
 constructor(tag){this.tag=tag;this.children=[];this.attributes={};this.events={};}
 setAttribute(key,value){this.attributes[key]=value;}
 appendChild(child){this.children.push(child);}
 replaceChildren(){this.children=[];}
 addEventListener(name,handler){this.events[name]=handler;}
}
const svg=new Element('svg'),moves=[];
const hierarchy=[{mapId:'root',title:'Root',parentMapId:null},{mapId:'a',title:'Branch A',parentMapId:'root'},
 {mapId:'b',title:'Branch B',parentMapId:'root'},{mapId:'aa',title:'Nested',parentMapId:'a'},
 {mapId:'elsewhere',title:'Other tree',parentMapId:null}];
const context={state:{hierarchy,currentMapId:'a',breadcrumbs:[{mapId:'root'}],loading:false},elements:{minimap:svg},
 document:{createElementNS:(ns,tag)=>new Element(tag)},openMap:async id=>moves.push(id),setStatus(){}};
const source=fs.readFileSync(require.resolve('../JS/process-map.js'),'utf8');
vm.createContext(context);vm.runInContext(source.slice(source.indexOf('  function buildHierarchyOverview'),source.indexOf('  function showEmptyInspector')),context);
const overview=context.buildHierarchyOverview(hierarchy,'root');
assert.deepEqual(Array.from(overview,item=>item.mapId),['root','a','aa','b']);assert.equal(overview[2].depth,2);
context.renderHierarchyMinimap();
const groups=svg.children.filter(item=>item.tag==='g');assert.equal(groups.length,4);
assert.equal(groups.filter(item=>item.attributes['aria-current']==='location').length,1);
groups[0].events.click();assert.deepEqual(moves,['root']);
groups[1].events.click();assert.equal(moves.length,1);
groups[2].events.keydown({key:'Enter',preventDefault(){}});assert.deepEqual(moves,['root','aa']);
context.state.loading=true;groups[3].events.click();assert.equal(moves.length,2);
context.state.hierarchy=[];context.renderHierarchyMinimap();assert.equal(svg.children.length,0);
console.log('process-minimap: scoped hierarchy, nested branches, current location, pointer/keyboard navigation and loading guard passed');
