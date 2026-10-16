const assert = require('node:assert/strict');
const M = require('../JS/hypothesis-network-model');

const processNode = (nodeId, nodeType, content, relatedKeywords = []) => ({ nodeId, nodeType, content, relatedKeywords });
const bundles = [
  { map: { mapId: 13, title: '研究全体', grainSize: '研究全体', isRoot:true }, childMaps:[{parentNodeId:'h',childMapId:18}], nodes: [
    processNode('q', 'problem_question', 'なぜ涼しい？'),
    processNode('s', 'suggestion', '日陰かもしれない'),
    processNode('r', 'reasoning', 'それなら差があるはず'),
    processNode('i', 'idea_working_hypothesis', '日陰が関係しそう', ['日陰']),
    processNode('h', 'explanatory_hypothesis', '日射が遮られて涼しく感じる', ['日射']),
    processNode('w', 'working_hypothesis', '同じ気温なら木陰の暑さ評価が低い', ['気温']),
  ], edges:[
    {edgeId:'qs',sourceNodeId:'q',targetNodeId:'s',edgeType:'suggestion_generation'},
    {edgeId:'si',sourceNodeId:'s',targetNodeId:'i',edgeType:'selection_retention'},
    {edgeId:'ih',sourceNodeId:'i',targetNodeId:'h',edgeType:'explanation'},
    {edgeId:'hr',sourceNodeId:'h',targetNodeId:'r',edgeType:'reasoning'},
    {edgeId:'rw',sourceNodeId:'r',targetNodeId:'w',edgeType:'operationalization'},
  ] },
  { map: { mapId: 18, title: '日陰の予測', grainSize: '小位' }, nodes: [
    processNode('child-q', 'problem_question', '下位の疑問'),
    processNode('child-h', 'explanatory_hypothesis', '日射が遮られて涼しく感じる', ['日陰']),
    processNode('child-w', 'working_hypothesis', '順番を変えても木陰の暑さ評価が低い'),
  ], edges:[
    {edgeId:'cqh',sourceNodeId:'child-q',targetNodeId:'child-h',edgeType:'explanation'},
    {edgeId:'chw',sourceNodeId:'child-h',targetNodeId:'child-w',edgeType:'directed'},
  ] },
];
const original = M.normalize({ nodes: [M.node({ id: 'manual', text: '既存の仮説' })], conversations: [{ text: '保存済みメモ' }] });
const imported = M.mergeProcessHypotheses(original, bundles);
assert.equal(original.nodes.length, 1);
assert.equal(imported.added, 3);
assert.equal(imported.graph.nodes.length, 5);
assert.equal(imported.graph.edges.length, 3);
assert.deepEqual(imported.graph.conversations, original.conversations);
const explanation = imported.graph.nodes.find(n => n.hypothesisType === 'explanatory');
assert.equal(explanation.processSources.length, 2);
assert.deepEqual(explanation.keywordLabels, ['日射', '日陰']);
assert(!imported.graph.nodes.some(n => n.hypothesisType === 'idea'));
assert(imported.graph.nodes.some(n => n.hypothesisType === 'working'));
const theme=imported.graph.nodes.find(n=>n.nodeKind==='theme');assert.equal(theme.text,'研究全体');
assert(imported.graph.edges.some(e=>e.sourceNodeId===theme.id&&e.targetNodeId===explanation.id));
const prediction=imported.graph.nodes.find(n=>n.text==='同じ気温なら木陰の暑さ評価が低い');
const link=imported.graph.edges.find(e=>e.sourceNodeId===explanation.id&&e.targetNodeId===prediction.id);
assert.deepEqual(link.processPaths[0].edges.map(e=>e.edgeId),['hr','rw']);
assert.equal(link.relationType,'operationalization');assert.equal(link.label,'操作化');assert.equal(link.explanation,'それなら差があるはず');
assert(!imported.graph.edges.some(e=>e.sourceNodeId===e.targetNodeId));
const direct=imported.graph.edges.find(e=>e.relationType==='directed');assert.equal(direct.label,'');
assert.equal(M.normalize(JSON.parse(JSON.stringify(imported.graph))).edges.find(e=>e.id===direct.id).label,'');

// Stable source IDs retain the learner's edits even if the source changes later.
explanation.text = '構造化画面で修正した説明';
explanation.hypothesisType = 'unclassified';
link.label='学習者が整理した関係';
const updatedSource = JSON.parse(JSON.stringify(bundles));
updatedSource[0].nodes.find(n => n.nodeId === 'h').content = 'プロセス側の更新';
const repeated = M.mergeProcessHypotheses(M.normalize(JSON.parse(JSON.stringify(imported.graph))), updatedSource);
assert.equal(repeated.added, 0);
assert.equal(repeated.graph.nodes.find(n => n.id === explanation.id).text, explanation.text);
assert.equal(repeated.graph.nodes.find(n => n.id === explanation.id).hypothesisType, 'unclassified');
assert.equal(repeated.graph.nodes.find(n => n.id === explanation.id).processSources.length, 2);
assert.equal(repeated.graph.edges.length,imported.graph.edges.length);
assert.equal(repeated.graph.edges.find(e=>e.id===link.id).label,'学習者が整理した関係');
assert.equal(repeated.graph.nodes.filter(n=>n.nodeKind==='theme').length,1);

// Migration removes earlier untouched imported ideas, retaining manual nodes and notes.
const oldImport=M.normalize({nodes:[...original.nodes,M.node({text:'日陰が関係しそう',sourceText:'日陰が関係しそう',hypothesisType:'idea',processSources:[{mapId:'13',nodeId:'i'}]})]});
assert(!M.mergeProcessHypotheses(oldImport,bundles).graph.nodes.some(n=>n.hypothesisType==='idea'));

const distinct = M.mergeProcessHypotheses(original, [{ map: { mapId: 20 }, nodes: [
  processNode('a', 'working_hypothesis', '条件Aで涼しい'),
  processNode('b', 'working_hypothesis', '条件Bで涼しい'),
  processNode('c', 'explanatory_hypothesis', '条件Aで涼しい'),
] }]);
assert.equal(distinct.added, 3);
const cycle=M.mergeProcessHypotheses({},[{map:{mapId:1,title:'循環のある探究'},nodes:[
  processNode('a','explanatory_hypothesis','説明A'),processNode('r','reasoning','推論'),processNode('b','working_hypothesis','予測B'),
],edges:[
  {edgeId:'ar',sourceNodeId:'a',targetNodeId:'r',edgeType:'reasoning'},
  {edgeId:'ra',sourceNodeId:'r',targetNodeId:'a',edgeType:'revision'},
  {edgeId:'rb',sourceNodeId:'r',targetNodeId:'b',edgeType:'operationalization'},
  {edgeId:'ba',sourceNodeId:'b',targetNodeId:'a',edgeType:'revision',label:'見直す'},
]}]);
assert.equal(cycle.graph.edges.length,3);
assert(cycle.graph.edges.some(e=>e.label==='見直す'));
const parentHypothesis=M.mergeProcessHypotheses({},[
  {map:{mapId:1,title:'探究テーマ'},nodes:[processNode('h','explanatory_hypothesis','上位の説明')],childMaps:[{parentNodeId:'h',childMapId:2}]},
  {map:{mapId:2},nodes:[processNode('h2','explanatory_hypothesis','下位の説明')]},
]);
assert(parentHypothesis.graph.edges.some(e=>e.relationType==='hierarchy'&&e.label==='下位'));
console.log('process-hypothesis-import: theme parent, hypothesis-only extraction, original paths/links, hierarchy, duplicate removal and learner edit retention passed');
