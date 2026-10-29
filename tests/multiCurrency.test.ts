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
