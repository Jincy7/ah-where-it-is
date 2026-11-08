import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { actionPayloadSchemas, canonicalJson, changeSchema, confirmationSchema } from "../src/lib/storage/schema";

test("change payloads reject uncertain quantities, foreign fields, and arbitrary confirmation", () => {
  const id = randomUUID();
  for (const quantity of [null,0,-1,1.5,10000]) {
    assert.equal(actionPayloadSchemas.register_items.safeParse({ container_id:id, items:[{name:"케이블",quantity}] }).success,false);
  }
  assert.equal(actionPayloadSchemas.register_items.safeParse({container_id:id,items:[{name:"케이블",quantity:2,media_ids:[randomUUID()]}]}).success,true);
  assert.equal(actionPayloadSchemas.move_item.safeParse({item_id:id,container_id:randomUUID(),confirmed:true}).success,false);
  assert.equal(actionPayloadSchemas.update_item.safeParse({item_id:id,name:"물품",quantity:1,user_id:randomUUID()}).success,false);
  assert.equal(changeSchema.safeParse({type:"delete_item",payload:{item_id:id},action_id:id}).success,false);
  assert.equal(changeSchema.safeParse({type:"delete_item",payload:{item_id:id},revision:2}).success,false);
  assert.equal(confirmationSchema.safeParse({revision:1,payload_hash:"a".repeat(64),idempotency_key:id,payload:{}}).success,false);
});
test("canonical payload hashing preserves array order and ignores object insertion order", () => {
  assert.equal(canonicalJson({b:2,a:{z:0,y:"한글"}}),canonicalJson({a:{y:"한글",z:0},b:2}));
  assert.notEqual(canonicalJson({items:[1,2]}),canonicalJson({items:[2,1]}));
  assert.equal(canonicalJson({a:undefined,b:null}),'{"b":null}');
});
