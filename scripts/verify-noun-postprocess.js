const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../JS/word-analyze.js'), 'utf8');
const tokens = [{surface_form:'街路',pos:'名詞',pos_detail_1:'一般',word_position:1}, {surface_form:'樹',pos:'名詞',pos_detail_1:'接尾',word_position:3}];
function setup(fetch) {
    const output = {textContent:'',dataset:{},removeAttribute(name){delete this[name];}};
    const input = {value:'',addEventListener(name,fn){this[name]=fn;}};
    const context = {window:{location:{hostname:'localhost'}},document:{documentElement:{getAttribute:()=> 'ja'},getElementById:id=>id==='output'?output:input},
        localStorage:{getItem:()=>null},kuromoji:{builder:()=>({build:fn=>fn(null,{tokenize:()=>tokens})})},fetch,AbortController,setTimeout,clearTimeout,console:{warn(){},error(){}}};
    vm.createContext(context);vm.runInContext(source,context);
    return {context,output,input};
}
(async () => {
    let calls=0;
    const good = setup(async (url, options) => {
        calls++;assert.equal(url,'http://localhost:8000/api/noun-phrases');
        assert.equal(JSON.parse(options.body).tokens[1].surface_form,'樹');
        return {ok:true,json:async()=>({spans:[{start:0,end:2}]})};
    });
    const mapped=[];good.context.window.addAnalyzedKeywordsToMap=async (nouns,isCurrent)=>{if(isCurrent()) mapped.push(...nouns);};
    await good.context.analyzeText('街路樹');assert.equal(good.output.textContent,'街路樹');assert.equal(good.output.dataset.analysisMode,'api');assert.deepEqual(mapped,['街路樹']);
    await good.context.analyzeText('街路樹');assert.equal(calls,1);
    const bad = setup(async()=>({ok:false,status:502}));
    await bad.context.analyzeText('街路樹');assert.equal(bad.output.textContent,'街路樹');assert.equal(bad.output.dataset.analysisMode,'local');
    const malformed = setup(async()=>({ok:true,json:async()=>({spans:[{start:0,end:99}]})}));
    await malformed.context.analyzeText('街路樹');assert.equal(malformed.output.dataset.analysisMode,'local');
    const empty = setup(async()=>({ok:true,json:async()=>({spans:[]})}));
    await empty.context.analyzeText('街路樹');assert.equal(empty.output.textContent,'名詞は見つかりませんでした。');
    let resolve;
    const stale=setup(()=>new Promise(done=>{resolve=done;}));
    stale.context.window.onload();
    const pending=stale.context.analyzeText('街路樹');
    await new Promise(done=>setImmediate(done));
    stale.input.value='';stale.input.input();
    resolve({ok:true,json:async()=>({spans:[{start:0,end:2}]})});
    await pending;assert.equal(stale.output.textContent,'テキストが入力されていません。');
    console.log('noun-postprocess: API payload, cache, fallback, invalid spans, empty result and stale response protection passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
