import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {copyGeneratedJson} from '@interactive-project/protocol/generation/json';
import {validateContent} from '@interactive-project/content-node/validation';
import {validateSharedContent} from '@interactive-project/protocol/validation/shared-content';
const require=createRequire(import.meta.url),ajv=new Ajv2020({strict:true,allErrors:true,ownProperties:true});addFormats(ajv);
for(const name of ['@interactive-project/protocol/schemas/shared-content.v1.schema.json','@interactive-project/content-node/schemas/content-node.v1.schema.json'])ajv.addSchema(JSON.parse(readFileSync(require.resolve(name))));
const validate=ajv.compile(JSON.parse(readFileSync(new URL('../schemas/deck.v1.schema.json',import.meta.url))));
const error=(code,path)=>({code,path,severity:'error',message:'The deck violates its declared contract.'});
export function validateDeck(input){
 const r=copyGeneratedJson(input,{maxBytes:2097152,maxDepth:32,maxCollectionSize:1000,maxStringLength:100000,maxNodes:50000});if(!r.valid)return{valid:false,diagnostics:r.diagnostics};const deck=r.value;if(!validate(deck))return{valid:false,diagnostics:[error('flashcards.schema','')]};
 const diagnostics=[],seen=new Set();
 const content=(value,path)=>{const result=validateContent(value);if(!result.valid)diagnostics.push(...result.diagnostics.map(d=>({...d,path:path+d.path})));};
 const metadata=(value,path)=>{if(!value)return;const result=validateSharedContent(value.title);if(!result.valid)diagnostics.push(...result.diagnostics.map(d=>({...d,path:path+'/title'+d.path})));if(value.description)content(value.description,path+'/description');};
 metadata(deck.metadata,'/metadata');
 deck.cards.forEach((card,i)=>{const path='/cards/'+i;if(seen.has(card.id))diagnostics.push(error('flashcards.duplicate',path+'/id'));seen.add(card.id);content(card.front,path+'/front');content(card.back,path+'/back');(card.hints??[]).forEach((hint,j)=>content(hint,path+'/hints/'+j));metadata(card.metadata,path+'/metadata');});
 return diagnostics.length?{valid:false,diagnostics}:{valid:true,diagnostics:[]};
}
