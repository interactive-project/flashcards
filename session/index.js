import {copyGeneratedJson} from '@interactive-project/protocol/generation/json';
import {canonicalJson} from '@interactive-project/protocol/interoperability';
import {createPersistentRuntime} from '@interactive-project/core/persistence';
import {createEventBus} from '@interactive-project/events/bus';
import {createStudyPorts,ratingConfidence,FlashcardError} from '../index.js';
const key='interactive-project.flashcards/observation';
function copy(v){const r=copyGeneratedJson(v,{maxBytes:2097152,maxDepth:32,maxCollectionSize:1000,maxStringLength:100000,maxNodes:50000});if(!r.valid)throw new FlashcardError('flashcards.nonJson');return r.value;}
export async function createStudySession(input,cryptoProvider){
 const options={...input},activity=copy(options.activity),deck=activity.config,policy=copy(options.policy??{}),sessionPolicy=copy({allowPartialCompletion:false,...options.sessionPolicy}),telemetry={enabled:false,includeCardIds:false,includeRatings:false,...options.telemetry},validators={...options.validators};
 if(!['activity','deck','action','result','snapshot','event'].every(k=>typeof validators[k]==='function')||typeof options.nextId!=='function'||typeof options.clock!=='function'||typeof sessionPolicy.allowPartialCompletion!=='boolean'||Object.keys(sessionPolicy).some(k=>k!=='allowPartialCompletion')||['enabled','includeCardIds','includeRatings'].some(k=>typeof telemetry[k]!=='boolean')||Object.keys(telemetry).some(k=>!['enabled','includeCardIds','includeRatings','sink'].includes(k))||(telemetry.sink!==undefined&&typeof telemetry.sink!=='function'))throw new FlashcardError('flashcards.session');
 const base=createStudyPorts({deck,policy,validateDeck:validators.deck}),expected=base.initialState(activity),ids=new Set(expected.order),sessionPolicyKey=canonicalJson(sessionPolicy);
 let runtime,staged,disposed=false;const prepared=new Map(),outbox=[];
 const bus=createEventBus({activityId:activity.id,sessionId:options.sessionId,sourceId:options.sourceId,validate:validators.event});
 function checked(fn,...args){try{const r=fn(...args);if(r&&typeof r.then==='function'){Promise.resolve(r).catch(()=>{});return false;}return r?.valid===true;}catch{return false;}}
 const same=(a,b)=>canonicalJson(a)===canonicalJson(b);
 function validDomain(s){
  if(!s||Object.keys(s).sort().join(',')!=='reviewHistory,sessionPolicyKey,sessionStateVersion,study'||s.sessionStateVersion!=='1.0.0'||s.sessionPolicyKey!==sessionPolicyKey||!s.study||!Array.isArray(s.reviewHistory)||s.reviewHistory.length>ids.size)return{valid:false};
  const study=s.study;
  if(Object.keys(study).sort().join(',')!=='deckId,order,policyKey,position,revealed,reviews,skipped,stateVersion'||study.stateVersion!=='1.0.0'||study.deckId!==deck.id||study.policyKey!==expected.policyKey||!same(study.order,expected.order)||!(ids.size?Number.isSafeInteger(study.position)&&study.position>=0&&study.position<ids.size:study.position===null)||typeof study.revealed!=='boolean'||!Array.isArray(study.reviews)||!Array.isArray(study.skipped)||new Set(study.skipped).size!==study.skipped.length||study.skipped.some(id=>!ids.has(id)))return{valid:false};
  if((policy.mode==='exam'||!ids.size)&&study.revealed)return{valid:false};
  const seen=new Set(),rated=[];
  for(const r of s.reviewHistory){
   if(!r||!ids.has(r.cardId)||seen.has(r.cardId)||!Number.isSafeInteger(r.timestamp)||r.timestamp<0||r.correctness!==null)return{valid:false};seen.add(r.cardId);
   if(r.kind==='self-report'){if(Object.keys(r).sort().join(',')!=='cardId,confidence,correctness,kind,rating,timestamp'||typeof r.rating!=='string'||!Object.hasOwn(ratingConfidence,r.rating)||r.confidence!==ratingConfidence[r.rating])return{valid:false};rated.push({cardId:r.cardId,rating:r.rating,timestamp:r.timestamp,outcome:{kind:'self-report',confidence:r.confidence,correctness:null}});}
   else if(r.kind!=='unrated'||Object.keys(r).sort().join(',')!=='cardId,confidence,correctness,kind,timestamp'||r.confidence!==null)return{valid:false};
  }
  if(!same(rated,study.reviews)||study.skipped.some(id=>seen.has(id)))return{valid:false};staged=s;return{valid:true};
 }
 function done(domain){const covered=new Set([...domain.study.skipped,...domain.reviewHistory.map(r=>r.cardId)]);return covered.size===ids.size;}
 const ports={
  initialState:a=>{staged=copy({sessionStateVersion:'1.0.0',sessionPolicyKey,study:base.initialState(a),reviewHistory:[]});return staged;},
  reduce:(s,action,ctx)=>{
   const current=s.study.position===null?null:s.study.order[s.study.position],reviewed=s.reviewHistory.some(r=>r.cardId===current),kind=action.type.slice('interactive-project/flashcards.'.length);
   let next;
   if(action.type==='interactive-project/flashcards.acknowledge'&&current!==null&&!reviewed&&(s.study.revealed||policy.mode==='exam')&&Object.keys(action.payload).length===0){next={...s,study:{...s.study,skipped:s.study.skipped.filter(id=>id!==current)},reviewHistory:[...s.reviewHistory,{cardId:current,kind:'unrated',confidence:null,correctness:null,timestamp:ctx.clock()}]};}
   else if(kind==='rate'&&reviewed)return{accepted:false};
   else if(kind==='skip'&&reviewed)return{accepted:false};
   else if(action.type==='interactive-project/flashcards.next'&&reviewed&&['guided','exam'].includes(policy.mode)&&s.study.position<s.study.order.length-1&&Object.keys(action.payload).length===0)next={...s,study:{...s.study,position:s.study.position+1,revealed:false}};
   else{const r=base.reduce(s.study,action,ctx);if(!r.accepted)return r;next={...s,study:r.state,reviewHistory:[...s.reviewHistory]};if(kind==='rate'){const review=r.state.reviews.at(-1);next.reviewHistory.push({cardId:review.cardId,rating:review.rating,timestamp:review.timestamp,...review.outcome});}}
   if(!validDomain(next).valid)throw new FlashcardError('flashcards.state');staged=copy(next);return{accepted:true,state:staged};
  },
  evaluate:base.evaluate
 };
 function annotate(e){
  const domain=staged??runtime?.getState().state,study=domain?.study,cardId=study?.position===null?null:study?.order[study.position];let observation;
  if(cardId&&(e.type==='interactive-project/activity.started'||e.type==='interactive-project/activity.interacted'&&['interactive-project/flashcards.reveal','interactive-project/flashcards.next','interactive-project/flashcards.previous','interactive-project/flashcards.skip','interactive-project/restore'].includes(e.payload.actionType)))observation={observationVersion:'1.0.0',kind:'card-exposed',cardId,face:study.revealed?'back':'front'};
  if(e.type==='interactive-project/activity.interacted'&&['interactive-project/flashcards.rate','interactive-project/flashcards.acknowledge'].includes(e.payload.actionType)){const r=domain.reviewHistory.at(-1);observation={observationVersion:'1.0.0',kind:'review-recorded',cardId:r.cardId,outcome:{kind:r.kind,confidence:r.confidence,correctness:null,...(r.rating!==undefined?{rating:r.rating}:{})}};}
  if(e.type==='interactive-project/activity.interacted'&&e.payload.actionType==='interactive-project/restore')e={...e,type:'interactive-project/activity.resumed',payload:{revision:e.payload.revision,snapshotVersion:'1.0.0'}};
  return copy({...e,...(observation?{extensions:{...e.extensions,[key]:observation}}:{})});
 }
 function flush(){if(disposed)return;bus.flush();while(outbox.length){if(!bus.publish(outbox[0]).accepted)break;outbox.shift();}bus.flush();}
 function eventValidator(e){
  if(!checked(validators.event,e))return{valid:false};const annotated=annotate(e);if(!checked(validators.event,annotated))return{valid:false};flush();const stats=bus.stats(),bytes=new TextEncoder().encode(JSON.stringify(annotated)).byteLength;
  if(outbox.length||stats.pending>=128||stats.pendingBytes+bytes>4194304||prepared.size>=128)return{valid:false};prepared.set(e.id,annotated);return{valid:true};
 }
 if(options.signal?.aborted){bus.dispose();throw new FlashcardError('flashcards.cancelled');}
 try{runtime=await createPersistentRuntime({activity,sessionId:options.sessionId,attemptId:options.attemptId,sourceId:options.sourceId,engineId:'interactive-project/flashcards',engineStateVersion:'1.0.0',clock:options.clock,random:()=>0,nextEventId:options.nextId,ports,validators:{activity:validators.activity,action:validators.action,result:validators.result,event:eventValidator},persistence:{validateSnapshot:validators.snapshot,validateState:validDomain,validateDrivers:drivers=>({valid:Object.keys(drivers).length===0}),nextGenerationId:options.nextId}},cryptoProvider);}catch(e){bus.dispose();throw e;}
 runtime.subscribeEvents(e=>{if(disposed)return;const event=prepared.get(e.id)??annotate(e);prepared.delete(e.id);outbox.push(event);flush();},{replay:true});
 function filter(event){
  const observation=event.extensions?.[key];if(!observation)return event;
  if(!telemetry.includeCardIds){const {extensions,...rest}=event;return copy(rest);}
  if(observation.kind==='review-recorded'&&!telemetry.includeRatings){const {outcome,...metadata}=observation;return copy({...event,extensions:{[key]:metadata}});}
  return event;
 }
 if(telemetry.enabled&&telemetry.sink)bus.subscribe(e=>{try{const r=telemetry.sink(filter(e));if(r&&typeof r.then==='function')Promise.resolve(r).catch(()=>{});}catch{}});
 function run(fn){if(disposed)throw new FlashcardError('flashcards.disposed');staged=runtime.getState().state;try{return fn();}finally{prepared.clear();}}
 function complete(o){return run(()=>{if(!sessionPolicy.allowPartialCompletion&&!done(runtime.getState().state))throw new FlashcardError('flashcards.incomplete');return runtime.complete(o);});}
 function dispose(){if(disposed)return;disposed=true;runtime.dispose();bus.dispose();outbox.length=0;prepared.clear();}
 if(options.signal?.aborted){dispose();throw new FlashcardError('flashcards.cancelled');}
 return Object.freeze({start:o=>run(()=>runtime.start(o)),pause:o=>run(()=>runtime.pause(o)),resume:o=>run(()=>runtime.resume(o)),dispatch:(a,o)=>run(()=>runtime.dispatch(a,o)),evaluate:o=>run(()=>runtime.evaluate(o)),fail:o=>run(()=>runtime.fail(o)),complete,serialize:()=>run(()=>runtime.serialize()),restore:(s,o)=>run(()=>runtime.restore(s,o)),dispose,getState:runtime.getState,getContext:runtime.getEffectContext,getEffectContext:runtime.getEffectContext,getDriverSnapshot:runtime.getDriverSnapshot,subscribe:runtime.subscribe,subscribeEvents:bus.subscribe,flushEvents(){runtime.flushEvents();flush();},getProgress:()=>Object.freeze({total:ids.size,reviewed:runtime.getState().state.reviewHistory.length,skipped:runtime.getState().state.study.skipped.length,complete:done(runtime.getState().state)})});
}
