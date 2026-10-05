import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, updateDoc, deleteDoc, collection, query, where, orderBy, getDocs, runTransaction } from 'firebase/firestore';
import { ref, uploadBytes, getBytes } from 'firebase/storage';

let environment;
const id='00000000-0000-4000-8000-000000000001';
const record={id,ownerUid:'alice',revision:1,deleted:false,title:'Lecture',markdown:'# Lecture',notes:'Notes',transcript:[],createdAt:'2026-10-04T00:00:00Z',updatedAt:'2026-10-04T00:00:00Z'};
const member=uid=>environment.authenticatedContext(uid,{firebase:{sign_in_provider:'google.com'}});
const guest=()=>environment.authenticatedContext('guest',{firebase:{sign_in_provider:'anonymous'}});
before(async()=>{
  environment=await initializeTestEnvironment({projectId:'demo-lecturemind',firestore:{host:'127.0.0.1',port:8080,rules:fs.readFileSync('firestore.rules','utf8')},storage:{host:'127.0.0.1',port:9199,rules:fs.readFileSync('storage.rules','utf8')}});
  await environment.withSecurityRulesDisabled(async context=>{
    await setDoc(doc(context.firestore(),'mindmaps',id),record);
    await uploadBytes(ref(context.storage(),'users/alice/lectures/owned/media.mp3'),new Uint8Array([1,2,3]));
  });
});
after(async()=>{await environment?.cleanup();});
test('Firestore owner-only reads; guest, other user and global collection queries denied',async()=>{
  await assertSucceeds(getDoc(doc(member('alice').firestore(),'mindmaps',id)));
  await assertFails(getDoc(doc(member('bob').firestore(),'mindmaps',id)));
  await assertFails(getDoc(doc(guest().firestore(),'mindmaps',id)));
  await assertFails(getDoc(doc(environment.unauthenticatedContext().firestore(),'mindmaps',id)));
  await assertFails(getDocs(collection(member('alice').firestore(),'mindmaps')));
  const owned=query(collection(member('alice').firestore(),'mindmaps'),where('ownerUid','==','alice'),orderBy('createdAt','desc'));
  const result=await assertSucceeds(getDocs(owned));assert.equal(result.docs.length,1);
});
test('record creation cannot forge owners or omit valid identity/revision fields',async()=>{
  const newId='00000000-0000-4000-8000-000000000002';
  const ownerRef=doc(member('alice').firestore(),'mindmaps',newId);
  await assertFails(setDoc(ownerRef,{...record,id:newId,ownerUid:'bob'}));
  await assertFails(setDoc(ownerRef,{...record,id:newId,revision:0}));
  await assertFails(setDoc(ownerRef,{...record,id:'wrong'}));
  await assertFails(setDoc(doc(guest().firestore(),'mindmaps',newId),{...record,id:newId,ownerUid:'guest'}));
  await assertSucceeds(setDoc(ownerRef,{...record,id:newId}));
});
test('members can transactionally read a missing UUID and create their own record; guests cannot read missing records',async()=>{
  const newId='00000000-0000-4000-8000-000000000003';
  const firestore=member('alice').firestore();
  const ownerRef=doc(firestore,'mindmaps',newId);
  await assertFails(getDoc(doc(guest().firestore(),'mindmaps',newId)));
  await assertFails(getDoc(doc(environment.unauthenticatedContext().firestore(),'mindmaps',newId)));
  await assertSucceeds(runTransaction(firestore,async transaction=>{
    const snapshot=await transaction.get(ownerRef);
    assert.equal(snapshot.exists(),false);
    transaction.set(ownerRef,{...record,id:newId});
  }));
  await assertFails(getDoc(doc(member('bob').firestore(),'mindmaps',newId)));
  await assertFails(getDocs(collection(member('bob').firestore(),'mindmaps')));
  await assertFails(getDocs(query(collection(member('bob').firestore(),'mindmaps'),where('ownerUid','==','alice'))));
  const owned=query(collection(firestore,'mindmaps'),where('ownerUid','==','alice'));
  const result=await assertSucceeds(getDocs(owned));
  assert.ok(result.docs.some(snapshot=>snapshot.id===newId));
});
test('only exact revision advancement permitted; identity, owner and creation time immutable',async()=>{
  const ownerRef=doc(member('alice').firestore(),'mindmaps',id);
  await assertFails(updateDoc(ownerRef,{revision:1,notes:'Stale'}));
  await assertFails(updateDoc(ownerRef,{revision:3,notes:'Skipped'}));
  await assertFails(updateDoc(ownerRef,{revision:2,ownerUid:'bob'}));
  await assertFails(updateDoc(ownerRef,{revision:2,id:'changed'}));
  await assertFails(updateDoc(ownerRef,{revision:2,createdAt:'changed'}));
  await assertSucceeds(updateDoc(ownerRef,{revision:2,notes:'Saved',updatedAt:'2026-10-04T00:01:00Z'}));
  await assertFails(updateDoc(doc(member('bob').firestore(),'mindmaps',id),{revision:3,notes:'Foreign'}));
  await assertSucceeds(updateDoc(ownerRef,{revision:3,deleted:true}));
  await assertFails(deleteDoc(ownerRef));
});
test('server jobs, quotas, budgets and uploads are inaccessible to all client identities',async()=>{
  for(const name of ['lmJobs','lmQuotas','lmBudgets','lmUploads']){
    await assertFails(setDoc(doc(member('alice').firestore(),name,'record'),{ownerUid:'alice',count:0}));
    await assertFails(getDoc(doc(member('alice').firestore(),name,'record')));
  }
});
test('Storage allows member owner reads only and no browser object writes',async()=>{
  const path='users/alice/lectures/owned/media.mp3';
  await assertSucceeds(getBytes(ref(member('alice').storage(),path)));
  await assertFails(getBytes(ref(member('bob').storage(),path)));
  await assertFails(getBytes(ref(guest().storage(),path)));
  await assertFails(uploadBytes(ref(member('alice').storage(),'users/alice/lectures/owned/new.mp3'),new Uint8Array([1])));
  await assertFails(uploadBytes(ref(member('bob').storage(),path),new Uint8Array([1])));
});
