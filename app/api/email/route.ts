import {NextRequest} from 'next/server';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import * as opentype from 'opentype.js';
import {zipSync,strToU8} from 'fflate';
import {validateDesign} from '@/lib/design';
import {compile,binarySTL,Fonts} from '@/lib/geometry';
import {guard,readBody} from '@/lib/server';
export const runtime='nodejs';export const maxDuration=60;
let fonts:Promise<Fonts>;
export async function POST(req:NextRequest){const denied=guard(req,'email',5);if(denied)return denied;
 if(!process.env.RESEND_API_KEY)return Response.json({error:'メール送信の接続準備中です。データはダウンロードできます。'},{status:503});
 try{const {design:raw}=await readBody(req);const design=validateDesign(raw);
 fonts??=Promise.all(['script','sans'].map(async f=>{const b=await readFile(join(process.cwd(),'public','fonts',`${f}.ttf`));return opentype.parse(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength) as ArrayBuffer);})).then(([script,sans])=>({script,sans}));
 const mesh=compile(design,await fonts),stl=binarySTL(mesh.positions);const guide=`${design.name}\n寸法: ${mesh.dimensions.map(d=>d.toFixed(1)).join(' x ')} mm\nBambu Lab A1 mini / eSUN PLA+ / 外部スプール / ノズル0.4mm / 積層0.2mm\nSTLはmm、倍率100%、底を下。スライスの警告・サポート・初層を確認してください。\n実機未検証。フィット部品は小さなテスト印刷を推奨。\n${design.notes.join('\n')}`;
 const zip=zipSync({'model.stl':stl,'project.katachi.json':strToU8(JSON.stringify(design,null,2)),'print-guide.txt':strToU8(guide)});
 if(zip.byteLength>15*1024*1024)throw new Error('ファイルが大きすぎます。ダウンロードをご利用ください。');
 const digest=createHash('sha256').update(JSON.stringify(design)).digest('hex');
 const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':`katachi-${digest}-${Math.floor(Date.now()/86400000)}`},body:JSON.stringify({from:process.env.RESEND_FROM||'Katachi <onboarding@resend.dev>',to:['s.hasegawa1130@gmail.com'],subject:`[Katachi] ${design.name} の3Dプリントデータ`,text:`${guide}\n\n添付ZIPにSTLと再編集用プロジェクトをまとめています。`,attachments:[{filename:'katachi-print-data.zip',content:Buffer.from(zip).toString('base64')}] }),signal:AbortSignal.timeout(25000)});
 const data=await r.json();if(!r.ok){console.error('Resend error',r.status,data.name);return Response.json({error:'メールを送信できませんでした。Resendのキー・送信元ドメイン・送信先制限を確認してください。'},{status:502});}
 return Response.json({ok:true,id:data.id,to:'s.hasegawa1130@gmail.com'});
 }catch(error){console.error('Export/email failure',error instanceof Error?error.name:'unknown');return Response.json({error:error instanceof Error?error.message:'データの作成に失敗しました。'},{status:400});}
}
