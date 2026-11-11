import {NextRequest} from 'next/server';
import {z} from 'zod';
import {designSchema,validateDesign} from '@/lib/design';
import {guard,readBody} from '@/lib/server';
import {responseSchema,openAIResponseSchema} from '@/lib/response-schema';
export const runtime='nodejs';
export const maxDuration=300;
const inputSchema=z.object({messages:z.array(z.object({role:z.enum(['user','assistant']),content:z.string().max(5000)})).min(1).max(30),design:designSchema.nullable(),mode:z.enum(['consult','generate']).default('consult')});
const responseFormat={type:'json_schema',name:'design_response',strict:true,schema:openAIResponseSchema()};
type ModelResponse={
 status?:string;
 error?:{code?:string}|null;
 incomplete_details?:{reason?:string}|null;
 usage?:{output_tokens?:number;output_tokens_details?:{reasoning_tokens?:number}}|null;
 output?:{content?:{type:string;text?:string}[]}[];
};

const instructions=`You are Katachi, a warm Japanese-speaking product designer and experienced FDM CAD designer for ONE user.
Machine: Bambu Lab A1 mini, build envelope 180x180x180 mm, 0.4 mm nozzle, layer 0.2 mm, textured PEI plate, external spool eSUN PLA+. Do not change material. Prefer support-free, base-down, single-material designs. Never claim printing/slicing/physical verification.
Discuss function and dimensions clearly. For broad ideas ask one useful question. If enough info exists, output a complete revised design immediately. When a current design is provided, it is authoritative and unchanged geometry should be preserved. When current design is null, start from the user's request without assuming a preset. Return a non-null design only when proposing a new/revised shape. Explain unsupported requests honestly; do not silently substitute a different object.
You can model a broad range of functional objects using sequential CSG union/subtraction primitives, polygons and engraved/raised text. No arbitrary code. Not suitable for photorealistic characters, scanned meshes, or freeform organic sculpture; explain these limits.
Coordinates millimeters: X width, Y depth, Z height; front = negative Y. Parts other than text/polygon are centered. Rotation Euler degrees X then Y then Z, then position applied. Geometry exported centered in XY and bottom Z=0. For box/roundedBox use size [x,y,z]. roundedBox rounds ALL edges with radius, must be less than HALF shortest side. Use radius .4 for tall rectangular tray walls if needing flat base (large rounded boxes round bottom undesirably); can form a 2D rounded rectangle by union of boxes and vertical cylinders then subtract inner similarly. cylinder: radius bottom, radiusTop top (0 means use bottom), size[2] height. sphere uses radius. torus radius = major radius, radiusTop = tube radius. polygon points XY extruded size[2] centered on Z. Text gets fitted into size[0] width and size[1] max height, baseline local y=0, extruded local z=0..size[2]. 'script' is Allura; 'sans' is Noto Sans. Text strokes are expanded .15mm. Only printable ASCII letters, numerals, symbols supported. Never put Japanese in model text. For front engraving rotate [90,0,0], use position Y=-depth/2+engraving depth, Z=desired text baseline. Thickness .6mm recommended, must stay within wall. Raised text similar but overlaps wall .1mm.
Use robust CSG: subtraction cutters extend .2mm beyond target surfaces, avoid tangent-only contacts; added parts overlap >=.2mm. Default wall 2.4, floor 3, minimum features .8mm. Ensure dimensions <=174mm XY when allowing brim3mm, <=180mm Z. Never call a single central cutout a finished complex organic object. Maximum 60 sequential operations. Every part must have three positive size values, even when some axes are unused. For a cylinder, use [diameter,diameter,height]. All fields required for every part; irrelevant numbers radius/radiusTop=0,text='',font='sans',points=[]. Avoid huge unbounded constructions. At least one add first. name short Japanese, description one sentence, notes list practical print considerations. Warn tight-fit parts need tolerance tests (.2-.4mm per side). Do not design for food contact, high heat, or structural safety guarantees. User may ask in Japanese.`;
export async function POST(req:NextRequest){
 const denied=guard(req,'chat',20);if(denied)return denied;
 const apiKey=process.env.OPENAI_API_KEY;
 if(!apiKey)return Response.json({error:'AIの接続準備中です。管理者がAPIキーを設定すると相談できます。サンプル・3D比較・ダウンロードはそのまま使えます。'},{status:503});
 try{
  const body=inputSchema.parse(await readBody(req));
  if(body.design)validateDesign(body.design);
  const workflow=`Workflow overrides earlier instructions: mode=${body.mode}. In consult mode NEVER generate geometry: design must be null and ready=false. Discuss the user's ideas naturally, ask useful questions as needed, and do not impose a turn limit or claim a creation button will appear when ready. The user can press この内容で作る whenever they choose. Do not require every dimension to be settled. In generate mode create the complete design from the conversation, using reasonable proposed defaults for missing dimensions and explaining them in Japanese. Set ready=true and provide a concise summary. If the request is unsupported or the object cannot be identified, explain what is needed and return design=null. Return Japanese reply in both modes.`;
  const input=[{role:'developer',content:`Current design JSON: ${JSON.stringify(body.design)}`},...body.messages];
  const signal=AbortSignal.any([req.signal,AbortSignal.timeout(280_000)]);

  async function requestModel(effort:'max'|'high',maxOutputTokens:number,extraInstructions=''){
   signal.throwIfAborted();
   const response=await fetch('https://api.openai.com/v1/responses',{
    method:'POST',
    headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},
    body:JSON.stringify({
     model:'gpt-6-luna',
     reasoning:{effort},
     store:false,
     instructions:instructions+'\n'+workflow+extraInstructions,
     input,
     text:{format:responseFormat},
     max_output_tokens:maxOutputTokens
    }),
    signal
   });
   const data:ModelResponse=(await response.json().catch(()=>null))??{};
   signal.throwIfAborted();
   if(response.ok&&data.status==='incomplete'){
    console.warn('OpenAI response incomplete',{
     mode:body.mode,
     reason:data.incomplete_details?.reason??'unknown',
     effort,
     outputTokens:data.usage?.output_tokens,
     reasoningTokens:data.usage?.output_tokens_details?.reasoning_tokens
    });
   }
   const content=data.output?.flatMap(item=>item.content??[])??[];
   return {response,data,content};
  }

  // Reasoning and the structured design share the same output allowance.
  let {response,data,content}=await requestModel('max',32_000);
  const retry=response.ok&&data.status==='incomplete'&&data.incomplete_details?.reason==='max_output_tokens'
   &&!content.some(part=>part.type==='refusal');
  if(retry){
   const retryInstructions=body.mode==='generate'
    ? '\nReturn one complete design with the simplest CSG construction that preserves all agreed dimensions and required features. Keep the reply and notes concise.'
    : '\nKeep the reply concise and focused on the next useful step.';
   ({response,data,content}=await requestModel('high',48_000,retryInstructions));
  }

  if(!response.ok){
   console.error('OpenAI error',response.status,data.error?.code);
   const error=response.status===401?'OpenAIのAPIキーを確認してください。':response.status===429?'OpenAIの利用上限に達しました。時間をおいてお試しください。':'AIとの接続に失敗しました。設定とモデルへのアクセス権を確認してください。';
   return Response.json({error},{status:502});
  }
  const reason=data.incomplete_details?.reason;
  if(reason==='content_filter'||content.some(part=>part.type==='refusal')){
   return Response.json({error:'AIがこの内容の設計に対応できませんでした。'},{status:422});
  }
  if(data.status==='incomplete'&&reason==='max_output_tokens'){
   const error=body.mode==='generate'
    ? '設計データを最後まで作成できませんでした。作りたい形を部品ごとに分けてお試しください。'
    : '相談への返答が途中で止まりました。相談内容を分けてお試しください。';
   return Response.json({error},{status:502});
  }
  const text=content.filter(part=>part.type==='output_text').map(part=>part.text).join('');
  if(data.status!=='completed'||!text){
   return Response.json({error:'AIから設計データを受け取れませんでした。もう一度お試しください。'},{status:502});
  }
  const result=responseSchema.parse(JSON.parse(text));
  if(result.design){
   try{validateDesign(result.design);}catch(error){
    const detail=error instanceof Error?error.message:'3Dモデルの寸法を確認できませんでした。';
    console.warn('OpenAI design failed validation',detail);
    return Response.json({error:detail},{status:502});
   }
  }
  if(retry)console.info('OpenAI response recovered after output limit',{mode:body.mode});
  return Response.json(result);
 }catch(error){
  if(req.signal.aborted)return new Response(null,{status:499});
  if(error instanceof Error&&error.name==='TimeoutError'){
   console.warn('OpenAI request timed out');
   return Response.json({error:'AIの設計が制限時間内に終わりませんでした。指示を短くして、もう一度お試しください。'},{status:504});
  }
  console.error('Chat validation/network failure',error instanceof Error?error.name:'unknown');
  return Response.json({error:error instanceof z.ZodError?'設計データの形式を確認できませんでした。少し短い指示で再度お試しください。':'設計を取得できませんでした。接続を確認して再度お試しください。'},{status:400});
 }
}
