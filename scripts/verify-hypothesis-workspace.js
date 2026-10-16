// Exercise the production workspace controller in a minimal DOM, without a DB or paid AI calls.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const M = require('../JS/hypothesis-network-model');
class Element {
  constructor(tag) { this.tagName=tag; this.children=[]; this.dataset={}; this.value=''; this.hidden=false; this.options=[]; this.classList={add(){},remove(){}}; }
  append(...items) { for(const item of items) { if(item.parentElement) item.remove(); item.parentElement=this; this.children.push(item); } if(this.tagName==='select') this.options=this.children; }
  replaceChildren(...items) { this.children.forEach(c=>c.parentElement=null); this.children=[]; this.append(...items); }
  remove() { if(this.parentElement) this.parentElement.children=this.parentElement.children.filter(c=>c!==this); this.parentElement=null; }
  setAttribute() {}
  get selectedOptions() {return this.options.filter(o=>o.selected);}
}
const storage = new Map();
const drawer = {open:false};
const hypothesisSupport={open:false};
const processSupport = {open:false,scrollIntoView(){}};
const window = {HypothesisNetworkModel:M,APP_CONFIG:{},location:{hostname:'localhost'},dispatchEvent(){},addEventListener(){}};
const sandbox = {window,document:{createElement:t=>new Element(t),querySelectorAll:()=>[],getElementById:id=>id==='hypothesisWorkspaceDrawer' ? drawer : id==='hypothesisSupportDrawer' ? hypothesisSupport : id==='processThinkingSupport' ? processSupport : null,addEventListener(){}},
  localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
  scheduleHypothesisSave(){},Event:class {},AbortController,setTimeout,clearTimeout,
  fetch:async()=>({ok:true,json:async()=>({result:JSON.stringify({edges:[],questions:['何が観察されますか？']})})})};
let source=fs.readFileSync(require.resolve('../JS/hypothesis-network.js'),'utf8');
source=source.replace("  document.addEventListener('DOMContentLoaded'", `  window.test = {
    setup() { ready=true; activeKey=key(); details=el('div'); refinement=el('div'); editorHost=el('div'); review=el('div'); analysis=el('div'); deleteButton=el('button'); undoDeleteButton=el('button'); addEdgeButton=el('button'); editEdgeButton=el('button'); edgeType=el('select'); edgeType.value='directed'; updateDeleteActions(); },
    get details(){return details;}, get state(){return state;}, get review(){return review;}, get editor(){return editorHost;}, get refinement(){return refinement;},
    get selected(){return selectedId;}, get activeSession(){return activeSessionId;},
    get deleteButton(){return deleteButton;}, get undoDeleteButton(){return undoDeleteButton;}, get editEdgeButton(){return editEdgeButton;},
    get linkSource(){return linkSourceNodeId;}, get selectedEdge(){return selectedEdgeId;}, get edgeType(){return edgeType;}, get network(){return network;},
    mountGraph(){canvas=el('div');canvas.clientWidth=800;canvas.clientHeight=600;renderGraph();},
    nodeEditor,edgeEditor,beginRefinement,showNode,showEdge,clearNodeSelection,removeNode,undoDeletion,showRefinement,accept,extract,addFromEntry,
    beginLinkMode,cancelLinkMode,handleGraphClick,deleteSelection,
    resetRestore(){ready=false;state=M.normalize();deletions.length=0;localStorage.removeItem(key());},
    manual(start,end){sourceSelection={id:activeSessionId,start,end};manualCandidate();},
  };
  document.addEventListener('DOMContentLoaded'`);
vm.runInNewContext(source,sandbox);
const T=window.test;T.setup();
function controls() {return T.editor.children[0].children[0].children.filter(v=>v.tagName==='label').map(v=>v.children[0]);}
async function submit() {await T.editor.children[0].children[0].onsubmit({preventDefault(){}});}
(async()=>{
  T.nodeEditor();controls()[0].value='元の仮説';await submit();
  assert.equal(drawer.open,true);
  const original=T.state.nodes[0];assert.equal(original.text,'元の仮説');
  original.keywordNodeIds=['7'];original.keywordLabels=['元のキーワード'];
  T.beginRefinement(original);const session=T.state.sessions[0];
  assert.equal(drawer.open,true);assert.equal(processSupport.open,true);
  const memo=T.refinement.children.find(v=>v.tagName==='textarea');memo.value='条件Aなら結果Bになる。';memo.oninput();
  assert.equal(session.text,memo.value);assert(storage.size);
  T.manual(0,memo.value.length);controls()[0].value='条件Aで結果Bを予測する';await submit();
  const candidate=T.state.candidates[0];assert.equal(candidate.status,'pending');assert.equal(candidate.text,'条件Aで結果Bを予測する');
  // A second node gives a choice of multiple connection targets.
  T.state.nodes.push(M.node({id:'parallel',text:'並列の仮説'}));
  T.accept(candidate);const fields=controls();
  fields[7].options.forEach(o=>o.selected=true);fields[8].value='complement';fields[9].value='補足する関係';await submit();
  assert.equal(candidate.status,'accepted');assert.equal(T.state.edges.length,2);
  assert.deepEqual(Array.from(T.state.nodes.find(n=>n.id===candidate.nodeId).keywordNodeIds),['7']);
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
  // A visible selection action deletes only the selected node and its connected links.
  const adopted = T.state.nodes.find(n=>n.id===candidate.nodeId);
  adopted.position={x:310,y:240};
  T.state.linkCandidates.push({...M.edge({sourceNodeId:original.id,targetNodeId:adopted.id}),status:'pending'});
  const priorEdges=JSON.stringify(T.state.edges), priorCandidateLinks=JSON.stringify(T.state.linkCandidates);
  const priorSessions=JSON.stringify(T.state.sessions), priorCount=T.state.nodes.length;
  T.showNode(adopted);assert.equal(T.deleteButton.disabled,false);
  T.removeNode(adopted);
  assert.equal(T.state.nodes.length,priorCount-1);assert.equal(T.deleteButton.disabled,true);assert.equal(T.undoDeleteButton.disabled,false);
  assert(!T.state.edges.some(e=>[e.sourceNodeId,e.targetNodeId].includes(adopted.id)));
  assert(!T.state.linkCandidates.some(e=>[e.sourceNodeId,e.targetNodeId].includes(adopted.id)));
  assert.equal(candidate.status,'pending');assert.equal(candidate.nodeId,undefined);
  assert.equal(JSON.stringify(T.state.sessions),priorSessions);
  const deletionDraft=JSON.parse(storage.get([...storage.keys()].find(k=>k.includes('hypothesis-network-draft'))));
  assert(!deletionDraft.nodes.some(n=>n.id===adopted.id));
  T.undoDeletion();
  assert.equal(T.state.nodes.length,priorCount);assert.equal(JSON.stringify(T.state.edges),priorEdges);
  assert.equal(JSON.stringify(T.state.linkCandidates),priorCandidateLinks);
  assert.equal(candidate.status,'accepted');assert.equal(candidate.nodeId,adopted.id);
  assert.deepEqual(JSON.parse(JSON.stringify(T.state.nodes.find(n=>n.id===adopted.id).position)),{x:310,y:240});
  assert.equal(T.undoDeleteButton.disabled,true);assert.equal(T.deleteButton.disabled,false);
  T.showEdge(T.state.edges[0]);assert.equal(T.selected,null);assert.equal(T.deleteButton.disabled,false);assert.equal(T.editEdgeButton.disabled,false);
  T.showNode(original);T.clearNodeSelection();assert.equal(T.deleteButton.disabled,true);
  // Use the actual graph click handler: the process map's source/target workflow.
  class DataSet {
    constructor(items){this.items=new Map();this.update(items);}
    update(items){items.forEach(item=>this.items.set(item.id,{...this.items.get(item.id),...item}));}
    getIds(){return [...this.items.keys()];}
    remove(ids){ids.forEach(id=>this.items.delete(id));}
  }
  class Network {
    constructor(element,data,options){this.data=data;this.options=options;this.events={};this.selected=[];}
    on(name,handler){this.events[name]=handler;}
    unselectAll(){this.selected=[];this.edgeSelection=[];}
    getSelectedNodes(){return this.selected;}
    selectNodes(ids){this.selected=ids;}
    selectEdges(ids){this.selected=[];this.edgeSelection=ids;}
    getPositions(){return Object.fromEntries([...this.data.nodes.items].map(([id,n])=>[id,{x:n.x,y:n.y}]));}
    setSize(){} redraw(){} fit(){} getScale(){return 1;}
  }
  sandbox.vis=window.vis={DataSet,Network};sandbox.requestAnimationFrame=fn=>fn();
  T.mountGraph();assert.equal(T.network.options.interaction.multiselect,true);
  const click=nodes=>T.network.events.click({nodes,edges:[]});
  const beforeLinks=T.state.edges.length;
  T.beginLinkMode();assert.equal(T.linkSource,'');
  click([original.id]);assert.equal(T.linkSource,original.id);
  click([original.id]);assert.equal(T.state.edges.length,beforeLinks); // No self-link.
  click(['parallel']);assert.equal(T.linkSource,null);assert.equal(T.state.edges.length,beforeLinks+1);
  const manualEdge=T.state.edges.at(-1);
  assert.equal(manualEdge.sourceNodeId,original.id);assert.equal(manualEdge.targetNodeId,'parallel');
  assert.equal(manualEdge.label,'');assert.equal(T.selectedEdge,manualEdge.id);
  T.network.selectNodes([original.id]);T.beginLinkMode();click(['parallel']);
  assert.equal(T.state.edges.length,beforeLinks+1); // The same link is rejected.
  T.network.events.click({nodes:[],edges:[manualEdge.id]});
  assert.equal(T.selectedEdge,manualEdge.id);assert.equal(T.deleteButton.disabled,false);
  T.edgeEditor(manualEdge);controls()[2].value='complement';controls()[3].value='確かめる関係';controls()[4].value='理由のメモ';await submit();
  assert.equal(manualEdge.label,'確かめる関係');assert.equal(manualEdge.explanation,'理由のメモ');
  assert.equal(T.selectedEdge,manualEdge.id);
  const nodeCount=T.state.nodes.length;
  T.deleteSelection();assert.equal(T.state.edges.length,beforeLinks);assert.equal(T.state.nodes.length,nodeCount);
  assert(!window.HypothesisNetwork.snapshot().edges.some(e=>e.id===manualEdge.id));
  T.undoDeletion();assert.equal(T.state.edges.length,beforeLinks+1);assert.equal(T.state.edges.at(-1).label,'確かめる関係');
  T.deleteSelection(); // Leave only the original edges.
  T.network.selectNodes([original.id]);T.beginLinkMode();assert.equal(T.linkSource,original.id);
  T.cancelLinkMode();click(['parallel']);assert.equal(T.state.edges.length,beforeLinks);
  T.edgeType.value='alternative';T.network.selectNodes(['parallel',original.id]);T.beginLinkMode();
  const reverse=T.state.edges.at(-1);assert.equal(reverse.sourceNodeId,'parallel');assert.equal(reverse.targetNodeId,original.id);
  assert.equal(reverse.relationType,'alternative');T.deleteSelection();T.edgeType.value='directed';
  // Node deletion and its connected links still undo after a link-only deletion.
  T.showNode(original);T.deleteSelection();assert(!T.state.nodes.some(n=>n.id===original.id));
  T.undoDeletion();assert(T.state.nodes.some(n=>n.id===original.id));
  // A process question is a source for divergence until the learner registers it as a hypothesis.
  const processTextarea={value:'発散元の疑問',dataset:{}};
  const processEntry={dataset:{processNodeId:'process-source',hypothesisEntryId:'process-entry'},querySelector:()=>processTextarea};
  const before=T.state.nodes.length;
  T.addFromEntry(processEntry,processTextarea,false);assert.equal(T.state.nodes.length,before);
  const unrelatedEntry={dataset:{hypothesisEntryId:'unrelated'},querySelector:()=>processTextarea};
  T.addFromEntry(unrelatedEntry,processTextarea,false);assert.equal(T.state.nodes.length,before);
  T.addFromEntry(processEntry,processTextarea,true);assert.equal(T.state.nodes.length,before+1);assert.equal(drawer.open,true);
  processTextarea.value='明示的に整理した仮説を修正';
  T.addFromEntry(processEntry,processTextarea,false);assert.equal(T.state.nodes.length,before+1);
  assert.equal(T.state.nodes.at(-1).text,processTextarea.value);
  let selected;
  window.nodes={get:()=>[{id:7,label:'変更後のキーワード'}]};
  window.setSelectedNodes=ids=>{selected=ids;};window.network={fit(){}};
  const linkedTextarea={value:'キーワード由来の仮説',dataset:{}};
  const linkedEntry={dataset:{hypothesisEntryId:'linked-entry',basedNodeIds:'[7]',basedKeywordLabels:'["元のキーワード"]'},querySelector:()=>linkedTextarea};
  const linked=T.addFromEntry(linkedEntry,linkedTextarea);
  assert.deepEqual(Array.from(linked.keywordNodeIds),['7']);assert.equal(linked.context,'');
  const context=T.details.children.find(e=>e.className==='hn-keyword-context');
  assert(context.children.some(e=>e.textContent==='変更後のキーワード'));
  await context.children.find(e=>e.tagName==='button').onclick();assert.deepEqual(Array.from(selected),[7]);assert.equal(drawer.open,false);
  T.beginRefinement(linked);assert(T.refinement.children.some(e=>e.className==='hn-keyword-context'));
  const snapshot=M.normalize(JSON.parse(JSON.stringify(window.HypothesisNetwork.snapshot())));
  assert.deepEqual(snapshot.nodes.find(n=>n.id===linked.id).keywordNodeIds,['7']);
  window.nodes={get:()=>[]};T.showNode(linked);
  const missing=T.details.children.find(e=>e.className==='hn-keyword-context');
  assert(missing.children.some(e=>e.textContent==='元のキーワード'));assert(!missing.children.some(e=>e.tagName==='button'));
  // The production controller reads all child grains and preserves the active scope.
  sandbox.requestAnimationFrame = fn => fn();
  storage.set('userName', 'project'); storage.set('searchTitle', '暑さ'); T.setup();
  const rootBundle = { map: { mapId: 13, title: '研究全体' }, hierarchy: [{ mapId: 13 }, { mapId: 18 }],
    nodes: [{ nodeId: 'process-h', nodeType: 'explanatory_hypothesis', content: '日射が遮られて涼しい', relatedKeywords: ['日陰'] }] };
  const childBundle = { map: { mapId: 18, title: '小位の検討' },
    nodes: [{ nodeId: 'process-w', nodeType: 'working_hypothesis', content: '順番を変えても木陰が涼しい' }] };
  const requests = [];
  sandbox.fetch = async url => { requests.push(url); return { ok: true, json: async () => url.includes('/root?') ? rootBundle : childBundle }; };
  assert.equal(await window.HypothesisNetwork.importProcessHypotheses(), 2);
  assert(requests.some(url => url.includes('/process-maps/18?userId=project')));
  assert(requests[0].includes('language=ja'));
  assert.equal(await window.HypothesisNetwork.importProcessHypotheses(), 0);
  const importedSnapshot = JSON.stringify(T.state);
  sandbox.fetch = async url => url.includes('/root?') ? { ok: true, json: async () => rootBundle } : { ok: false, status: 500 };
  await assert.rejects(window.HypothesisNetwork.importProcessHypotheses(), /HTTP 500/);
  assert.equal(JSON.stringify(T.state), importedSnapshot);
  sandbox.fetch = async url => ({ ok: true, json: async () => {
    if (url.includes('/root?')) { storage.set('searchTitle', '別のテーマ'); return rootBundle; }
    return childBundle;
  } });
  await assert.rejects(window.HypothesisNetwork.importProcessHypotheses(), /テーマまたは言語/);
  assert.equal(JSON.stringify(T.state), importedSnapshot);
  storage.set('searchTitle', '暑さ');
  const themeNode=T.state.nodes.find(n=>n.nodeKind==='theme');
  T.showNode(themeNode);assert.equal(T.deleteButton.disabled,true);
  const themeCount=T.state.nodes.length;T.removeNode(themeNode);assert.equal(T.state.nodes.length,themeCount);
  // Loading an empty structure never brings in legacy-map text automatically.
  T.resetRestore();window.getMindmapNodes=()=>[{key:'1',text:'プロセスにない旧マップの記述'}];
  window.HypothesisNetwork.restore({nodes:[]});assert.equal(T.state.nodes.length,0);
  console.log('hypothesis-workspace: process-style link creation, selection deletion/undo, persistence, source restrictions, process hierarchy and scope checks passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
