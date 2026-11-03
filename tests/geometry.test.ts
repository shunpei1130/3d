import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as opentype from 'opentype.js';
import {compile,binarySTL,Fonts} from '../lib/geometry';
import {tray,pencil,cable,validateDesign,part,Design} from '../lib/design';
function font(name:string){const b=readFileSync(`public/fonts/${name}.ttf`);return opentype.parse(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength) as ArrayBuffer)}
const fonts:Fonts={script:font('script'),sans:font('sans')};
function volumeFromTriangles(p:Float32Array){let v=0;for(let i=0;i<p.length;i+=9)v+=(p[i]*(p[i+4]*p[i+8]-p[i+5]*p[i+7])+p[i+1]*(p[i+5]*p[i+6]-p[i+3]*p[i+8])+p[i+2]*(p[i+3]*p[i+7]-p[i+4]*p[i+6]))/6;return v;}
for(const [design,expected] of [[tray,[100,70,60]],[pencil,[65,65,90]],[cable,[100,28,15]]] as const){
 test(`${design.name}: geometry and STL agree`,()=>{const mesh=compile(design as Design,fonts);mesh.dimensions.forEach((v,i)=>assert.ok(Math.abs(v-expected[i])<.02));assert.ok(mesh.triangles>10);assert.ok(mesh.positions.every(Number.isFinite));assert.ok(volumeFromTriangles(mesh.positions)>0);assert.ok(Math.abs(volumeFromTriangles(mesh.positions)-mesh.volume)/mesh.volume<.001);const stl=binarySTL(mesh.positions);assert.equal(stl.length,84+mesh.triangles*50);assert.equal(new DataView(stl.buffer).getUint32(80,true),mesh.triangles);assert.ok(mesh.positions.filter((_,i)=>i%3===2).some(z=>Math.abs(z)<1e-4));});
}
test('engraving removes material and has no protrusions',()=>{const plain=compile({...tray,parts:tray.parts.slice(0,2)},fonts);const engraved=compile(tray,fonts);assert.ok(engraved.volume<plain.volume);engraved.dimensions.forEach((d,i)=>assert.ok(Math.abs(d-plain.dimensions[i])<.001));assert.ok(plain.volume-engraved.volume>5)});
test('script counters preserved: O has a hole',()=>{const d:Design={name:'Text test',description:'',notes:[],parts:[part('text',[50,40,1],[0,0,0],{text:'O',font:'sans'})]};const m=compile(d,fonts);assert.ok(m.volume<50*40*.8);});
test('out of build volume rejected',()=>assert.throws(()=>compile({name:'too large',description:'',notes:[],parts:[part('box',[181,40,40],[0,0,20])]},fonts),/180/));
test('invalid recipes rejected before modeling',()=>{assert.throws(()=>validateDesign({...tray,parts:[{...tray.parts[0],operation:'subtract'}]}));assert.throws(()=>validateDesign({...tray,parts:[part('roundedBox',[2,2,2],[0,0,1],{radius:2})]}));assert.throws(()=>validateDesign({...tray,parts:[part('text',[20,8,1],[0,0,0],{text:'日本語'})]}));});
test('boolean cutter through block produces expected volume',()=>{const mesh=compile({name:'hole',description:'',notes:[],parts:[part('box',[20,20,10],[0,0,5]),part('cylinder',[10,10,12],[0,0,5],{operation:'subtract',radius:5,radiusTop:5})]},fonts);assert.ok(Math.abs(mesh.volume-(4000-Math.PI*25*10))<3);});
