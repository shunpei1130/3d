import {z} from 'zod';
import {designSchema} from './design';
export const responseSchema=z.object({reply:z.string().max(5000),design:designSchema.nullable()});
export function openAIResponseSchema(){
 const root:any=z.toJSONSchema(responseSchema,{target:'draft-7'});
 delete root.$schema;
 function normalize(node:any){if(!node||typeof node!=='object')return;if(Array.isArray(node.items)){node.items=node.items[0];}for(const value of Object.values(node))if(Array.isArray(value))value.forEach(normalize);else normalize(value);}
 normalize(root);return root;
}
