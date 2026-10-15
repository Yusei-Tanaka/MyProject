const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const host=()=>({append(child){child.parentElement=this;this.child=child;}});
const processHost=host(),structureHost=host(),drawer={open:false};
const shared={parentElement:processHost,open:false,textarea:{value:'編集中の発散記述'},listener:{}};
let opened=0;
const context={window:{openProcessWorkspace(){opened++;}},document:{getElementById:id=>id==='hypothesisWorkspaceDrawer'?drawer:processHost},
 structuringScamperHost:structureHost,legacySupport:shared};
const source=fs.readFileSync(require.resolve('../JS/hypothesis-network.js'),'utf8');
vm.createContext(context);vm.runInContext(source.slice(source.indexOf('  function syncScamperWorkspace'),source.indexOf('  function openProcessSupport')),context);
drawer.open=true;context.syncScamperWorkspace();assert.strictEqual(shared.parentElement,structureHost);
shared.textarea.value='構造化側で追記';drawer.open=false;context.syncScamperWorkspace();assert.strictEqual(shared.parentElement,processHost);assert.equal(shared.textarea.value,'構造化側で追記');
context.window.openScamperWorkspace();assert.equal(opened,1);assert.equal(shared.open,true);
drawer.open=true;context.window.openScamperWorkspace();assert.equal(opened,1);assert.strictEqual(shared.parentElement,structureHost);
// Reopening SCAMPER for a graph node reuses its source entry, including its existing tags.
const entries=[];let added=0,menus=0;
Object.assign(context,{ensureHypothesisContainer:()=>({querySelector:()=>({querySelectorAll:()=>entries})}),
 addHypothesisEntry(ids,options){added++;const textarea={value:options.hypothesisText};const entry={dataset:{hypothesisEntryId:options.entryId||'entry-1'},tags:['既存のSCAMPER案'],scrollIntoView(){},querySelector:selector=>selector==='textarea.hypothesis-text'?textarea:{}};entries.push(entry);return entry;},
 scheduleHypothesisSave(){},updateHypothesisContextFromEntry(){},createScamperMenu(){menus++;}});
const legacy=fs.readFileSync(require.resolve('../JS/hypothesis.js'),'utf8');
vm.runInContext(legacy.slice(legacy.indexOf('window.startStructuringScamper ='),legacy.indexOf('// 表示されている仮説の番号を更新')),context);
const node={id:'graph-node',text:'元の仮説',keywordNodeIds:['7'],keywordLabels:['関連語']};
const entry=context.window.startStructuringScamper(node);entry.querySelector('textarea.hypothesis-text').value='編集中';
const again=context.window.startStructuringScamper({...node,text:'修正した仮説'});
assert.strictEqual(entry,again);assert.equal(added,1);assert.equal(menus,2);assert.deepEqual(again.tags,['既存のSCAMPER案']);assert.equal(again.querySelector('textarea.hypothesis-text').value,'修正した仮説');
console.log('shared-scamper: identical editor across workspaces, draft retention, no duplicate entries and linked hypothesis updates passed');
