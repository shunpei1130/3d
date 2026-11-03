import jscad from '@jscad/modeling';
import * as opentype from 'opentype.js';
import ClipperLib from 'clipper-lib';
import {Design,validateDesign,Part} from './design';
const {primitives,transforms,booleans,extrusions,geometries,modifiers,measurements}=jscad;
export type Fonts={script:opentype.Font;sans:opentype.Font};
type Point=[number,number];
function inPoly(p:Point,poly:Point[]){let c=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])c=!c;}return c;}
function textGeometry(p:Part,fonts:Fonts){
 const font=fonts[p.font]; const allLoops:Point[][]=[];
 font.forEachGlyph(p.text,0,0,100,{},(glyph,gx,gy,size)=>{
  const path=glyph.getPath(gx,gy,size); const loops:Point[][]=[];let points:Point[]=[];let last:Point=[0,0];
  function finish(){if(points.length>2){if(Math.hypot(points[0][0]-points.at(-1)![0],points[0][1]-points.at(-1)![1])<1e-5)points.pop();if(points.length>2)loops.push(points);}points=[];}
  for(const c of path.commands){
   if(c.type==='M'){finish();last=[c.x,-c.y];points.push(last);}
   else if(c.type==='L'){last=[c.x,-c.y];points.push(last);}
   else if(c.type==='Q'||c.type==='C'){
    const start=last;for(let i=1;i<=10;i++){const t=i/10,u=1-t;
     const q:Point=c.type==='Q'?[u*u*start[0]+2*u*t*c.x1+t*t*c.x,u*u*start[1]-2*u*t*c.y1-t*t*c.y]:[u*u*u*start[0]+3*u*u*t*c.x1+3*u*t*t*c.x2+t*t*t*c.x,u*u*u*start[1]-3*u*u*t*c.y1-3*u*t*t*c.y2-t*t*t*c.y];points.push(q);last=q;}
   }else if(c.type==='Z')finish();
  }finish();
  if(!loops.length)return;
  allLoops.push(...loops);
 });
 if(!allLoops.length)throw new Error('文字の形を生成できませんでした。');
 const xs=allLoops.flat().map(q=>q[0]),ys=allLoops.flat().map(q=>q[1]);const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);const factor=Math.min(p.size[0]/(maxX-minX),p.size[1]/(maxY-minY));
 const scale=1000;const paths=allLoops.map(loop=>loop.map(([x,y])=>({X:Math.round((x-(minX+maxX)/2)*factor*scale),Y:Math.round((y-minY)*factor*scale)})));
 // Integer polygon clipping resolves overlapping cursive strokes before extrusion.
 const clipper=new ClipperLib.Clipper();clipper.AddPaths(paths,ClipperLib.PolyType.ptSubject,true);const merged=new ClipperLib.Paths();clipper.Execute(ClipperLib.ClipType.ctUnion,merged,ClipperLib.PolyFillType.pftNonZero,ClipperLib.PolyFillType.pftNonZero);
 const offset=new ClipperLib.ClipperOffset(2,20);offset.AddPaths(merged,ClipperLib.JoinType.jtRound,ClipperLib.EndType.etClosedPolygon);const expanded=new ClipperLib.Paths();offset.Execute(expanded,.15*scale);
 const sides:any[]=[];for(const loop of expanded)for(let i=0;i<loop.length;i++){const a=loop[i],b=loop[(i+1)%loop.length];sides.push([[a.X/scale,a.Y/scale],[b.X/scale,b.Y/scale]]);}
 return extrusions.extrudeLinear({height:p.size[2]},geometries.geom2.create(sides));
}
export function compile(raw:Design,fonts:Fonts){
 const design=validateDesign(raw);let result:any=null;
 for(const p of design.parts){let g:any;const center=[0,0,0];
  switch(p.shape){
   case 'box':g=primitives.cuboid({size:p.size,center});break;
   case 'roundedBox':g=primitives.roundedCuboid({size:p.size,roundRadius:p.radius,segments:32,center});break;
   case 'cylinder':g=primitives.cylinderElliptic({height:p.size[2],startRadius:[p.radius,p.radius],endRadius:[p.radiusTop||p.radius,p.radiusTop||p.radius],segments:64,center});break;
   case 'sphere':g=primitives.sphere({radius:p.radius,segments:32,center});break;
   case 'torus':g=primitives.torus({innerRadius:p.radiusTop||1,outerRadius:p.radius,innerSegments:16,outerSegments:64});break;
   case 'polygon':g=extrusions.extrudeLinear({height:p.size[2]},geometries.geom2.fromPoints(p.points));g=transforms.translate([0,0,-p.size[2]/2],g);break;
   case 'text':g=textGeometry(p,fonts);break;
  }
  g=transforms.rotate(p.rotation.map(a=>a*Math.PI/180),g);g=transforms.translate(p.position,g);
  result=result?(p.operation==='add'?booleans.union(result,g):booleans.subtract(result,g)):g;
 }
 if(!result?.polygons?.length)throw new Error('空の形状です。寸法や穴の位置を調整してください。');
 result=modifiers.generalize({snap:true,simplify:true,triangulate:true},result);
 const [min,max]=measurements.measureBoundingBox(result);const dims=max.map((n:number,i:number)=>n-min[i]);
 if(dims.some((d:number)=>d>180.01||d<.1))throw new Error('A1 miniの造形範囲180 × 180 × 180 mmに収まりません。');
 const positions:number[]=[];
 for(const polygon of result.polygons){const vertices=polygon.vertices;for(let i=1;i<vertices.length-1;i++)for(const v of [vertices[0],vertices[i],vertices[i+1]])positions.push(v[0]-(min[0]+max[0])/2,v[1]-(min[1]+max[1])/2,v[2]-min[2]);}
 if(positions.length/9>180000)throw new Error('形状が複雑すぎます。パーツ数を減らしてください。');
 const volume=Math.abs(measurements.measureVolume(result));
 return {positions:new Float32Array(positions),dimensions:dims as [number,number,number],volume,triangles:positions.length/9};
}
export function binarySTL(positions:Float32Array){
 const count=positions.length/9,buffer=new ArrayBuffer(84+count*50),dv=new DataView(buffer);new Uint8Array(buffer).set(new TextEncoder().encode('Katachi / millimeters / base down'));dv.setUint32(80,count,true);
 for(let i=0;i<count;i++){const o=84+i*50,k=i*9;const a=[positions[k],positions[k+1],positions[k+2]],b=[positions[k+3],positions[k+4],positions[k+5]],c=[positions[k+6],positions[k+7],positions[k+8]];const u=b.map((n,j)=>n-a[j]),v=c.map((n,j)=>n-a[j]);const n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],len=Math.hypot(...n)||1;for(let j=0;j<3;j++)dv.setFloat32(o+j*4,n[j]/len,true);for(let j=0;j<9;j++)dv.setFloat32(o+12+j*4,positions[k+j],true);}
 return new Uint8Array(buffer);
}
