import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
import {createStudySession} from '../session/index.js';
import {validateDeck,validateObservation} from '../validation/index.js';
import {validateActivitySpec} from '@interactive-project/protocol/validation';
import {validateAction,validateResult,validateSnapshot} from '@interactive-project/protocol/validation/interoperability';
import {validateEvent} from '@interactive-project/events/validation';
const uuid=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url))),clone=v=>JSON.parse(JSON.stringify(v)),key='interactive-project.flashcards/observation';
const validators={activity:validateActivitySpec,deck:validateDeck,action:validateAction,result:validateResult,snapshot:validateSnapshot,event:validateEvent};let actionId=50000;
async function fixture(extra={}){
 let next=1000;const deck=extra.deck??read('fixtures/deck.valid.json');deck.cards.forEach(c=>{c.back={kind:'text',schemaVersion:'1.0.0',value:{kind:'localized-text',schemaVersion:'1.0.0',defaultLocale:'en',translations:{en:{text:'PRIVATE_BACK_SECRET'}}}};});
 const activity={protocolVersion:'1.0.0',id:uuid(1),type:'interactive-project/flashcards',activitySchemaVersion:'1.0.0',metadata:{title:'PRIVATE_METADATA_SECRET'},config:deck};
 const options={activity,sessionId:uuid(2),attemptId:uuid(3),sourceId:uuid(4),clock:()=>1234,nextId:()=>uuid(next++),validators,policy:{mode:'seeded-random',seed:12345},...extra};delete options.deck;
 const session=await createStudySession(options,webcrypto),events=[];session.subscribeEvents(e=>{assert(validateEvent(e).valid);if(e.extensions?.[key])assert(validateObservation(e.extensions[key]).valid);events.push(e);},{replay:true});
 const dispatch=(kind,payload={})=>session.dispatch({protocolVersion:'1.0.0',actionVersion:'1.0.0',id:uuid(actionId++),activityId:uuid(1),sessionId:uuid(2),attemptId:uuid(3),sequence:session.getState().revision,type:'interactive-project/flashcards.'+kind,payload});
 return{session,events,dispatch,activity,options};
}
{
 const f=await fixture();f.session.start();assert.throws(()=>f.session.complete(),e=>e.code==='flashcards.incomplete');
 for(let i=0;i<5;i++){assert.equal(f.dispatch('reveal').status,'accepted');assert.equal(f.dispatch(i===0?'acknowledge':'rate',i===0?{}:{rating:'good'}).status,'accepted');if(i<4)assert.equal(f.dispatch('next').status,'accepted');}
 assert.deepEqual(f.session.getProgress(),{total:5,reviewed:5,skipped:0,complete:true});assert.equal(f.session.getState().state.reviewHistory[0].kind,'unrated');assert.equal(f.session.getState().state.reviewHistory[0].confidence,null);
 f.session.complete();assert.equal(f.session.getState().lifecycle,'completed');assert.equal(f.session.evaluate?f.session.getState().result.status:null,'unevaluable');assert(!Object.hasOwn(f.session.getState().result,'score'));
 assert.equal(f.events.filter(e=>e.type==='interactive-project/activity.started').length,1);assert.equal(f.events.filter(e=>e.type==='interactive-project/activity.completed').length,1);assert.equal(f.events.filter(e=>e.extensions?.[key]?.kind==='review-recorded').length,5);assert.equal(f.events.filter(e=>e.extensions?.[key]?.kind==='card-exposed').length,10);
 assert.deepEqual(f.events.map(e=>e.sequence),f.events.map((_,i)=>i));assert(!JSON.stringify(f.events).includes('PRIVATE_BACK_SECRET'));assert(!JSON.stringify(f.events).includes('PRIVATE_METADATA_SECRET'));assert(!JSON.stringify(f.session.serialize()).includes('PRIVATE_BACK_SECRET'));f.session.dispose();
}
{
 const f=await fixture();f.session.start();f.dispatch('reveal');const snapshot=f.session.serialize();assert(validateSnapshot(snapshot).valid);
 const g=await fixture({sourceId:uuid(9)});g.session.restore(JSON.parse(JSON.stringify(snapshot)));assert.deepEqual(g.session.getState(),f.session.getState());assert(g.session.getState().state.study.revealed);assert.equal(g.events.at(-1).type,'interactive-project/activity.resumed');assert.equal(g.events.at(-1).extensions[key].face,'back');assert.deepEqual(g.session.serialize().state,snapshot.state);
 const old=g.session.getState(),generation=g.session.getContext().generation,bad=clone(snapshot);bad.state.domain.study.order.reverse();assert.throws(()=>g.session.restore(bad),e=>e.name==='RuntimeError');assert.equal(g.session.getState(),old);assert.equal(g.session.getContext().generation,generation);
 const changed=clone(f.options);changed.activity.config.cards[0].tags=['changed'];const h=await fixture({activity:changed.activity});assert.throws(()=>h.session.restore(snapshot),e=>e.name==='RuntimeError');f.session.dispose();g.session.dispose();h.session.dispose();
}
{
 const sent=[];const f=await fixture({telemetry:{enabled:false,includeCardIds:true,includeRatings:true,sink:e=>sent.push(e)}});f.session.start();f.dispatch('reveal');f.dispatch('rate',{rating:'easy'});assert.equal(sent.length,0);assert(f.events.length>1);f.session.dispose();
 const filtered=[];const g=await fixture({telemetry:{enabled:true,sink:e=>filtered.push(e)}});g.session.start();g.dispatch('reveal');g.dispatch('rate',{rating:'easy'});assert(filtered.length>0);assert(filtered.every(e=>e.extensions===undefined));assert(!JSON.stringify(filtered).includes('PRIVATE_BACK_SECRET'));assert(!JSON.stringify(filtered).includes('PRIVATE_METADATA_SECRET'));g.session.dispose();
 const ids=[];const h=await fixture({telemetry:{enabled:true,includeCardIds:true,includeRatings:false,sink:e=>ids.push(e)}});h.session.start();h.dispatch('reveal');h.dispatch('rate',{rating:'easy'});const review=ids.find(e=>e.extensions?.[key]?.kind==='review-recorded');assert(review);assert(!Object.hasOwn(review.extensions[key],'outcome'));assert(validateObservation(review.extensions[key]).valid);h.session.dispose();
}
{
 const f=await fixture({policy:{mode:'exam'}});f.session.start();assert.equal(f.dispatch('acknowledge').status,'accepted');assert.equal(f.dispatch('rate',{rating:'easy'}).status,'rejected');assert.equal(f.dispatch('next').status,'accepted');assert.equal(f.session.getState().state.study.position,1);f.session.dispose();
 const e=await fixture({deck:read('fixtures/deck.empty.json')});e.session.start();assert(e.session.getProgress().complete);e.session.complete();assert.equal(e.session.getState().result.status,'unevaluable');e.session.dispose();
}
assert(!validateObservation({observationVersion:'1.0.0',kind:'card-exposed',cardId:'cardA',face:'back',content:'PRIVATE_BACK_SECRET'}).valid);
assert(!validateObservation({observationVersion:'1.0.0',kind:'review-recorded',cardId:'cardA',outcome:{kind:'self-report',rating:'easy',confidence:0,correctness:null}}).valid);
console.log('Flashcard sessions: actual Core snapshots, seeded interrupted review, source changes, unrated outcomes, study completion, standard extensions and disabled/filtered telemetry passed.');
