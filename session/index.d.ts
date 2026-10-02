import type {ActivitySpec} from '@interactive-project/protocol/types';
import type {Action,DispatchResult,Result,Snapshot,CancellationSignal} from '@interactive-project/protocol/interoperability';
import type {RuntimeSession,ReadonlyRuntimeState} from '@interactive-project/core';
import type {ActivityEvent} from '@interactive-project/events';
import type {StudyPolicy,Rating} from '../types/flashcards.js';
export interface Observation{observationVersion:'1.0.0';kind:'card-exposed'|'review-recorded';cardId:string;face?:'front'|'back';outcome?:{kind:'self-report'|'unrated';confidence:number|null;correctness:null;rating?:Rating}}
export interface StudySession extends RuntimeSession{
 getContext():Readonly<{activityId:string;sessionId:string;attemptId?:string;generation:string;revision:number}>;
 getProgress():Readonly<{total:number;reviewed:number;skipped:number;complete:boolean}>;
}
export interface StudySessionOptions{
 activity:ActivitySpec;sessionId:string;attemptId?:string;sourceId:string;signal?:CancellationSignal;policy?:StudyPolicy;sessionPolicy?:{allowPartialCompletion?:boolean};
 clock():number;nextId():string;telemetry?:{enabled?:boolean;includeCardIds?:boolean;includeRatings?:boolean;sink?(event:ActivityEvent):unknown};
 validators:{activity(input:unknown):{valid:boolean};deck(input:unknown):{valid:boolean};action(input:unknown,expected?:{activityId:string;sessionId:string;attemptId?:string}):{valid:boolean};result(input:unknown,expected?:{activityId:string;sessionId:string;attemptId?:string}):{valid:boolean};snapshot(input:unknown,expected?:Record<string,string|undefined>):{valid:boolean};event(input:unknown):{valid:boolean}};
}
export declare function createStudySession(options:StudySessionOptions,cryptoProvider?:{subtle:{digest(algorithm:string,data:Uint8Array):Promise<ArrayBuffer>}}):Promise<StudySession>;
