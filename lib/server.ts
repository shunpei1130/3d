import {NextRequest} from 'next/server';
import {timingSafeEqual} from 'node:crypto';
const limits=new Map<string,{count:number;expires:number}>();
export function guard(req:NextRequest,kind:string,limit:number){
 const origin=req.headers.get('origin');if(origin&&origin!==new URL(req.url).origin)return Response.json({error:'このサイトから操作してください。'},{status:403});
 const password=process.env.STUDIO_PASSWORD;
 if(password){const a=Buffer.from(req.headers.get('x-studio-password')||''),b=Buffer.from(password);if(a.length!==b.length||!timingSafeEqual(a,b))return Response.json({error:'スタジオのアクセスコードを確認してください。'},{status:401});}
 const key=kind+':'+(req.headers.get('x-forwarded-for')?.split(',')[0]||'local'),now=Date.now();
 for(const [k,v] of limits)if(v.expires<now)limits.delete(k);
 const entry=limits.get(key)||{count:0,expires:now+3600000};if(entry.count>=limit)return Response.json({error:'少し時間をおいて、もう一度お試しください。'},{status:429});entry.count++;limits.set(key,entry);
 return null;
}
export async function readBody(req:NextRequest,max=120000){if(Number(req.headers.get('content-length'))>max)throw new Error('入力が長すぎます。');const txt=await req.text();if(Buffer.byteLength(txt)>max)throw new Error('入力が長すぎます。');return JSON.parse(txt);}
