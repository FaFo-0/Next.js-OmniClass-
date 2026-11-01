const sharp=require('sharp'), fs=require('fs'), path=require('path');
const root=path.resolve(__dirname,'..');
(async()=>{
 const all=fs.readdirSync(path.join(root,'editable')).filter(f=>/^\d\d-/.test(f)).sort();
 const tiles=[];
 for(let i=0;i<all.length;i++){
  const f=all[i], out=path.join(root,'exports',f.replace('.svg','.png'));
  await sharp(path.join(root,'editable',f)).png().toFile(out);
  const info=await sharp(out).metadata();
  if(info.width!==1080||info.height!==1920)throw Error('Wrong dimensions: '+out);
  await sharp(out).resize(360,640).png().toFile(path.join(root,'review',f.replace('.svg','-phone.png')));
  tiles.push({input:await sharp(out).resize(216,384).png().toBuffer(),left:20+i%4*236,top:20+Math.floor(i/4)*404});
 }
 await sharp({create:{width:964,height:1232,channels:3,background:'#DACFE1'}}).composite(tiles).png().toFile(path.join(root,'preview.png'));
 for(let row=0;row<4;row++){
  const list=[];
  for(let c=0;c<3 && row*3+c+1<=11;c++)list.push({input:await sharp(path.join(root,'review',String(row*3+c+1).padStart(2,'0')+'-story-phone.png')).toBuffer(),left:20+c*380,top:20});
  await sharp({create:{width:1160,height:680,channels:3,background:'#DACFE1'}}).composite(list).png().toFile(path.join(root,'review',`phone-review-${row+1}.png`));
 }
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'source','manifest.json')));
 const escape=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
 let html='<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Library — Omnica English — Review</title><style>body{margin:0;background:#FFF9ED;color:#35223E;font:17px/1.6 Arial}main{max-width:1150px;margin:auto;padding:36px}h1,h2{color:#6716A4}section{display:grid;grid-template-columns:360px 1fr;gap:40px;margin:60px 0;border-top:1px solid #EBDDF3;padding-top:30px}img{width:100%;height:auto}small{color:#6716A4}.pair{margin-bottom:24px}.ru{font-weight:bold}.en{margin-top:3px}@media(max-width:800px){section{grid-template-columns:1fr}section img{max-width:360px}}</style><main><h1>Библиотека / Library</h1><p>Eleven Stories covering free reading, choosing texts, word lookup, saved vocabulary, flashcards and chapter continuation, with complete Russian copy and English translations. Cover name: <b>Библиотека</b> means <b>Library</b>.</p><p>Use the PNGs in <code>exports</code> for posting. Individual editable SVGs are in <code>editable</code>. Native Affinity import remains unverified.</p>';
 for(let n=1;n<=11;n++){
  html+=`<section><img alt="Story ${n}" src="exports/${String(n).padStart(2,'0')}-story.png"><div><h2>Story ${n}</h2>`;
  for(const entry of manifest.filter(e=>e.story===n))html+=`<div class="pair"><div class="ru" lang="ru">${escape(entry.ru)}</div><div class="en">${escape(entry.en)}</div></div>`;
  html+='</div></section>';
 }
 html+='<p>Screenshots are real fictional-QA demonstrations. The kitchen reading sequence and the separately labelled buy flashcard are different examples. No current catalogue size or learning outcome is promised.</p><p>Translations of Russian text inside screenshot crops and posting notes: <a href="review/english-and-russian.md">complete copy document</a>.</p></main></html>';
 fs.writeFileSync(path.join(root,'index.html'),html);
 console.log('Rendered twelve 1080×1920 PNGs, individual phone previews, four review strips, contact sheet and bilingual gallery.');
})();
