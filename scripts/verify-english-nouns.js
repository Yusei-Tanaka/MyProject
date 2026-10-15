const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const nlp = require('../JS/vendor/compromise.js');
const text = 'How do street trees affect thermal comfort and quality of sleep?';
const expected = ['street trees', 'thermal comfort', 'quality of sleep'];
const output = {textContent:'',dataset:{},removeAttribute(name){delete this[name];}};
const button = {};
let calls=0, payload, fail=false;
const items=[];
const context = {
    window:{nlp,location:{hostname:'localhost'}},
    document:{documentElement:{getAttribute:()=> 'en'},getElementById:id=>id==='output'?output:button,addEventListener:(name,fn)=>fn()},
    AbortController,setTimeout,clearTimeout,console:{warn(){},error:console.error},
    fetch:async (url, options) => {
        calls++;payload=JSON.parse(options.body);
        assert.equal(payload.text,text);assert.equal(payload.language,'en');
        assert(payload.tokens.some(t=>t.surface_form==='affect')); // Context includes non-nouns too.
        if (fail) return {ok:false,status:502};
        const spans=expected.map(phrase=>{
            const words=phrase.split(' ');
            const start=payload.tokens.findIndex(token=>token.surface_form===words[0]);
            return {start,end:start+words.length};
        });
        return {ok:true,json:async()=>({spans})};
    },
    nodes:{getIds:()=>items.map(n=>n.id),get:()=>items,add:node=>items.push(node)},
    restoreUserConceptMap:async()=>true,normalizeKeywordSurface:label=>label.toLowerCase(),
    getCurrentThemeName:()=>text,findExistingNodeByLabel:async label=>items.find(n=>n.label===label),
    getNonOverlappingNodePosition:()=>({x:items.length*150,y:0}),getNextNumericNodeId:()=>items.length+1,
    requestAnimationFrame:fn=>fn(),setReadableKeywordView(){},logAction(){}
};
vm.createContext(context);
vm.runInContext(fs.readFileSync(require.resolve('../JS/word-analyze.js'),'utf8'),context);
const network=fs.readFileSync(require.resolve('../JS/network.js'),'utf8');
vm.runInContext(network.slice(network.indexOf('let conceptMapRestorePromise'),network.indexOf('// ここにAPI呼び出しのコード')),context);
(async()=>{
    await context.analyzeText(text);
    assert.equal(output.dataset.analysisMode,'api');
    assert.equal(output.textContent,expected.join(', '));
    assert.deepEqual(items.map(n=>n.label),expected);
    assert.equal(button.disabled,false);
    await context.analyzeText(text);assert.equal(calls,1);assert.equal(items.length,3);
    fail=true;vm.runInContext('nounPostprocessCache.clear()',context);
    await context.analyzeText(text);assert.equal(output.dataset.analysisMode,'local');assert(output.textContent.includes('trees'));
    const punctuation='How does CO2 affect students’ sleep-quality in New York?';
    const tokens=context.tokenizeEnglishTheme(punctuation);
    let cursor=0;
    for(const token of tokens){const start=punctuation.indexOf(token.surface_form,cursor);assert.equal(punctuation.slice(cursor,start).trim(),'');cursor=start+token.surface_form.length;}
    assert.equal(punctuation.slice(cursor).trim(),'');
    console.log('english-nouns: full context, real POS analysis, spaced phrases, map integration, cache, fallback and punctuation passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
