const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../JS/network.js'), 'utf8');
const context = {};
vm.createContext(context);
vm.runInContext(source.slice(source.indexOf('function buildBalancedKeywordPositions'),source.indexOf('function redistributeKeywordMap')),context);
function layout(count,width,height,nodeWidth=90) {
    const items=Array.from({length:count},(_,id)=>({id}));
    const sizes=items.map(()=>({width:nodeWidth,height:36}));
    const positions=Array.from(context.buildBalancedKeywordPositions(items,width,height,sizes));
    assert.equal(positions.length,count);
    for (let i=0;i<count;i++) for(let j=0;j<i;j++) {
        assert(Math.abs(positions[i].x-positions[j].x)>=nodeWidth+47 || Math.abs(positions[i].y-positions[j].y)>=83);
    }
    return positions;
}
assert.equal(layout(0,1200,300).length,0);
assert.equal(layout(1,1200,300)[0].x,0);
const wide=layout(5,1400,300);
assert.equal(new Set(wide.map(p=>p.y)).size,2);
assert(Math.max(...wide.map(p=>p.x))-Math.min(...wide.map(p=>p.x))>600);
const tall=layout(5,400,800);
assert(new Set(tall.map(p=>p.y)).size>new Set(wide.map(p=>p.y)).size);
layout(50,600,300,280); // Dense maps retain label spacing; fit scales the whole map.
const existing=[{id:1,label:'Alpha',x:999,y:999},{id:2,label:'Beta',x:1000,y:1000}];
let saved=0,fit=0,redrawn=0,clicked;
const toggle={checked:false};
Object.assign(context,{
 document:{getElementById:()=>toggle},
 nodes:{get:()=>existing,update:updates=>{updates.forEach(p=>Object.assign(existing.find(n=>n.id===p.id),p));saved++;}},
 container:{clientWidth:1400,clientHeight:300},network:{redraw(){redrawn++;},getBoundingBox:()=>({left:0,right:80,top:0,bottom:30}),fit(){fit++;}},
 logAction(){},t:(key,vars,fallback)=>fallback,setRecenterMapButtonPressed(){},
 recenterMapBtn:{addEventListener:(name,fn)=>{clicked=fn;}},window:{addEventListener(){}},
});
vm.runInContext(source.slice(source.indexOf('function redistributeKeywordMap'),source.indexOf('function deleteSelectedNodesWithConfirm')),context);
clicked();assert.equal(saved,0);assert.equal(fit,1);assert.equal(existing[0].x,999);
toggle.checked=true;
clicked();assert.equal(saved,1);assert.equal(fit,2);assert.equal(redrawn,2);assert.equal(existing[0].label,'Alpha');assert.notEqual(existing[0].x,999);
toggle.checked=false;clicked();assert.equal(saved,1);assert.equal(fit,3);
const html=fs.readFileSync(require.resolve('../main.html'),'utf8');
assert(!html.match(/<input[^>]*id="rearrangeKeywordToggle"[^>]*>/)[0].includes(' checked'));
console.log('keyword-layout: balanced viewport grids, dense/long labels, resize, button recenter and position saving passed');
