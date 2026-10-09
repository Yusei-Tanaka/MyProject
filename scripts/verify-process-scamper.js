// Exercise process-map branching with mock persistence; no live AI or user data writes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
class DataSet {
  constructor() { this.items = new Map(); }
  add(item) { this.items.set(item.id, {...item}); }
  update(item) { this.items.set(item.id, {...this.items.get(item.id), ...item}); }
  get(id) { return id === undefined ? [...this.items.values()] : this.items.get(id); }
  getIds() { return [...this.items.keys()]; }
}
const control = () => ({value:'',hidden:false,replaceChildren(){},appendChild(){},classList:{toggle(){}},textContent:''});
const window = {location:{protocol:'http:',hostname:'localhost'},ProcessMapSupport:{generateGuidance:()=>[]},crypto:{randomUUID:()=>`id-${++nextId}`}};
let nextId = 0;
const sandbox = {window,document:{readyState:'loading',addEventListener(){},getElementById:()=>null,createElement:control},
  localStorage:{getItem:()=> 'test'},fetch:async()=>({}),setTimeout:()=>1,clearTimeout(){}};
const source = fs.readFileSync(require.resolve('../JS/process-map.js'),'utf8').replace(
  '  window.ProcessMap = {addScamperIdea, linkHypothesis, getScamperSource};',
  `  window.ProcessMap = {addScamperIdea, linkHypothesis, getScamperSource};
     window.test = {state,toVisNode,toVisEdge,serializeSnapshot,
       setup() { elements = Object.fromEntries(['scamperBtn','emptyInspector','nodeForm','edgeForm','selectionKind','detailNodeType','nodeContent','nodeMemo','relatedKeywords','relatedReference','existingReferenceType','existingReferenceId','relatedNodes','childGrainState','childGrainBtn','guidanceList','status'].map(key=>[key,document.createElement('div')])); }
     };`);
vm.runInNewContext(source,sandbox);
const T = window.test; T.setup();
T.state.currentMapId = 'root'; T.state.nodes = new DataSet(); T.state.edges = new DataSet();
T.state.network = {getPositions:()=>({'source':{x:10,y:20}}),getViewPosition:()=>({x:0,y:0}),selectNodes(){}};
T.state.nodes.add(T.toVisNode({nodeId:'source',content:'元の疑問',nodeType:'problem_question',relatedKeywords:['energy']}));
assert.throws(()=>window.ProcessMap.getScamperSource(),/選択/);
T.state.selection={kind:'node',id:'source'};
assert.equal(window.ProcessMap.getScamperSource().nodeId,'source');
const request = {text:'置換した案',sourceMapId:'root',sourceNodeId:'source',perspective:'置換'};
const ideaId = window.ProcessMap.addScamperIdea(request);
assert.equal(T.state.nodes.get(ideaId).nodeType,'suggestion');
assert.equal(T.state.nodes.get('source').content,'元の疑問');
assert.equal(T.state.edges.get()[0].from,'source');
assert.equal(T.state.edges.get()[0].to,ideaId);
assert.equal(T.state.edges.get()[0].edgeType,'suggestion_generation');
assert.equal(T.state.dirty,true);
window.ProcessMap.addScamperIdea({...request,text:'案を修正',ideaNodeId:ideaId,hypothesisId:'hypothesis-1'});
assert.equal(T.state.nodes.get().length,2); assert.equal(T.state.edges.get().length,1);
assert.equal(T.state.nodes.get(ideaId).content,'案を修正');
assert.equal(T.state.nodes.get(ideaId).existingReferenceId,'hypothesis-1');
T.state.currentMapId = 'child';
assert.throws(()=>window.ProcessMap.addScamperIdea(request),/戻って/);
window.ProcessMap.linkHypothesis(ideaId,'root','wrong-map');
assert.equal(T.state.nodes.get(ideaId).existingReferenceId,'hypothesis-1');
T.state.currentMapId = 'root';
assert.throws(()=>window.ProcessMap.addScamperIdea({...request,sourceNodeId:'deleted'}),/見つかりません/);
assert.throws(()=>window.ProcessMap.addScamperIdea({...request,text:' '}),/入力/);
const snapshot = JSON.parse(JSON.stringify(T.serializeSnapshot()));
const restored = T.toVisNode(snapshot.nodes.find(node=>node.nodeId===ideaId));
assert.equal(restored.content,'案を修正'); assert.equal(restored.memo,'SCAMPER: 置換');
assert.equal(restored.existingReferenceType,'hypothesis'); assert.equal(restored.existingReferenceId,'hypothesis-1');
assert.equal(T.toVisEdge(snapshot.edges[0]).edgeType,'suggestion_generation');
console.log('process-scamper: branch creation, repeated update, map scope, source retention and snapshot references passed');
