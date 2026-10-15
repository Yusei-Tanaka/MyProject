const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../JS/network.js'), 'utf8');
const block = source.slice(source.indexOf('let conceptMapRestorePromise'), source.indexOf('// ここにAPI呼び出しのコード'));
function setup(restore = async () => true) {
    const items = [];
    let ready, fits = 0;
    const context = {window:{},document:{addEventListener:(name,fn)=>{ready=fn;}},
        nodes:{getIds:()=>items.map(n=>n.id),get:()=>items,add:node=>items.push(node)},
        restoreUserConceptMap:restore,normalizeKeywordSurface:label=>label.toLowerCase(),
        getCurrentThemeName:()=> 'theme',findExistingNodeByLabel:async label=>items.find(n=>n.label.toLowerCase()===label.toLowerCase()),
        getNonOverlappingNodePosition:()=>({x:items.length*150,y:0}),getNextNumericNodeId:()=>items.length+1,
        requestAnimationFrame:fn=>fn(),redistributeKeywordMap:()=>fits++,logAction(){},console};
    vm.createContext(context);vm.runInContext(block,context);ready();
    return {items,add:context.window.addAnalyzedKeywordsToMap,get fits(){return fits;}};
}
(async () => {
    const fresh=setup();
    await fresh.add(['Alpha','Beta','alpha']);
    assert.deepEqual(fresh.items.map(n=>n.label),['Alpha','Beta']);assert.equal(fresh.fits,1);
    fresh.items.pop();await fresh.add(['Beta']);assert.equal(fresh.items.length,1); // Respect manual deletion.
    let resolve;
    const restored=setup(()=>new Promise(done=>{resolve=done;}));
    const pending=restored.add(['Alpha','Beta']);
    await new Promise(done=>setImmediate(done));assert.equal(restored.items.length,0);
    const original={id:20,label:'Alpha',x:400,y:300};restored.items.push(original);resolve(true);await pending;
    assert.strictEqual(restored.items[0],original);assert.equal(restored.items.length,2);assert.equal(restored.fits,0);
    const stale=setup();let current=true;
    const staleTask=stale.add(['Alpha'],()=>current);current=false;await staleTask;assert.equal(stale.items.length,0);
    const failed=setup(async()=>false);await failed.add(['Alpha']);assert.equal(failed.items.length,0);
    const concurrent=setup();await Promise.all([concurrent.add(['Alpha']),concurrent.add(['Alpha','Beta'])]);assert.equal(concurrent.items.length,2);
    console.log('initial-keywords: restore ordering, preserved nodes, deduplication, manual deletion, stale analysis and restore failure passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
