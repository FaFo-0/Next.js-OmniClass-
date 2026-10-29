import test from 'node:test';
import assert from 'node:assert/strict';
import { editBenefit, moveBenefit, packSaleEnd } from '../src/components/billing/packEditorModel';

test('editing one benefit translation preserves the other languages and source rows',()=>{
 const source=[{default:'Live lessons',en:'Live lessons',ru:'Уроки',kk:'Сабақтар'},{default:'Feedback',ru:'Отзывы',kk:'Пікір'}];
 const translated=editBenefit(source,0,'ru','Живые уроки');
 assert.deepEqual(translated[0],{...source[0],ru:'Живые уроки'});
 assert.equal(source[0].ru,'Уроки');
 assert.equal(translated[1],source[1]);
 const english=editBenefit(translated,0,'en','Personal lessons');
 assert.equal(english[0].default,'Personal lessons');assert.equal(english[0].en,'Personal lessons');
 assert.equal(english[0].ru,'Живые уроки');assert.equal(english[0].kk,'Сабақтар');
 const moved=moveBenefit(english,0,1);
 assert.equal(moved[1],english[0]);assert.equal(moved[0],english[1]);
 assert.equal(moveBenefit(source,0,-1),source);
});

test('sale preview and saving use the same academy end of day',()=>{
 assert.equal(packSaleEnd('2026-10-29'),'2026-10-29T18:59:59.999Z');
 assert.equal(packSaleEnd(''),undefined);assert.equal(packSaleEnd('invalid'),undefined);
});

test('signup links retain the selected pack, currency and campaign attribution',async()=>{
 const {createElement}=await import('react');
 const {renderToStaticMarkup}=await import('react-dom/server');
 const {PublicPlanCard}=await import('../src/components/billing/PublicPlanCard');
 const html=renderToStaticMarkup(createElement(PublicPlanCard,{locale:'en',primaryHref:'/sign-up?utm_source=ad&lang=en',whatsappUrl:'https://wa.me/123456789',offer:{packId:'chosen-pack',familyId:'f',familyLabel:'Tutoring',name:'8 lessons',lessons:8,currency:'KZT',listPrice:56000,netPrice:44800,discountAmount:11200,onSale:true,salePercent:20,expiryDays:60,benefits:[]}}));
 assert.match(html,/pack=chosen-pack/); assert.match(html,/currency=KZT/); assert.match(html,/utm_source=ad/);
 assert.match(html,/aria-label="Ask on WhatsApp"/);
});
