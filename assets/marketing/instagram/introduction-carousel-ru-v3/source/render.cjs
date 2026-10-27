const sharp=require('sharp'),fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..');
(async()=>{
 const thumbs=[];
 for(let i=1;i<=7;i++){
  const n=String(i).padStart(2,'0'), input=path.join(root,'editable',n+'-slide.svg');
  await sharp(input).png().toFile(path.join(root,'exports',n+'-slide.png'));
  thumbs.push({input:await sharp(input).resize(324,405).png().toBuffer(),left:24+((i-1)%4)*348,top:24+Math.floor((i-1)/4)*429});
 }
 await sharp({create:{width:1416,height:882,channels:3,background:'#E9E1EC'}}).composite(thumbs).png().toFile(path.join(root,'carousel-preview.png'));
 console.log('Rendered 7 PNGs at 1080x1350 and contact sheet.');
})();
