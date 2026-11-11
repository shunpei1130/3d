import {test} from 'node:test';
import assert from 'node:assert/strict';
import {NextRequest} from 'next/server';
import {POST as chat} from '../app/api/chat/route';
import {POST as email} from '../app/api/email/route';
import {pencil} from '../lib/design';
import {openAIResponseSchema} from '../lib/response-schema';
import {unzipSync,strFromU8} from 'fflate';
function req(path:string,body:any,headers:Record<string,string>={}){return new NextRequest(`http://localhost:3000/api/${path}`,{method:'POST',headers:{'Content-Type':'application/json','origin':'http://localhost:3000',...headers},body:JSON.stringify(body)})}
test('Responses schema uses scalar array items and strict object properties',()=>{const schema=openAIResponseSchema();function visit(n:any){if(!n||typeof n!=='object')return;if(n.type==='object')assert.equal(n.additionalProperties,false);if(n.type==='array'){assert.ok(n.items&&!Array.isArray(n.items));assert.equal(n.additionalItems,undefined);}for(const v of Object.values(n))if(Array.isArray(v))v.forEach(visit);else visit(v)}visit(schema)});
test('routes do not claim success without keys',async()=>{delete process.env.OPENAI_API_KEY;delete process.env.RESEND_API_KEY;assert.equal((await chat(req('chat',{}))).status,503);assert.equal((await email(req('email',{}))).status,503)});
test('chat uses Luna MAX and returns validated complete model',async()=>{process.env.OPENAI_API_KEY='test-key';const original=globalThis.fetch;let sent:any;globalThis.fetch=async(url,opts)=>{assert.equal(url,'https://api.openai.com/v1/responses');sent=JSON.parse(String(opts?.body));return Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({reply:'縺ｧ縺阪∪縺励◆',ready:true,summary:'Pen stand',design:pencil})}]}]})};try{const r=await chat(req('chat',{messages:[{role:'user',content:'繝壹Φ遶九※繧剃ｽ懊▲縺ｦ'}],design:null,mode:'generate'}));assert.equal(r.status,200);assert.equal(sent.model,'gpt-6-luna');assert.equal(sent.reasoning.effort,'max');assert.equal(sent.store,false);assert.equal((await r.json()).design.name,pencil.name)}finally{globalThis.fetch=original;delete process.env.OPENAI_API_KEY}});

const designRequest={messages:[{role:'user',content:'ペン立ての寸法を保って作り直してください。'}],design:pencil,mode:'generate'};
function interrupted(reason:string){
 return Response.json({
  status:'incomplete',
  incomplete_details:{reason},
  output:[{type:'message',content:[{type:'output_text',text:'{"reply":"設計'}]}]
 });
}

test('chat retries an output-limited design with the same specification and deadline',async t=>{
 process.env.OPENAI_API_KEY='test-key';
 t.after(()=>{delete process.env.OPENAI_API_KEY;});
 const requests:RequestInit[]=[];
 t.mock.method(globalThis,'fetch',async (url:unknown,options?:RequestInit)=>{
  assert.equal(url,'https://api.openai.com/v1/responses');
  assert.ok(options);
  requests.push(options);
  if(requests.length===1)return interrupted('max_output_tokens');
  return Response.json({status:'completed',output:[{type:'message',content:[{
   type:'output_text',
   text:JSON.stringify({reply:'設計できました。',ready:true,summary:'ペン立て',design:pencil})
  }]}]});
 });

 const response=await chat(req('chat',designRequest));
 assert.equal(response.status,200);
 assert.deepEqual((await response.json()).design,pencil);
 assert.equal(requests.length,2);
 const [initial,retry]=requests.map(request=>JSON.parse(String(request.body)));
 assert.deepEqual([initial.max_output_tokens,retry.max_output_tokens],[32_000,48_000]);
 assert.deepEqual([initial.reasoning.effort,retry.reasoning.effort],['max','high']);
 assert.equal(retry.model,initial.model);
 assert.deepEqual(retry.input,initial.input);
 assert.deepEqual(retry.text,initial.text);
 assert.equal(retry.store,false);
 assert.equal(requests[1].signal,requests[0].signal);
});

test('chat stops after one retry when both designs reach the output limit',async t=>{
 process.env.OPENAI_API_KEY='test-key';
 t.after(()=>{delete process.env.OPENAI_API_KEY;});
 const model=t.mock.method(globalThis,'fetch',async()=>interrupted('max_output_tokens'));

 const response=await chat(req('chat',designRequest));
 assert.equal(model.mock.callCount(),2);
 assert.equal(response.status,502);
 assert.match((await response.json()).error,/部品ごとに分けて/);
});

test('chat does not retry a content-filter interruption',async t=>{
 process.env.OPENAI_API_KEY='test-key';
 t.after(()=>{delete process.env.OPENAI_API_KEY;});
 const model=t.mock.method(globalThis,'fetch',async()=>interrupted('content_filter'));

 const response=await chat(req('chat',designRequest));
 assert.equal(model.mock.callCount(),1);
 assert.equal(response.status,422);
 assert.equal((await response.json()).design,undefined);
});

test('chat reports a timeout while retrying the design',async t=>{
 process.env.OPENAI_API_KEY='test-key';
 t.after(()=>{delete process.env.OPENAI_API_KEY;});
 let attempts=0;
 t.mock.method(globalThis,'fetch',async()=>{
  if(++attempts===1)return interrupted('max_output_tokens');
  throw new DOMException('Timed out','TimeoutError');
 });

 const response=await chat(req('chat',designRequest));
 assert.equal(attempts,2);
 assert.equal(response.status,504);
 assert.match((await response.json()).error,/制限時間内/);
});

test('email fixes recipient and attaches real STL and editable recipe',async()=>{process.env.RESEND_API_KEY='test-resend-key';const original=globalThis.fetch;let payload:any;globalThis.fetch=async(url,opts)=>{assert.equal(url,'https://api.resend.com/emails');payload=JSON.parse(String(opts?.body));return Response.json({id:'test-id'})};try{const r=await email(req('email',{design:pencil,to:'someone-else@example.com'}));assert.equal(r.status,200);assert.deepEqual(payload.to,['s.hasegawa1130@gmail.com']);const files=unzipSync(Buffer.from(payload.attachments[0].content,'base64'));assert.ok(files['model.stl'].length>84);assert.equal(JSON.parse(strFromU8(files['project.katachi.json'])).name,pencil.name);assert.match(strFromU8(files['print-guide.txt']),/eSUN PLA/)}finally{globalThis.fetch=original;delete process.env.RESEND_API_KEY}});
test('foreign origin is blocked',async()=>{assert.equal((await chat(req('chat',{}, {origin:'https://other.example'}))).status,403)});
test('optional access code enforced on server',async()=>{process.env.STUDIO_PASSWORD='a-test-password';try{assert.equal((await email(req('email',{}))).status,401)}finally{delete process.env.STUDIO_PASSWORD}});

test('a second request for the same design sends a new email',async()=>{
 process.env.RESEND_API_KEY='test-resend-key';
 const original=globalThis.fetch;
 let count=0;
 const keys=new Map<string,string>();
 globalThis.fetch=async(_url,opts)=>{
  const key=new Headers(opts?.headers).get('Idempotency-Key');
  if(key&&keys.has(key))return Response.json({id:keys.get(key)});
  const id='test-send-'+(++count);
  if(key)keys.set(key,id);
  return Response.json({id});
 };
 try{
  for(let i=1;i<=2;i++){
   const response=await email(req('email',{design:pencil},{'x-forwarded-for':'192.0.2.14'}));
   assert.equal(response.status,200);
   assert.equal((await response.json()).id,'test-send-'+i);
  }
 }finally{globalThis.fetch=original;delete process.env.RESEND_API_KEY;}
});
