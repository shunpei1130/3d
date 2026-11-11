import {compile,Fonts} from './geometry';
import * as opentype from 'opentype.js';
let fonts:Promise<Fonts>;
const scope=self as unknown as {onmessage:((e:MessageEvent)=>void)|null;postMessage:(data:unknown,transfer?:Transferable[])=>void};
scope.onmessage=async e=>{const {design}=e.data;try{
 fonts??=Promise.all(['script','sans'].map(async name=>{const r=await fetch(`/fonts/${name}.ttf`);if(!r.ok)throw new Error('フォントを読み込めませんでした。');return opentype.parse(await r.arrayBuffer());})).then(([script,sans])=>({script,sans}));
 const result=compile(design,await fonts);scope.postMessage(result,[result.positions.buffer as ArrayBuffer]);
}catch(error){scope.postMessage({error:error instanceof Error?error.message:'形状を作成できませんでした。'});}};
