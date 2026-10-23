import data from './advice-data.json';
export type Advice={id:string;label:string;reply:string;productIds:string[];reasonOptions:string[]};
export function adviceFor(character:string):Advice[]{return (data as Record<string,Advice[]>)[character]||[];}
export function validAdviceProduct(advice:Advice[],id:unknown,product:unknown){return typeof id==='string'&&advice.some(a=>a.id===id&&a.productIds.includes(product as string));}
