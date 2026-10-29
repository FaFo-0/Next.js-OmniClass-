"use client";
import { useState } from "react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@convex";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { PublicPlanCard } from "./PublicPlanCard";
import { offerForPack } from "../../../convex/lib/pricingCatalogue";
import { packSaleEnd, editBenefit, moveBenefit, type EditorLanguage, type FamilyRow, type PackForm } from "./packEditorModel";

const languages = [{code:"en",label:"English"},{code:"ru",label:"Русский"},{code:"kk",label:"Қазақша"}] as const;
export function PackFormDialog({ form, families, busy, onChange, onClose, onSave }: {
 form:PackForm; families:FamilyRow[]; busy:boolean; onChange:(form:PackForm)=>void; onClose:()=>void; onSave:()=>void;
}) {
 const [language,setLanguage]=useState<EditorLanguage>("en");
 const [view,setView]=useState<"edit"|"preview">("edit");
 const [currency,setCurrency]=useState("USD");
 const fx=useQuery(api.currencies.publicSettings,{});
 const launch=useQuery(api.tenantSettings.getPublicLaunchInfo);
 const family=families.find(row=>row._id===form.familyId);
 const field=language==="en" ? "nameEn" : language==="ru" ? "nameRu" : "nameKk";
 const name=language==="en" ? form.nameEn || form.name : form[field];
 const text=(row:PackForm["benefits"][number], lang:EditorLanguage)=>lang==="en" ? row.en ?? row.default : row[lang] ?? "";
 const saleEndsAt=packSaleEnd(form.saleEndsAt);
 const currencies=fx?.enabledCurrencies ?? ["USD","KZT"];
 const previewCurrency=currencies.includes(currency) ? currency : "USD";
 let offer;
 try {
  if(family) offer=offerForPack(family,{...form,_id:form.id ?? "preview",lessons:Number(form.lessons)||0,price:Number(form.price)||0,currency:"USD",salePercent:form.salePercent ? Number(form.salePercent):undefined,salePrice:undefined,saleEndsAt,expiryDays:Number(form.expiryDays)||0,sortOrder:0,isArchived:false},language,new Date().toISOString(),previewCurrency,fx?.rates);
 } catch { /* Incomplete inputs should not break the editor. */ }
 const missing=(lang:EditorLanguage)=>Number(!(lang==="en" ? form.nameEn || form.name : form[lang==="ru" ? "nameRu":"nameKk"]).trim())+form.benefits.filter(row=>!text(row,lang).trim()).length;
 const canSave=form.name.trim() && form.familyId && form.price!=="" && Number.isFinite(Number(form.price)) && Number(form.price)>=0 && Number.isInteger(Number(form.lessons)) && Number(form.lessons)>0 && Number.isInteger(Number(form.expiryDays)) && Number(form.expiryDays)>0 && (!form.salePercent || Number(form.salePercent)>0 && Number(form.salePercent)<=100) && (!form.saleEndsAt || saleEndsAt) && Object.values(form.fixedPrices).every(value=>Number.isFinite(value)&&value>=0) && form.benefits.every(row=>row.default.trim());
 return <Dialog open onOpenChange={open=>{if(!open&&!busy)onClose();}}>
  <DialogContent style={{height:"min(90dvh, 900px)",maxHeight:"calc(100dvh - 2rem)",width:"calc(100vw - 2rem)",maxWidth:1120,display:"flex",flexDirection:"column",padding:0,gap:0,overflow:"hidden"}}>
   <DialogHeader className="shrink-0 border-b px-5 py-4 pe-12"><DialogTitle>{form.id ? "Edit pack":"New pack"}</DialogTitle><DialogDescription>Details, prices and translations shown on your website.</DialogDescription></DialogHeader>
   <div className="flex shrink-0 gap-2 border-b px-5 py-2 lg:hidden"><Button size="sm" variant={view==="edit"?"default":"outline"} onClick={()=>setView("edit")}>Edit</Button><Button size="sm" variant={view==="preview"?"default":"outline"} onClick={()=>setView("preview")}>Preview</Button></div>
   <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5" style={{overflowX:"hidden"}}>
    <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
     <div className={`${view==="edit" ? "block":"hidden"} min-w-0 space-y-5 lg:block`}>
      <section className="space-y-3"><h3 className="font-semibold">Pack details</h3><label className="grid gap-1 text-sm">Family<select className="input" value={form.familyId} onChange={e=>onChange({...form,familyId:e.target.value})}><option value="">Choose family</option>{families.map(row=><option key={row._id} value={row._id}>{row.label}</option>)}</select></label>
       <div role="tablist" aria-label="Editor language" className="flex flex-wrap gap-2">{languages.map(lang=><button key={lang.code} type="button" role="tab" aria-selected={language===lang.code} className={`rounded-lg border px-3 py-2 text-sm ${language===lang.code ? "border-purple-600 bg-purple-50 font-semibold text-purple-900":"border-gray-200"}`} onClick={()=>setLanguage(lang.code)}>{lang.label}{missing(lang.code)>0 && <span className="ms-1 text-xs text-gray-500">· {missing(lang.code)} missing</span>}</button>)}</div>
       <label className="grid gap-1 text-sm">Pack name · {languages.find(l=>l.code===language)?.label}<Input value={name} placeholder={language==="en" ? "e.g. 8 lessons":"Translation (optional)"} onChange={e=>onChange(language==="en"?{...form,name:e.target.value,nameEn:e.target.value}:{...form,[field]:e.target.value})} /></label>
       <div className="grid grid-cols-2 gap-3"><label className="grid gap-1 text-sm">Lessons<Input type="number" min="1" value={form.lessons} onChange={e=>onChange({...form,lessons:e.target.value})}/></label><label className="grid gap-1 text-sm">Validity (days)<Input type="number" min="1" value={form.expiryDays} onChange={e=>onChange({...form,expiryDays:e.target.value})}/></label></div>
       <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isVisible} onChange={e=>onChange({...form,isVisible:e.target.checked})}/>Available to students</label>
      </section>
      <section className="space-y-3 border-t pt-4"><h3 className="font-semibold">Pricing and sale</h3><label className="grid gap-1 text-sm">Regular price · USD<Input type="number" min="0" step="0.01" value={form.price} onChange={e=>onChange({...form,price:e.target.value})}/></label>
       <div className="grid grid-cols-2 gap-3"><label className="grid gap-1 text-sm">Sale (%)<Input type="number" min="0.01" max="100" step="0.01" placeholder="No sale" value={form.salePercent} onChange={e=>onChange({...form,salePercent:e.target.value})}/></label><label className="grid gap-1 text-sm">Sale ends (optional)<Input type="date" value={form.saleEndsAt} onChange={e=>onChange({...form,saleEndsAt:e.target.value})}/></label></div>
       <p className="text-xs text-gray-500">The sale percentage applies to each currency’s price.</p>
       {currencies.some(code=>code!=="USD") && <details className="rounded-xl border p-3"><summary className="cursor-pointer text-sm font-semibold">Local prices</summary><p className="mt-2 text-xs text-gray-500">Leave blank for automatic conversion.</p>{currencies.filter(code=>code!=="USD").map(code=><label key={code} className="mt-3 grid gap-1 text-sm">{code} · {form.fixedPrices[code]==null ? "Automatic":"Fixed price"}<Input type="number" min="0" step="any" placeholder="Automatic" value={form.fixedPrices[code] ?? ""} onChange={e=>{const fixedPrices={...form.fixedPrices};if(e.target.value==="")delete fixedPrices[code];else fixedPrices[code]=Number(e.target.value);onChange({...form,fixedPrices});}}/></label>)}</details>}
      </section>
      <section className="space-y-3 border-t pt-4"><div className="flex items-baseline justify-between gap-2"><h3 className="font-semibold">Benefits</h3><span className="text-xs text-gray-500">{languages.find(l=>l.code===language)?.label}</span></div><p className="text-xs text-gray-500">One benefit per row. Switch language above to translate; order is shared.</p>
       {form.benefits.map((benefit,index)=><div key={index} className="rounded-xl border p-3"><div className="mb-2 flex items-center justify-between gap-2"><span className="text-xs font-semibold text-gray-500">Benefit {index+1}</span><div className="flex gap-1"><button type="button" className="rounded px-2 py-1 text-sm disabled:opacity-30" disabled={index===0} aria-label={`Move benefit ${index+1} up`} onClick={()=>onChange({...form,benefits:moveBenefit(form.benefits,index,-1)})}>↑</button><button type="button" className="rounded px-2 py-1 text-sm disabled:opacity-30" disabled={index===form.benefits.length-1} aria-label={`Move benefit ${index+1} down`} onClick={()=>onChange({...form,benefits:moveBenefit(form.benefits,index,1)})}>↓</button><button type="button" className="rounded px-2 py-1 text-xs text-red-700" onClick={()=>onChange({...form,benefits:form.benefits.filter((_,i)=>i!==index)})}>Remove</button></div></div><Textarea rows={2} aria-label={`Benefit ${index+1} ${language}`} placeholder={language==="en" ? "Benefit description":"Translation (optional)"} value={text(benefit,language)} onChange={e=>onChange({...form,benefits:editBenefit(form.benefits,index,language,e.target.value)})}/>{!benefit.default.trim() && <p className="mt-1 text-xs text-amber-800">Add English text before saving.</p>}</div>)}
       <Button variant="outline" size="sm" onClick={()=>onChange({...form,benefits:[...form.benefits,{default:"",en:"",ru:"",kk:""}]})}>Add benefit</Button>
      </section>
     </div>
     <aside className={`${view==="preview" ? "block":"hidden"} min-w-0 lg:block`}><div className="lg:sticky lg:top-0"><div className="mb-3 flex items-center justify-between gap-2"><h3 className="font-semibold">Preview</h3><select className="input" style={{width:"auto"}} aria-label="Preview language" value={language} onChange={e=>setLanguage(e.target.value as EditorLanguage)}>{languages.map(lang=><option key={lang.code} value={lang.code}>{lang.label}</option>)}</select><select className="input" style={{width:"auto"}} aria-label="Preview currency" value={previewCurrency} onChange={e=>setCurrency(e.target.value)}>{currencies.map(code=><option key={code}>{code}</option>)}</select></div><div lang={language}>{offer ? <PublicPlanCard offer={offer} locale={language} primaryHref="/sign-up" whatsappUrl={launch?.supportWhatsappUrl} preview/>:<p className="rounded-xl border p-4 text-sm text-gray-500">Choose a family to preview this pack.</p>}</div></div></aside>
    </div>
   </div>
   <DialogFooter style={{margin:0}} className="shrink-0 border-t bg-white px-5 py-3"><Button variant="outline" disabled={busy} onClick={onClose}>Cancel</Button><Button disabled={busy||!canSave} onClick={onSave}>{busy?"Saving…":"Save pack"}</Button></DialogFooter>
  </DialogContent>
 </Dialog>;
}
