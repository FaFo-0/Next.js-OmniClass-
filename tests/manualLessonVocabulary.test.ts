import assert from "node:assert/strict";
import test from "node:test";
import { replaceVocab } from "../convex/lessonContent";
import { publish } from "../convex/lessons";
import { upsertSavedVocabulary } from "../convex/lib/vocabulary";
import { ACADEMY_ID } from "../convex/lib/tenant";
import type { MutationCtx } from "../convex/_generated/server";
import type { Id } from "../convex/_generated/dataModel";

type Row = Record<string, unknown>;
const lessonId = "lesson" as Id<"lessons">;
const replace = (replaceVocab as unknown as { _handler: (ctx: MutationCtx, args: {lessonId: Id<"lessons">; items: Row[]; generated?: boolean}) => Promise<unknown> })._handler;
const publishLesson = (publish as unknown as { _handler: (ctx: MutationCtx, args: {id: Id<"lessons">}) => Promise<unknown> })._handler;
function fixture() {
  const tables: Record<string, Row[]> = {
    users: [{ _id:"teacher", externalId:"teacher", role:"teacher", organizationId:ACADEMY_ID, tokenIdentifier:"issuer|teacher" }],
    lessons: [{ _id:lessonId, externalId:"lesson-qa", teacherId:"teacher", studentId:"student", organizationId:ACADEMY_ID, status:"transcribed" }],
    lessonTranscriptUtterances: [{ _id:"utterance", lessonId, utteranceId:"u1", text:"I bought a basket at the market.", speaker:"Student", startMs:1200, endMs:4600, transcriptVersion:1 }],
    lessonVocabulary: [], srsCards: [], srsDecks: [], vocabularyOccurrences: [], homework: [],
  };
  let serial = 0;
  const ctx = {
    auth: { async getUserIdentity() { return {tokenIdentifier:"issuer|teacher"}; } },
    db: {
      query(table: string) {
        const filters: Array<[string,unknown]> = [];
        const q = {
          withIndex(_name: string, fn: (b: unknown)=>unknown) { const b={eq(k: string,v:unknown) { filters.push([k,v]); return b; }}; fn(b); return q; },
          filter(fn:(b: unknown)=>unknown) { const result=fn({field:(k:string)=>k,eq:(k:string,v:unknown)=>[k,v]}); filters.push(result as [string,unknown]); return q; },
          async collect() { return structuredClone((tables[table]??[]).filter(r=>filters.every(([k,v])=>r[k]===v))); },
          async unique() { return (await q.collect())[0]??null; },
          async first() { return (await q.collect())[0]??null; },
        }; return q;
      },
      async get(id: string) { return structuredClone(Object.values(tables).flat().find(r=>r._id===id)??null); },
      async patch(id: string, values: Row) { const r=Object.values(tables).flat().find(r=>r._id===id); assert.ok(r); Object.assign(r,values); },
      async insert(table: string, values: Row) { const id=`${table}-${++serial}`; (tables[table]??=[]).push({_id:id,...structuredClone(values)}); return id; },
      async delete(id: string) { for(const rows of Object.values(tables)) { const i=rows.findIndex(r=>r._id===id); if(i>=0) rows.splice(i,1); } },
    },
  } as unknown as MutationCtx;
  return {ctx,tables};
}
const basket = { word:"basket", translation:"корзина", definition:"a container for carrying things", partOfSpeech:"noun", translationLocale:"ru" };

test("four-field manual entry gets its lesson transcript context automatically", async () => {
  const {ctx,tables}=fixture();
  await replace(ctx,{lessonId,items:[basket]});
  const row=tables.lessonVocabulary[0];
  assert.equal(row.lessonId,lessonId); assert.equal(row.lemma,"basket");
  assert.equal(row.utteranceId,"u1"); assert.equal(row.sourceStartMs,1200);
  assert.equal(row.exampleSentence,"I bought a basket at the market.");
  assert.equal(row.definition,basket.definition); assert.equal(row.partOfSpeech,"noun");
});

test("unspoken teacher vocabulary retains the lesson without inventing a recording timestamp", async () => {
  const {ctx,tables}=fixture();
  await replace(ctx,{lessonId,items:[{...basket,word:"shopping bag"}]});
  const row=tables.lessonVocabulary[0];
  assert.equal(row.lessonId,lessonId); assert.equal(row.utteranceId,undefined);
  assert.equal(row.sourceStartMs,undefined); assert.equal(row.exampleSentence,undefined);
  await publishLesson(ctx,{id:lessonId});
  assert.equal(tables.srsCards[0].sourceLessonId,lessonId);
  assert.equal(tables.vocabularyOccurrences[0].sourceType,"live_lesson");
});

test("ordinary edits keep an existing manual candidate's identity after automatic linking", async () => {
  const {ctx,tables}=fixture();
  const externalId="lesson-qa::manual::1::1";
  tables.lessonVocabulary.push({_id:"old",organizationId:ACADEMY_ID,lessonId,externalId,...basket});
  await replace(ctx,{lessonId,items:[{...basket,externalId}]});
  await replace(ctx,{lessonId,items:[{...basket,externalId,utteranceId:"u1",definition:"a woven container"}]});
  assert.equal(tables.lessonVocabulary.length,1);
  assert.equal(tables.lessonVocabulary[0]._id,"old");
  assert.equal(tables.lessonVocabulary[0].utteranceId,"u1");
});

test("manual lesson publication produces the canonical card and merges a reading encounter without resetting study", async () => {
  const {ctx,tables}=fixture();
  await replace(ctx,{lessonId,items:[basket]});
  await publishLesson(ctx,{id:lessonId});
  const card=tables.srsCards[0];
  assert.equal(card.front,"basket"); assert.equal(card.translation,"корзина");
  assert.equal(card.back,`${basket.translation} — ${basket.definition}`);
  assert.equal(card.partOfSpeech,"noun"); assert.equal(card.sourceLessonId,lessonId);
  Object.assign(card,{interval:21,repetitions:8});
  await upsertSavedVocabulary(ctx,ACADEMY_ID,"student",{
    lexeme:{surface:"basket",lemma:"basket",language:"en",partOfSpeech:"noun"},
    sense:{senseId:String(tables.lessonVocabulary[0].senseId),definition:basket.definition},
    translation:basket.translation,translationLocale:"ru",
    occurrence:{sourceType:"library",sourceId:"reading",sentence:"She carried a basket."},addedBy:"self",
  });
  assert.equal(tables.srsCards.length,1);
  assert.equal(card.interval,21); assert.equal(card.repetitions,8);
  assert.equal(tables.vocabularyOccurrences.length,2);
  await publishLesson(ctx,{id:lessonId});
  assert.equal(tables.srsCards.length,1); assert.equal(tables.vocabularyOccurrences.length,2);
});


test("generation resolves invented and wrong sentence IDs, skips unsupported words and duplicates", async () => {
  const {ctx,tables}=fixture();
  tables.lessonTranscriptUtterances.push({_id:"other",lessonId,utteranceId:"other",text:"A different sentence.",transcriptVersion:1});
  await replace(ctx,{lessonId,generated:true,items:[
    {...basket,utteranceId:"invented"},
    {...basket,utteranceId:"u1"},
    {...basket,word:"market",utteranceId:"other"},
    {...basket,word:"hallucinated",utteranceId:"u1"},
  ]});
  assert.equal(tables.lessonVocabulary.length,2);
  for (const row of tables.lessonVocabulary) {
    assert.equal(row.utteranceId,"u1");
    assert.equal(row.exampleSentence,"I bought a basket at the market.");
    assert.equal(row.sourceStartMs,1200);
  }
});

test("unusable generated vocabulary preserves reviewed rows", async () => {
  const {ctx,tables}=fixture();
  await replace(ctx,{lessonId,items:[basket]});
  const before=structuredClone(tables.lessonVocabulary);
  await assert.rejects(replace(ctx,{lessonId,generated:true,items:[{...basket,word:"invented",utteranceId:"missing"}]}), /No generated words matched/);
  assert.deepEqual(tables.lessonVocabulary,before);
});

test("manual edits still reject missing explicit transcript evidence", async () => {
  const {ctx}=fixture();
  await assert.rejects(replace(ctx,{lessonId,items:[{...basket,utteranceId:"missing"}]}), /Transcript utterance not found/);
});
