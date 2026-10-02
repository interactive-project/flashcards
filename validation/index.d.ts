export interface Diagnostic{code:string;path:string;severity:'error';message:string}
export declare function validateDeck(input:unknown):{valid:boolean;diagnostics:Diagnostic[]};
