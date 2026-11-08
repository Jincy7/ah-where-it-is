import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { loadEnvFile } from "node:process";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import sharp from "sharp";
import type { StorageAction } from "../src/lib/storage/types";

test("storage actions: ownership, confirmation, revisions, idempotency, stale content and private shared photos", { skip: process.env.RUN_STORAGE_INTEGRATION !== "1" }, async () => {
  loadEnvFile(".env.local");
  const url = process.env.SUPABASE_URL!;
  const app = process.env.TEST_APP_URL ?? "http://localhost:4201";
  assert.ok(["localhost","127.0.0.1"].includes(new URL(url).hostname));
  assert.ok(["localhost","127.0.0.1"].includes(new URL(app).hostname));
  const admin = createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}});
  const users: string[] = [];
  async function account() {
    const email = `storage-test-${randomUUID()}@example.com`, password = randomUUID();
    const created = await admin.auth.admin.createUser({email,password,email_confirm:true});
    assert.ifError(created.error); const id = created.data.user!.id; users.push(id);
    const cookies: {name:string;value:string}[] = [];
    const client = createServerClient(url,process.env.SUPABASE_ANON_KEY!,{cookies:{getAll:()=>cookies,setAll:(values)=>{for(const value of values){const i=cookies.findIndex((c)=>c.name===value.name);if(i>=0)cookies[i]=value;else cookies.push(value);}}}});
    assert.ifError((await client.auth.signInWithPassword({email,password})).error);
    const cookie = cookies.map((c)=>`${c.name}=${c.value}`).join("; ");
    const request = (path:string,init:RequestInit={})=>fetch(app+path,{...init,headers:{cookie,origin:app,...init.headers}});
    const json = (path:string,body:unknown)=>request(path,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});
    async function prepare(type:string,payload:Record<string,unknown>,extra:Record<string,unknown>={}):Promise<StorageAction>{
      const r=await json("/api/storage/actions",{type,payload,...extra});const data=await r.json();assert.equal(r.status,200,JSON.stringify(data));return data.action;
    }
    const confirm = (action:StorageAction)=>json(`/api/storage/actions/${action.action_id}/confirm`,{revision:action.revision,payload_hash:action.payload_hash,idempotency_key:action.idempotency_key});
    async function execute(type:string,payload:Record<string,unknown>){const action=await prepare(type,payload);const response=await confirm(action);const result=await response.json();assert.equal(response.status,200,JSON.stringify(result));return result.receipt.result;}
    return {id,client,request,json,prepare,confirm,execute};
  }
  try {
    const a=await account(),b=await account();
    const location=await a.execute("create_location",{name:"작업방"});
    const source=await a.execute("create_container",{name:"공구함",location_id:location.id});
    const target=await a.execute("create_container",{name:"책상 서랍"});
    assert.equal((await fetch(app+"/api/storage")).status,401);
    assert.equal((await b.json("/api/storage/actions",{type:"delete_container",payload:{container_id:source.id}})).status,404);
    assert.equal((await a.request("/api/storage/actions",{method:"POST",headers:{origin:"https://evil.example"},body:"{}"})).status,403);
    const initial=await a.prepare("register_items",{container_id:source.id,items:[{name:"검은색 USB-C 충전기",quantity:2,description:"USB-C"}]});
    assert.equal((await a.client.from("items").select("*")).data?.length,0,"prepare must not mutate items");
    assert.ok((await a.client.from("storage_actions").select("*")).error,"actions may not be edited directly");
    assert.equal((await b.confirm(initial)).status,404);
    const nullConfirmation = await a.client.rpc("confirm_storage_action",{p_action_id:initial.action_id,p_revision:null,p_payload_hash:null,p_idempotency_key:null});
    assert.ok(nullConfirmation.error,"direct authenticated RPC must reject null approval tokens");
    assert.equal(nullConfirmation.error?.code,"PT409");
    assert.equal((await a.client.from("items").select("*")).data?.length,0);

    const confirmations=await Promise.all([a.confirm(initial),a.confirm(initial),a.confirm(initial)]);
    const saved=await Promise.all(confirmations.map(async(r)=>{const data=await r.json();assert.equal(r.status,200,JSON.stringify(data));return data;}));
    const item=saved[0].receipt.result[0];
    assert.equal(saved[1].receipt.result[0].id,item.id);
    assert.equal((await a.client.from("items").select("*")).data?.length,1);
    const move=await a.prepare("move_item",{item_id:item.id,container_id:target.id});
    const corrected=await a.prepare("move_item",{item_id:item.id,container_id:source.id},{action_id:move.action_id,revision:move.revision});
    assert.equal((await a.confirm(move)).status,409,"old revision must not execute");
    assert.equal((await a.json(`/api/storage/actions/${corrected.action_id}/cancel`,{revision:corrected.revision})).status,200);
    assert.equal((await a.confirm(corrected)).status,409);
    const stale=await a.prepare("update_item",{item_id:item.id,name:"흰색 충전기",quantity:2});
    assert.ifError((await a.client.from("items").update({quantity:3}).eq("id",item.id)).error);
    assert.equal((await a.confirm(stale)).status,409,"manual edit invalidates AI proposal");
    for (let round=0;round<3;round++) {
      const concurrent=await a.prepare("update_item",{item_id:item.id,name:"검은색 USB-C 충전기",quantity:3});
      const [approve,legacy]=await Promise.all([
        a.confirm(concurrent),
        a.json("/api/items/bulk",{container_id:source.id,request_id:randomUUID(),items:[{name:`동시 등록 ${round}`,quantity:1}]}),
      ]);
      const approveText=await approve.text(),legacyText=await legacy.text();
      assert.ok([200,409].includes(approve.status),`legacy/concurrent confirmation: ${approve.status} ${approveText}`);
      assert.equal(legacy.status,200,legacyText);
    }
    const deletion=await a.prepare("delete_container",{container_id:source.id});
    assert.ifError((await a.client.from("items").insert({container_id:source.id,name:"새 물품",quantity:1})).error);
    assert.equal((await a.confirm(deletion)).status,409,"new content invalidates cascade approval");
    const scoped=await (await a.request(`/api/storage/search?q=충전기&container_id=${target.id}`)).json();
    assert.equal(scoped.items.length,0);
    const global=await (await a.request("/api/storage/search?q=충전기")).json();
    assert.equal(global.items.length,1);assert.equal(global.items[0].location_name,"작업방");
    const words=await (await a.request("/api/storage/search?q="+encodeURIComponent("검은색 충전기"))).json();
    assert.equal(words.items.length,1,"all query words match despite additional words in the name");
    for (const term of ['x),name.neq.x','a"b','a\\b','%','_']) assert.equal((await a.request('/api/storage/search?q='+encodeURIComponent(term))).status,200);

    assert.equal((await a.request('/api/storage/search?q='+encodeURIComponent('x),name.neq.x'))).status,200,"search punctuation is data");
    const photo=await sharp({create:{width:10,height:10,channels:3,background:"white"}}).jpeg().toBuffer();
    const uploaded=await a.request("/api/storage/media",{method:"POST",headers:{"content-type":"image/jpeg"},body:new Uint8Array(photo)});
    const mediaBody=await uploaded.json();assert.equal(uploaded.status,200,JSON.stringify(mediaBody));const media=mediaBody.media;
    assert.equal((await b.json("/api/storage/actions",{type:"register_items",payload:{container_id:source.id,items:[{name:"침입",quantity:1,media_ids:[media.id]}]}})).status,404);
    const bContainer=await b.execute("create_container",{name:"B 보관함"});
    assert.equal((await b.json("/api/storage/actions",{type:"register_items",payload:{container_id:bContainer.id,items:[{name:"침입",quantity:1,media_ids:[media.id]}]}})).status,404);
    const shared=await a.execute("register_items",{container_id:source.id,items:[{name:"사진 물품 1",quantity:1,media_ids:[media.id]},{name:"사진 물품 2",quantity:1,media_ids:[media.id]}]});
    assert.equal((await a.client.from("item_media").select("*").eq("media_id",media.id)).data?.length,2);
    await a.execute("delete_item",{item_id:shared[0].id});
    assert.equal((await a.client.from("item_media").select("*").eq("media_id",media.id)).data?.length,1);
    assert.equal((await a.client.from("media_assets").select("*").eq("id",media.id)).data?.length,1);
    assert.equal((await b.client.from("media_assets").select("*").eq("id",media.id)).data?.length,0);
    assert.equal((await admin.storage.getBucket("item-images")).data?.public,false);
    const oldDate=new Date(Date.now()-48*3600*1000).toISOString();
    assert.ifError((await admin.from("media_assets").update({updated_at:oldDate}).eq("id",media.id)).error);
    assert.equal((await a.request("/api/storage/media",{method:"DELETE"})).status,200);
    assert.equal((await a.client.from("media_assets").select("*").eq("id",media.id)).data?.length,1,"shared photo survives cleanup");
    await a.execute("delete_item",{item_id:shared[1].id});
    assert.ifError((await admin.from("media_assets").update({updated_at:oldDate}).eq("id",media.id)).error);
    assert.equal((await a.request("/api/storage/media",{method:"DELETE"})).status,200);
    assert.equal((await a.client.from("media_assets").select("*").eq("id",media.id)).data?.length,0,"unreferenced photo cleaned after grace period");
    const foreignLocation=await b.execute("create_location",{name:"B 장소"});
    assert.ok((await a.client.from("containers").insert({name:"잘못된 장소",user_id:a.id,location_id:foreignLocation.id})).error);
    const deleteLocation=await a.prepare("delete_location",{location_id:location.id});
    await a.execute("create_container",{name:"새 연결",location_id:location.id});
    assert.equal((await a.confirm(deleteLocation)).status,409,"location impact must be reviewed again");
    const ws=await (await a.request("/api/storage")).json();assert.ok(Array.isArray(ws.items));assert.ok(Array.isArray(ws.containers));
    console.log("PASS storage: prepare-only, owner isolation, CAS, revision, cancel, concurrent retry receipt, content race, escaped search, private shared media and cleanup");
  } finally {
    for(const id of users) {
      const assets=await admin.from("media_assets").select("path").eq("user_id",id);
      if(assets.data?.length) await admin.storage.from("item-images").remove(assets.data.map((m)=>m.path));
      assert.ifError((await admin.auth.admin.deleteUser(id)).error);
    }
  }
});
