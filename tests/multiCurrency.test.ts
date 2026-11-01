import test from 'node:test';
import assert from 'node:assert/strict';
import { offerForPack } from '../convex/lib/pricingCatalogue';
import { parseDailyRates } from '../convex/currencyRates';
const family = { _id: 'f', label: 'Lessons', sortOrder: 0, isVisible: true, isArchived: false };
const pack = { _id: 'p', familyId: 'f', name: 'Eight', lessons: 8, currency: 'USD', price: 100, salePrice: 80, expiryDays: 60, benefits: [], sortOrder: 0, isVisible: true, isArchived: false };
test('local fixed prices receive the same sale percentage as USD and never mutate source', () => {
 const source = {...pack, fixedPrices: {KZT: 49900}};
 const offer = offerForPack(family, source, 'en', new Date().toISOString(), 'KZT', {USD:500});
 assert.equal(offer.listPrice,49900); assert.equal(offer.netPrice,39920); assert.equal(source.price,100);
});
test('automatic local prices and discounts resolve together', () => {
 const offer = offerForPack(family,pack,'en',new Date().toISOString(),'KGS',{USD:500,KGS:5});
 assert.equal(offer.listPrice,10000); assert.equal(offer.netPrice,8000);
 assert.throws(()=>offerForPack(family,pack,'en',new Date().toISOString(),'ABC',{USD:500}));
});
test('daily feed normalizes provider units and rejects stale or invalid data',()=>{
 const value={result:'success',base_code:'USD',time_last_update_unix:Math.floor(Date.now()/1000),rates:{USD:1,KZT:500,KGS:100}};
 assert.equal(parseDailyRates(value).rates.KGS,5);
 assert.throws(()=>parseDailyRates({...value,rates:{USD:1,KZT:0}}));
 assert.throws(()=>parseDailyRates({...value,time_last_update_unix:1}));
});

test('three-decimal currencies keep their monetary precision', async()=>{
 const {convertMoney}=await import('../convex/lib/money');
 assert.equal(convertMoney(1,'USD','BHD',{USD:500,BHD:500/0.376}),0.376);
 assert.equal(convertMoney(1,'USD','JPY',{USD:500,JPY:500/150.6}),151);
});

test('explicit sale percent survives rounded USD prices and fixed local prices',()=>{
 for (const [price,salePrice,local,expected] of [[122.88,98.30,56000,44800],[171.15,136.92,78000,62400],[315.97,252.78,144000,115200]]) {
  const offer = offerForPack(family,{...pack,price,salePrice,salePercent:20,fixedPrices:{KZT:local}},'en',new Date().toISOString(),'KZT',{USD:455.738109});
  assert.equal(offer.netPrice,expected);
  assert.equal(offer.salePercent,20);
 }
});

test('percentage-only sales validate their expiry and stop on time',async()=>{
 const {validatePackPricing}=await import('../convex/lib/pricing');
 assert.throws(()=>validatePackPricing({price:100,salePercent:20,saleEndsAt:'invalid'}),/Sale end date/);
 const expired=offerForPack(family,{...pack,salePercent:20,saleEndsAt:'2020-01-01T00:00:00Z',fixedPrices:{KZT:56000}},'en',new Date().toISOString(),'KZT',{USD:500});
 assert.equal(expired.onSale,false); assert.equal(expired.netPrice,56000);
});

test('each currency can override, disable or inherit the default sale independently',()=>{
 const now='2026-11-01T12:00:00Z';
 const source={...pack,salePercent:20,fixedPrices:{KZT:50000,SAR:400},currencySales:{KZT:{salePrice:35000,saleEndsAt:'2026-12-01T00:00:00Z'},SAR:{disabled:true}}};
 const kzt=offerForPack(family,source,'en',now,'KZT');
 assert.equal(kzt.listPrice,50000);assert.equal(kzt.netPrice,35000);assert.ok(Math.abs((kzt.salePercent ?? 0)-30)<1e-8);
 const sar=offerForPack(family,source,'en',now,'SAR');
 assert.equal(sar.netPrice,400);assert.equal(sar.onSale,false);
 const usd=offerForPack(family,source,'en',now,'USD');assert.equal(usd.netPrice,80);
 const expired=offerForPack(family,source,'en','2026-12-02T00:00:00Z','KZT');
 assert.equal(expired.netPrice,50000);assert.equal(expired.onSale,false);
 const independent=offerForPack(family,{...source,saleEndsAt:'2026-01-01T00:00:00Z'},'en',now,'KZT');assert.equal(independent.netPrice,35000);
});

test('SAR local sale prices retain their currency minor units',()=>{
 const offer=offerForPack(family,{...pack,fixedPrices:{SAR:400},currencySales:{SAR:{salePrice:199.95}}},'ar',new Date().toISOString(),'SAR');
 assert.equal(offer.listPrice,400);assert.equal(offer.netPrice,199.95);
});
