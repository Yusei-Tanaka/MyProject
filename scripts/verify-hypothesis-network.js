const assert = require('node:assert/strict');
const M = require('../JS/hypothesis-network-model');
const nodes = ['a','b','c','d'].map((id,i) => M.node({id,text:id,hypothesisType:i === 3 ? 'operational' : 'explanatory'}));
const graph = M.normalize({nodes,edges:[]});
for (const [from,to] of [['a','b'],['a','c'],['b','d'],['c','d']]) {
  const edge = M.edge({sourceNodeId:from,targetNodeId:to,relationType:'decomposition'});
  assert.equal(M.validateEdge(graph,edge),''); graph.edges.push(edge);
}
assert.equal(M.analyze(graph).branches[0],'a');
assert.equal(M.analyze(graph).integrations[0],'d');
assert.match(M.validateEdge(graph,M.edge({sourceNodeId:'d',targetNodeId:'a'})),/循環/);
assert.equal(M.validateEdge(graph,M.edge({sourceNodeId:'d',targetNodeId:'a'}),true),'');
assert.match(M.validateEdge(graph,{sourceNodeId:'a',targetNodeId:'z'}),/両端/);
assert.match(M.validateEdge(graph,{sourceNodeId:'a',targetNodeId:'a'}),/同じ仮説/);
assert.match(M.validateEdge(graph,M.edge({sourceNodeId:'a',targetNodeId:'b',relationType:'decomposition'})),/既に/);
const reverseTypes = M.normalize({nodes:[M.node({id:'o',text:'検証',hypothesisType:'operational'}),M.node({id:'e',text:'説明',hypothesisType:'explanatory'})]});
assert.equal(M.validateEdge(reverseTypes,M.edge({sourceNodeId:'o',targetNodeId:'e'})),'');
for (const from of Object.keys(M.types)) for (const to of Object.keys(M.types)) {
  assert.equal(M.validateEdge({nodes:[M.node({id:'1',text:'a',hypothesisType:from}),M.node({id:'2',text:'b',hypothesisType:to})],edges:[]},M.edge({sourceNodeId:'1',targetNodeId:'2'})),'');
}
const extended = M.edge({sourceNodeId:'a',targetNodeId:'b',relationType:'integration',confidence:2});
assert.equal(extended.label,'integration'); assert.equal(extended.confidence,1);
assert.equal(M.normalize({nodes,edges:[extended]}).edges[0].relationType,'integration');
const source = {id:'s',text:'😀根拠。製造コストが普及を妨げる。疑問？',conversationId:'chat'};
const candidate = M.candidate({sourceText:'製造コストが普及を妨げる。',text:'製造コストが普及を妨げる。',start:999},source);
assert.equal(candidate.start,5); assert.equal(candidate.status,'pending'); assert.equal(candidate.sourceConversationId,'chat');
assert.equal(M.candidate({sourceText:'元文章にない主張'},source),null);
assert.equal(M.segments(source.text,[candidate]).filter(s => s.candidates.length).map(s=>s.text).join(''),candidate.sourceText);
assert.equal(M.segments(source.text,[{...candidate,status:'excluded'}]).some(s=>s.candidates.length),false);
assert.equal(M.segments('変更された元文章',[candidate]).some(s=>s.candidates.length),false);
const overlap = {...candidate,id:'other',start:candidate.start+2,end:candidate.end-2};
assert(M.segments(source.text,[candidate,overlap]).some(s=>s.candidates.length===2));
assert.equal(M.normalize(JSON.parse(JSON.stringify({...graph,candidates:[candidate]}))).candidates[0].sourceSnapshot,source.text);
assert.equal(M.normalize({nodes,edges:[M.edge({sourceNodeId:'unknown',targetNodeId:'a'})]}).edges.length,0);
assert(M.analyze(graph).guidance.some(g=>g.relationType==='operationalization'));
assert(!M.analyze(graph).guidance.some(g=>g.relationType==='decomposition'));
assert.equal(M.analyze(M.normalize()).guidance.length,0);
// Exercise the real server merge/normalization functions without starting DB listeners.
const fs = require('node:fs'), vm = require('node:vm');
const server = fs.readFileSync(require.resolve('../JS/server.js'),'utf8');
const begin = server.indexOf('const toObjectOrEmpty =');
const end = server.indexOf('const buildHypothesisNodeSignature =');
assert(begin >= 0 && end > begin);
const sandbox = {hypothesisNetworkModel:M};
vm.runInNewContext(server.slice(begin,end)+'\nthis.merge = mergeThemeContent;',sandbox);
const existing = {hypothesis:{html:'old',nodes:[{id:'legacy',text:'memo'}],network:{...graph,candidates:[candidate]}},mindmap:{modelJson:'tree'},keywordNodes:[{id:1,label:'keyword'}]};
const merged = sandbox.merge(existing,{hypothesis:{mapNodes:[{text:'旧マップ',source:'mindmap'}]},mindmap:{modelJson:'edited tree'}});
assert.equal(merged.hypothesis.network.edges.length,4);
assert.equal(merged.hypothesis.network.candidates[0].status,'pending');
const next = sandbox.merge(merged,{hypothesis:{html:'new',nodes:[{text:'new memo'}],network:{...graph,edges:[]}}});
assert.equal(next.mindmap.modelJson,'edited tree'); assert.equal(next.keywordNodes[0].label,'keyword');
assert.equal(next.hypothesis.network.edges.length,0); assert.equal(next.hypothesis.mapNodes[0].text,'旧マップ');
console.log('hypothesis-network: model, graph, highlights, persistence and legacy merge checks passed');
