import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAxis, snapshotGamepad, pollGamepads, renderSyntheticTone } from '../adapters.mjs';

const make = (index=0) => ({
  connected: true, mapping:'standard', index, axes: [0,0,0,0],
  buttons: Array.from({length:17}, ()=>({pressed:false,value:0}))
});
test('unavailable provider and empty gamepad list fall back to disconnected input', () => {
  assert.deepEqual(pollGamepads(undefined), { connected:false,index:-1,moveX:0,moveY:0,
    primary:false,secondary:false,pause:false });
  assert.equal(snapshotGamepad([]).connected,false);
});
test('analog deadzone and extreme value clamping', () => {
  assert.equal(normalizeAxis(0.2), 0);
  assert.equal(normalizeAxis(-0.2), 0);
  assert.equal(normalizeAxis(1),1);
  assert.equal(normalizeAxis(-5),-1);
  assert.equal(normalizeAxis(NaN),0);
  assert.ok(Math.abs(normalizeAxis(0.6,0.2)-0.5) < 1e-12);
  assert.throws(()=>normalizeAxis(0.6,1),/INVALID_DEADZONE/);
  assert.throws(()=>normalizeAxis(0.6,-0.1),/INVALID_DEADZONE/);
});
test('standard controller, button mapping and D-pad takes precedence over analog axes', () => {
  const p=make(3);
  p.axes[0]=0.8;p.axes[1]=0.8;
  p.buttons[14].pressed=true; p.buttons[12].pressed=true;
  p.buttons[0].value=1;p.buttons[1].pressed=true;p.buttons[9].pressed=true;
  const input=snapshotGamepad([p]);
  assert.deepEqual(input, {connected:true,index:3,moveX:-1,moveY:-1,primary:true,secondary:true,pause:true});
});
test('hot plug/unplug, nonstandard layout rejection and preferred controller selection', () => {
  const a=make(0),b=make(2);
  b.buttons[0].pressed=true;
  assert.equal(snapshotGamepad([a,b],{preferIndex:2}).index,2);
  assert.equal(snapshotGamepad([a,b],{preferIndex:2}).primary,true);
  b.connected=false;
  assert.equal(snapshotGamepad([a,b],{preferIndex:2}).index,0);
  a.mapping=''; assert.equal(snapshotGamepad([a,b]).connected,false);
  assert.equal(pollGamepads({getGamepads:()=>[make(4)]}).index,4);
});
test('invalid gamepad readings cannot produce non-finite controls', () => {
  const p=make(); p.axes=[Infinity,NaN];p.buttons[0]={pressed:false,value:Infinity};
  const input=snapshotGamepad([p]);
  assert.deepEqual([input.moveX,input.moveY,input.primary],[0,0,false]);
});
test('audio validation fails closed before allocating unbounded buffers', async () => {
  class DummyOffline {constructor(){throw Error('should not construct')}}
  await assert.rejects(renderSyntheticTone(undefined),/OFFLINE_AUDIO_UNAVAILABLE/);
  for(const options of [{volume:1},{duration:1000},{sampleRate:1},{frequency:48000},{sampleRate:NaN}]) {
    await assert.rejects(renderSyntheticTone(DummyOffline,options),/INVALID_AUDIO_OPTIONS/);
  }
});
test('mocked OfflineAudioContext has deterministic PCM statistics and no live output', async () => {
  class MockOffline {
    constructor(channels,samples,rate) {assert.equal(channels,1);this.frames=samples;this.rate=rate;this.destination={};}
    createOscillator(){return {frequency:{value:0},connect(){},start(){},stop(){}}}
    createGain(){return {gain:{value:0},connect(){}}}
    async startRendering(){return {sampleRate:this.rate,getChannelData:()=>new Float32Array(this.frames).fill(0.25)}}
  }
  const rendered=await renderSyntheticTone(MockOffline,{sampleRate:8000,duration:0.01,frequency:100});
  assert.deepEqual(rendered,{sampleRate:8000,frames:80,rms:0.25,peak:0.25});
});
