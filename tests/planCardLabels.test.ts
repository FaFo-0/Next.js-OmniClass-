import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PublicPlanCard } from '../src/components/billing/PublicPlanCard';

function render(name:string,lessons:number,locale:string) {
 return renderToStaticMarkup(createElement(PublicPlanCard,{locale,preview:true,offer:{packId:'p',familyId:'f',familyLabel:'Tutoring',name,lessons,currency:'USD',listPrice:100,netPrice:80,discountAmount:20,onSale:true,expiryDays:60,benefits:[]}}));
}
for (const [locale,name,lessons,expected] of [
 ['ar','12 دروس',12,`${new Intl.NumberFormat('ar').format(12)} درسًا`],
 ['ar','24 دروس',24,`${new Intl.NumberFormat('ar').format(24)} درسًا`],
 ['ar','١٢ دروس',12,`${new Intl.NumberFormat('ar').format(12)} درسًا`],
 ['ar','۲۴ درس',24,`${new Intl.NumberFormat('ar').format(24)} درسًا`],
 ['en','24 lesson',24,'24 lessons'],
 ['ru','12 урока',12,'12 уроков'],
 ['kk','12 сабақтар',12,'12 сабақ'],
] as const) {
 test(`count-only card title ${name} renders once in ${locale}`,()=>{
  const html=render(name,lessons,locale);
  assert.equal(html.match(/<h3\b[^>]*>(.*?)<\/h3>/)?.[1],expected);
  assert.equal(html.split(expected).length-1,1);
 });
}
test('custom pack names remain visible with one separate lesson count',()=>{
 const html=render('Conversation and confidence',12,'en');
 assert.equal(html.match(/<h3\b[^>]*>(.*?)<\/h3>/)?.[1],'Conversation and confidence');
 assert.equal(html.split('12 lessons').length-1,1);
});
