// Exercise the production workspace controller in a minimal DOM, without a DB or paid AI calls.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const M = require('../JS/hypothesis-network-model');
class Element {
  constructor(tag) { this.tagName=tag; this.children=[]; this.dataset={}; this.value=''; this.hidden=false; this.options=[]; }
  append(...items) { for(const item of items) { if(item.parentElement) item.remove(); item.parentElement=this; this.children.push(item); } if(this.tagName==='select') this.options=this.children; }
  replaceChildren(...items) { this.children.forEach(c=>c.parentElement=null); this.children=[]; this.append(...items); }
  remove() { if(this.parentElement) this.parentElement.children=this.parentElement.children.filter(c=>c!==this); this.parentElement=null; }
  setAttribute() {}
  get selectedOptions() {return this.options.filter(o=>o.selected);}
}
const storage = new Map();
const window = {HypothesisNetworkModel:M,APP_CONFIG:{},location:{hostname:'localhost'},dispatchEvent(){},addEventListener(){}};
const sandbox = {window,document:{createElement:t=>new Element(t),querySelectorAll:()=>[],addEventListener(){}},
  localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
  scheduleHypothesisSave(){},Event:class {},AbortController,setTimeout,clearTimeout,
  fetch:async()=>({ok:true,json:async()=>({result:JSON.stringify({edges:[],questions:['何が観察されますか？']})})})};
let source=fs.readFileSync(require.resolve('../JS/hypothesis-network.js'),'utf8');
source=source.replace("  document.addEventListener('DOMContentLoaded'", `  window.test = {
    setup() { ready=true; activeKey=key(); details=el('div'); refinement=el('div'); editorHost=el('div'); review=el('div'); analysis=el('div'); },
    get state(){return state;}, get review(){return review;}, get editor(){return editorHost;}, get refinement(){return refinement;},
    get selected(){return selectedId;}, get activeSession(){return activeSessionId;},
    nodeEditor,beginRefinement,showNode,showRefinement,accept,extract,
    manual(start,end){sourceSelection={id:activeSessionId,start,end};manualCandidate();},
  };
  document.addEventListener('DOMContentLoaded'`);
vm.runInNewContext(source,sandbox);
const T=window.test;T.setup();
function controls() {return T.editor.children[0].children[0].children.filter(v=>v.tagName==='label').map(v=>v.children[0]);}
async function submit() {await T.editor.children[0].children[0].onsubmit({preventDefault(){}});}
(async()=>{
  T.nodeEditor();controls()[0].value='元の仮説';await submit();
  const original=T.state.nodes[0];assert.equal(original.text,'元の仮説');
  T.beginRefinement(original);const session=T.state.sessions[0];
  const memo=T.refinement.children.find(v=>v.tagName==='textarea');memo.value='条件Aなら結果Bになる。';memo.oninput();
  assert.equal(session.text,memo.value);assert(storage.size);
  T.manual(0,memo.value.length);controls()[0].value='条件Aで結果Bを予測する';await submit();
  const candidate=T.state.candidates[0];assert.equal(candidate.status,'pending');assert.equal(candidate.text,'条件Aで結果Bを予測する');
  // A second node gives a choice of multiple connection targets.
  T.state.nodes.push(M.node({id:'parallel',text:'並列の仮説'}));
  T.accept(candidate);const fields=controls();
  fields[7].options.forEach(o=>o.selected=true);fields[8].value='complement';fields[9].value='補足する関係';await submit();
  assert.equal(candidate.status,'accepted');assert.equal(T.state.edges.length,2);
  assert(T.state.edges.every(e=>e.label==='補足する関係'));assert.equal(session.history.find(h=>h.action==='accepted').action,'accepted');
  const count=T.state.nodes.length;T.accept(candidate);assert.equal(T.state.nodes.length,count);
  T.showNode(T.state.nodes.find(v=>v.id==='parallel'));assert.equal(session.text,'条件Aなら結果Bになる。');
  T.showNode(original);T.beginRefinement(original);assert.equal(T.state.sessions.length,2);
  assert.equal(T.state.sessions[0].text,'条件Aなら結果Bになる。');
  T.showNode(T.state.nodes.find(v=>v.id===candidate.nodeId));T.beginRefinement(T.state.nodes.find(v=>v.id===candidate.nodeId));
  assert.equal(T.state.sessions[2].nodeId,candidate.nodeId);
  // Editing a node must leave all previous sessions untouched.
  T.nodeEditor(original);controls()[0].value='元の仮説を修正';await submit();assert.equal(T.state.sessions[0].hypothesisSnapshot,'元の仮説');
  const aiSession = T.state.sessions[2]; aiSession.text='検証対象の予測。';
  sandbox.fetch=async()=>({ok:true,json:async()=>({result:JSON.stringify({candidates:[{sourceId:aiSession.id,sourceText:aiSession.text,text:aiSession.text,hypothesisType:'operational'}]})})});
  await T.extract(aiSession.id);
  const extracted=T.state.candidates.find(c=>c.sourceId===aiSession.id); assert(extracted);assert.equal(extracted.start,0);
  const reject=T.review.children.flatMap(v=>v.children).find(v=>v.textContent==='候補から除外');
  await reject.onclick();assert.equal(extracted.status,'excluded');assert.equal(aiSession.history[0].action,'excluded');
  original.position={x:125,y:-42};
  const restored=M.normalize(JSON.parse(JSON.stringify(window.HypothesisNetwork.snapshot())));
  assert.equal(restored.sessions.length,3);assert.equal(restored.candidates[0].nodeId,candidate.nodeId);
  assert.equal(restored.sessions[0].history.find(h=>h.action==='accepted').action,'accepted');assert.equal(restored.edges[0].label,'補足する関係');
  assert.deepEqual(restored.nodes[0].position,{x:125,y:-42});assert.equal(restored.nodes[0].reviewStatus,'in_progress');
  console.log('hypothesis-workspace: refinement, manual highlight, edit, adoption, multiple links, switching, repeated refinement and JSON restore passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
