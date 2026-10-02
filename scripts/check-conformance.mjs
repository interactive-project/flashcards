import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createStudyPorts,ratingConfidence} from '../index.js';
import {validateDeck} from '../validation/index.js';
import {createRuntime} from '@interactive-project/core';
import {validateActivitySpec} from '@interactive-project/protocol/validation';
import {validateAction,validateResult} from '@interactive-project/protocol/validation/interoperability';
import {validateEvent} from '@interactive-project/events/validation';
const uuid=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const read=path=>JSON.parse(readFileSync(new URL('../'+path,import.meta.url))),deck=read('fixtures/deck.valid.json');
assert(validateDeck(deck).valid);assert(validateDeck(read('fixtures/deck.empty.json')).valid);
for(const path of ['fixtures/deck.duplicate.json','fixtures/deck.unsupported.json'])assert(!validateDeck(read(path)).valid,path);
function fixture(policy={},input=deck,attemptId=uuid(3)){
 if(attemptId===null)attemptId=undefined;
 let event=100,actionId=200;
 const activity={protocolVersion:'1.0.0',id:uuid(1),type:'interactive-project/flashcards',activitySchemaVersion:'1.0.0',metadata:{title:'Study fixture'},config:input};
 const ports=createStudyPorts({deck:input,policy,validateDeck}),runtime=createRuntime({activity,sessionId:uuid(2),attemptId,sourceId:uuid(4),engineId:'interactive-project/flashcards',engineStateVersion:'1.0.0',clock:()=>1234,random:()=>{throw Error('Host randomness must not determine seeded order');},nextEventId:()=>uuid(event++),validators:{activity:validateActivitySpec,action:validateAction,result:validateResult,event:validateEvent},ports});
 runtime.start();
 const dispatch=(kind,payload={})=>runtime.dispatch({protocolVersion:'1.0.0',actionVersion:'1.0.0',id:uuid(actionId++),activityId:uuid(1),sessionId:uuid(2),...(attemptId!==undefined?{attemptId}:{}),sequence:runtime.getState().revision,type:'interactive-project/flashcards.'+kind,payload});
 return{runtime,dispatch};
}
{
 const f=fixture();assert.deepEqual(f.runtime.getState().state.order,deck.cards.map(c=>c.id));assert.equal(f.dispatch('previous').status,'rejected');assert.equal(f.dispatch('rate',{rating:'good'}).status,'rejected');
 assert.equal(f.dispatch('reveal').status,'accepted');assert.equal(f.dispatch('reveal').status,'rejected');assert.equal(f.dispatch('rate',{rating:'good'}).status,'accepted');assert.equal(f.dispatch('rate',{rating:'easy'}).status,'rejected');
 const review=f.runtime.getState().state.reviews[0];assert.equal(review.outcome.confidence,2/3);assert.equal(review.outcome.correctness,null);assert.equal(review.timestamp,1234);assert(Object.isFrozen(review.outcome));
 assert.equal(f.dispatch('next').status,'accepted');assert.equal(f.runtime.getState().state.revealed,false);assert.equal(f.dispatch('previous').status,'accepted');
 for(let i=0;i<4;i++)assert.equal(f.dispatch('next').status,'accepted');assert.equal(f.dispatch('next').status,'rejected');assert.equal(f.runtime.evaluate().status,'unevaluable');assert.equal(f.runtime.evaluate().reason,'unassessed');assert(!Object.hasOwn(f.runtime.evaluate(),'score'));f.runtime.dispose();
}
{
 const golden=read('fixtures/seeded-order.json'),a=fixture({mode:'seeded-random',seed:golden.seed}),b=fixture({mode:'seeded-random',seed:golden.seed});
 assert.deepEqual(a.runtime.getState().state.order,golden.order);assert.deepEqual(a.runtime.getState().state.order,b.runtime.getState().state.order);a.runtime.dispose();b.runtime.dispose();
 const zero=fixture({mode:'seeded-random',seed:0});assert.equal(new Set(zero.runtime.getState().state.order).size,deck.cards.length);zero.runtime.dispose();
 assert.throws(()=>createStudyPorts({deck,validateDeck,policy:{mode:'seeded-random',seed:-1}}),e=>e.code==='flashcards.policy');
}
{
 const order=deck.cards.map(c=>c.id).reverse(),f=fixture({mode:'guided',guidedOrder:order});
 assert.deepEqual(f.runtime.getState().state.order,order);assert.equal(f.dispatch('next').status,'rejected');assert.equal(f.dispatch('skip').status,'accepted');assert.equal(f.runtime.getState().state.position,1);assert.equal(f.dispatch('previous').status,'rejected');f.dispatch('reveal');f.dispatch('rate',{rating:'hard'});assert.equal(f.dispatch('next').status,'accepted');f.runtime.dispose();
 assert.throws(()=>createStudyPorts({deck,validateDeck,policy:{mode:'guided',guidedOrder:['unknown']}}),e=>e.code==='flashcards.policy');
}
{
 const f=fixture({mode:'exam'});assert.equal(f.dispatch('reveal').status,'rejected');assert.equal(f.dispatch('skip').status,'rejected');assert.equal(f.dispatch('next').status,'rejected');assert.equal(f.dispatch('rate',{rating:'easy'}).status,'accepted');assert.equal(f.dispatch('next').status,'accepted');assert.equal(f.dispatch('previous').status,'rejected');assert.equal(f.dispatch('rate',{rating:{value:'easy'}}).status,'rejected');f.runtime.dispose();
}
{
 const f=fixture({},read('fixtures/deck.empty.json'));assert.equal(f.runtime.getState().state.position,null);for(const kind of ['reveal','next','previous','skip','rate'])assert.equal(f.dispatch(kind,kind==='rate'?{rating:'again'}:{}).status,'rejected');assert.equal(f.runtime.evaluate().status,'unevaluable');f.runtime.dispose();
 const noAttempt=fixture({},deck,null);assert(validateResult(noAttempt.runtime.evaluate()).valid);noAttempt.runtime.dispose();
}
assert.deepEqual(Object.values(ratingConfidence),[0,1/3,2/3,1]);assert(deck.cards[0].front.kind==='group');assert(deck.cards[0].back.value.translations.ar);assert(deck.cards[0].back.value.translations.es);
const bad=JSON.parse(JSON.stringify(deck));bad.cards[0].tags=['math','math'];assert(!validateDeck(bad).valid);
const source=readFileSync(new URL('../index.js',import.meta.url),'utf8');assert(!/Math\.random|Date\.now|document|window|from ['"](?:react|vue|svelte)/.test(source));
const ts=(await import('typescript')).default,program=ts.createProgram([new URL('./type-consumer.mts',import.meta.url).pathname],{strict:true,noEmit:true,module:ts.ModuleKind.NodeNext,moduleResolution:ts.ModuleResolutionKind.NodeNext,lib:['lib.es2022.d.ts']});
const diagnostics=ts.getPreEmitDiagnostics(program);assert.equal(diagnostics.length,0,diagnostics.map(d=>ts.flattenDiagnosticMessageText(d.messageText,'\n')).join('\n'));
console.log('Flashcards: localized rich deck validation, duplicate/empty behavior, real Core study transitions, seeded/guided/exam policies, repeated reveal, navigation bounds and subjective ratings passed.');
