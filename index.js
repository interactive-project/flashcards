import {copyGeneratedJson} from '@interactive-project/protocol/generation/json';
import {canonicalJson} from '@interactive-project/protocol/interoperability';
export class FlashcardError extends Error{constructor(code){super('Flashcard operation rejected.');this.name='FlashcardError';this.code=code;}}
function copy(v){const r=copyGeneratedJson(v,{maxBytes:2097152,maxDepth:32,maxCollectionSize:1000,maxStringLength:100000,maxNodes:50000});if(!r.valid)throw new FlashcardError('flashcards.nonJson');return r.value;}
export const ratingConfidence=Object.freeze({again:0,hard:1/3,good:2/3,easy:1});
function seededOrder(ids,seed){
 let value=seed>>>0;const random=()=>{value=(value+0x6D2B79F5)>>>0;let t=value;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};
 const result=[...ids];for(let i=result.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[result[i],result[j]]=[result[j],result[i]];}return result;
}
export function createStudyPorts({deck:input,policy:inputPolicy={},validateDeck}){
 const deck=copy(input);let valid;try{valid=validateDeck?.(deck);}catch{}if(valid&&typeof valid.then==='function'){Promise.resolve(valid).catch(()=>{});throw new FlashcardError('flashcards.deck');}if(valid?.valid!==true)throw new FlashcardError('flashcards.deck');
 const policy=copy({policyVersion:'1.0.0',mode:'ordered',...inputPolicy}),ids=deck.cards.map(c=>c.id);
 if(Object.keys(policy).some(k=>!['policyVersion','mode','seed','guidedOrder'].includes(k))||policy.policyVersion!=='1.0.0'||!['ordered','seeded-random','guided','exam'].includes(policy.mode))throw new FlashcardError('flashcards.policy');
 if(policy.mode==='seeded-random'?(!Number.isSafeInteger(policy.seed)||policy.seed<0||policy.seed>4294967295||policy.guidedOrder!==undefined):(policy.seed!==undefined))throw new FlashcardError('flashcards.policy');
 if(policy.mode==='guided'?(!Array.isArray(policy.guidedOrder)||policy.guidedOrder.length!==ids.length||new Set(policy.guidedOrder).size!==ids.length||policy.guidedOrder.some(id=>!ids.includes(id))):(policy.guidedOrder!==undefined))throw new FlashcardError('flashcards.policy');
 const order=policy.mode==='seeded-random'?seededOrder(ids,policy.seed):policy.mode==='guided'?[...policy.guidedOrder]:ids;
 function initialState(activity){if(activity.type!=='interactive-project/flashcards'||canonicalJson(activity.config)!==canonicalJson(deck))throw new FlashcardError('flashcards.activity');return copy({stateVersion:'1.0.0',deckId:deck.id,policyKey:canonicalJson(policy),order,position:order.length?0:null,revealed:false,skipped:[],reviews:[]});}
 function reduce(state,action,context){
  const denied={accepted:false};if(state.position===null||!action.type.startsWith('interactive-project/flashcards.'))return denied;
  const kind=action.type.slice('interactive-project/flashcards.'.length),p=action.payload,current=state.order[state.position],reviewed=state.reviews.some(r=>r.cardId===current),next={...state,skipped:[...state.skipped],reviews:[...state.reviews]},empty=()=>Object.keys(p).length===0;
  if(kind==='reveal'&&empty()&&policy.mode!=='exam'&&!state.revealed)next.revealed=true;
  else if(kind==='next'&&empty()&&state.position<state.order.length-1&&(policy.mode==='ordered'||policy.mode==='seeded-random'||reviewed||state.skipped.includes(current))){next.position++;next.revealed=false;}
  else if(kind==='previous'&&empty()&&state.position>0&&['ordered','seeded-random'].includes(policy.mode)){next.position--;next.revealed=false;}
  else if(kind==='skip'&&empty()&&policy.mode!=='exam'&&!state.skipped.includes(current)&&!reviewed){next.skipped.push(current);next.position=Math.min(state.position+1,state.order.length-1);next.revealed=false;}
  else if(kind==='rate'&&Object.keys(p).join(',')==='rating'&&typeof p.rating==='string'&&Object.hasOwn(ratingConfidence,p.rating)&&!reviewed&&(state.revealed||policy.mode==='exam')){next.skipped=next.skipped.filter(id=>id!==current);next.reviews.push({cardId:current,rating:p.rating,timestamp:context.clock(),outcome:{kind:'self-report',confidence:ratingConfidence[p.rating],correctness:null}});}
  else return denied;
  return{accepted:true,state:copy(next)};
 }
 function evaluate(_state,context,revision){return{protocolVersion:'1.0.0',resultVersion:'1.0.0',activityId:context.identity.activityId,sessionId:context.identity.sessionId,...(context.identity.attemptId!==undefined?{attemptId:context.identity.attemptId}:{}),revision,evidence:[],status:'unevaluable',reason:'unassessed'};}
 return Object.freeze({initialState,reduce,evaluate});
}
