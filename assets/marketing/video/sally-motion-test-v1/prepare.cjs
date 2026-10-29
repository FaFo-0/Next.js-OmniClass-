const path=require('path'),fs=require('fs'),sharp=require('sharp');
const base=__dirname,repo=path.resolve(base,'../../../..'),screensOriginal=path.join(repo,'assets/marketing/screenshots/2026-10-21/phone');
const screens=fs.existsSync(screensOriginal)?screensOriginal:path.join(repo,'assets/marketing/instagram/introduction-carousel-ru-v1/originals');
(async()=>{
 const crops=[
  ['15-my-words-ru.jpg','vocabulary.png',{left:10,top:60,width:370,height:500}],
  ['10-flashcard-front-ru.jpg','card-front.png',{left:10,top:175,width:370,height:255}],
  ['11-flashcard-answer-ru.jpg','card-back.png',{left:10,top:175,width:370,height:255}],
  ['16-homework-reviewed-ru.jpg','homework.png',{left:10,top:60,width:370,height:600}]
 ];
 for(const [src,dest,box] of crops){await sharp(path.join(screens,src)).extract(box).png().toFile(path.join(base,'public',dest));}
 fs.copyFileSync(path.join(repo,'public/brand/tenant/lockup-light.svg'),path.join(base,'public/logo.svg'));
 console.log('Prepared four crops from original screenshots and original vector logo.');
})();
