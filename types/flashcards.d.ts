import type {ContentNode} from '@interactive-project/content-node';
import type {LocalizedText} from '@interactive-project/protocol/content';
import type {StatePorts} from '@interactive-project/core';
export interface Metadata{title:LocalizedText;description?:ContentNode}
export interface Card{id:string;front:ContentNode;back:ContentNode;hints?:ContentNode[];tags?:string[];metadata?:Metadata}
export interface Deck{schemaVersion:'1.0.0';id:string;cards:Card[];metadata?:Metadata}
export type StudyPolicy={policyVersion?:'1.0.0'}&({mode?:'ordered'|'exam'}|{mode:'seeded-random';seed:number}|{mode:'guided';guidedOrder:string[]});
export type Rating='again'|'hard'|'good'|'easy';
export interface Review{cardId:string;rating:Rating;timestamp:number;outcome:{kind:'self-report';confidence:number;correctness:null}}
export interface StudyState{stateVersion:'1.0.0';deckId:string;policyKey:string;order:string[];position:number|null;revealed:boolean;skipped:string[];reviews:Review[]}
export declare class FlashcardError extends Error{readonly code:string}
export declare const ratingConfidence:Readonly<Record<Rating,number>>;
export declare function createStudyPorts(options:{deck:Deck;policy?:StudyPolicy;validateDeck(input:unknown):{valid:boolean}}):StatePorts;
