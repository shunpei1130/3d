import {z} from 'zod';
export const vec=z.tuple([z.number().finite(),z.number().finite(),z.number().finite()]);
export const partSchema=z.object({
 operation:z.enum(['add','subtract']),shape:z.enum(['box','roundedBox','cylinder','sphere','torus','polygon','text']),
 size:vec,position:vec,rotation:vec,radius:z.number().finite(),radiusTop:z.number().finite(),
 text:z.string().max(60),font:z.enum(['script','sans']),points:z.array(z.tuple([z.number().finite(),z.number().finite()])).max(64)
});
export const designSchema=z.object({name:z.string().min(1).max(80),description:z.string().max(1000),parts:z.array(partSchema).min(1).max(60),notes:z.array(z.string().max(300)).max(12)});
export type Design=z.infer<typeof designSchema>;
export type Part=z.infer<typeof partSchema>;
export const PRINTER={name:'Bambu Lab A1 mini',volume:[180,180,180],nozzle:.4,layer:.2,material:'eSUN PLA+',source:'外部スプール'};
export const IPHONE={width:71.6,length:147.6,thickness:7.8};
export function part(shape:Part['shape'],size:number[],position:number[],extras:Partial<Part>={}):Part{return {operation:'add',shape,size:size as Part['size'],position:position as Part['position'],rotation:[0,0,0],radius:0,radiusTop:0,text:'',font:'sans',points:[],...extras};}
export function roundRect(w:number,d:number,r:number):[number,number][]{return [[w/2-r,d/2-r,0],[-w/2+r,d/2-r,90],[-w/2+r,-d/2+r,180],[w/2-r,-d/2+r,270]].flatMap(([x,y,a])=>Array.from({length:9},(_,i)=>[x+r*Math.cos((a+i*90/8)*Math.PI/180),y+r*Math.sin((a+i*90/8)*Math.PI/180)] as [number,number]));}
export const tray:Design={name:'ふたりのデスクトレー',description:'鍵と小物をまとめる、筆記体の名前入りトレー。',parts:[part('polygon',[100,70,60],[0,0,30],{points:roundRect(100,70,12)}),part('polygon',[95.2,65.2,64],[0,0,35],{points:roundRect(95.2,65.2,9.6),operation:'subtract'}),part('text',[70,9,.8],[0,-34.4,23],{operation:'subtract',text:'nodoka & shumpei',font:'script',rotation:[90,0,0]})],notes:['外寸100 × 70 × 60 mm。壁2.4 mm、底3 mm。','底面を下にして印刷。文字の再現はスライスで確認してください。']};
export const pencil:Design={name:'まるいペンスタンド',description:'机の上をすっきりさせる、シンプルな円筒のペン立て。',parts:[part('cylinder',[65,65,90],[0,0,45],{radius:32.5,radiusTop:32.5}),part('cylinder',[60.2,60.2,94],[0,0,50],{radius:30.1,radiusTop:30.1,operation:'subtract'})],notes:['壁2.4 mm、底3 mm。','底面を下にして印刷してください。']};
export const cable:Design={name:'ケーブルの定位置',description:'充電ケーブルをまとめる、5つの溝があるデスクブロック。',parts:[part('roundedBox',[100,28,15],[0,0,7.5],{radius:2}),...[-36,-18,0,18,36].map(x=>part('cylinder',[6,6,36],[x,0,15],{radius:3,radiusTop:3,operation:'subtract',rotation:[90,0,0]}))],notes:['ケーブル径に合わせて溝のサイズを相談できます。','PLA製。高温になる場所での使用は避けてください。']};
export const initialMessage='何をつくりましょう？\n用途や入れたいものを教えてください。サイズが曖昧でも、一緒に決められます。';
export function validateDesign(raw:unknown):Design{
 const d=designSchema.parse(raw);
 if(d.parts[0].operation!=='add')throw new Error('最初の形状は追加パーツにしてください。');
 for(const p of d.parts){
  if(p.size.some(v=>v<=0||v>400)||p.position.some(v=>Math.abs(v)>400)||p.rotation.some(v=>Math.abs(v)>360))throw new Error('形状の寸法または位置が範囲外です。');
  if(p.radius<0||p.radius>200||p.radiusTop<0||p.radiusTop>200)throw new Error('半径が範囲外です。');
  if(p.shape==='roundedBox'&&(p.radius<.1||p.radius>=Math.min(...p.size)/2))throw new Error('角丸半径は最小辺の半分未満にしてください。');
  if(['cylinder','sphere','torus'].includes(p.shape)&&p.radius<.2)throw new Error('半径は0.2 mm以上にしてください。');
  if(p.shape==='torus'&&p.radiusTop>=p.radius)throw new Error('トーラスの管半径が大きすぎます。');
  if(p.shape==='polygon'&&(p.points.length<3||p.points.some(q=>q.some(v=>Math.abs(v)>200))))throw new Error('多角形の頂点が不正です。');
  if(p.shape==='text'&&(!p.text.trim()||/[^\x20-\x7E]/.test(p.text)))throw new Error('文字入れには半角英数字・記号を使用してください。日本語はチャットで相談できます。');
 }
 return d;
}
