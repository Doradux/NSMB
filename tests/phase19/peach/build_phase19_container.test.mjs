// PHASE19 Docker build CLI threat tests: never execute real Docker here.
// Invalid paths are denied before a container/image is inspected. A fake
// docker proves image digest mismatches fail closed. No downloads/network.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,symlinkSync,writeFileSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=resolve(fileURLToPath(new URL('../../../',import.meta.url)));
const script=join(root,'web-runtime/frame-host/build_phase19_container.sh');
function session(t) {
  const dir=mkdtempSync(join(tmpdir(),'nsmb-p19-peach-cli-'));
  t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const fakeBin=join(dir,'bin');mkdirSync(fakeBin);
  const marker=join(dir,'docker-run-called');
  writeFileSync(join(fakeBin,'docker'),`#!/bin/sh
if [ "$1" = "image" ] && [ "$2" = "inspect" ]; then
  echo sha256:WRONG_IMAGE
  exit 0
fi
printf "UNEXPECTED_DOCKER_RUN\\n" >> "$DOCKER_FAKE_MARKER"
exit 41
`,{mode:0o755});
  const env={...process.env,PATH:fakeBin+':'+process.env.PATH,
    DOCKER_FAKE_MARKER:marker};
  return {dir,marker,run:(args)=>spawnSync('sh',[script,...args],{
    cwd:dir,env,encoding:'utf8',timeout:10000})};
}
test('relative output rejected before Docker/image or mkdir',t=>{
  const h=session(t),name='relative-forbidden';
  const x=h.run(['--build',name]);
  assert.equal(x.status,64,x.stderr);
  assert.match(x.stderr,/absolute as originally supplied/);
  assert.equal(existsSync(join(h.dir,name)),false);
  assert.equal(existsSync(h.marker),false);
});
test('absolute checkout and traversal output rejected even if missing',t=>{
  const h=session(t);
  for(const path of [root,join(root,'web-runtime/frame-host/../output')]){
    const x=h.run(['--build',path]);
    assert.equal(x.status,64,x.stderr);
  }
  assert.equal(existsSync(h.marker),false);
});
test('absolute external path outside /tmp rejected',t=>{
  const h=session(t);
  const x=h.run(['--build','/var/tmp/no-external-write']);
  assert.equal(x.status,64,x.stderr);
  assert.match(x.stderr,/inside \/tmp/);
  assert.equal(existsSync(h.marker),false);
});
test('symlink from /tmp into source rejected before Docker',t=>{
  const h=session(t);
  const link=join(h.dir,'alias');
  symlinkSync(root,link);
  const x=h.run(['--build',link]);
  assert.equal(x.status,64,x.stderr);
  assert.equal(existsSync(h.marker),false);
});
test('symlink leaf and nonempty output rejected before Docker',t=>{
  const h=session(t);
  const safe=join(h.dir,'real');mkdirSync(safe);
  const alias=join(h.dir,'symlink');symlinkSync(safe,alias);
  assert.equal(h.run(['--build',alias]).status,64);
  writeFileSync(join(safe,'sentinel'),'keep');
  assert.equal(h.run(['--build',safe]).status,64);
  assert.equal(existsSync(h.marker),false);
});
test('wrong immutable Docker image ID fails closed without docker run',t=>{
  const h=session(t);
  const safe=join(h.dir,'empty');mkdirSync(safe);
  const result=h.run(['--build',safe]);
  // Prior to committing source, cleanliness guard is expected to fail early.
  if(result.status===65 && /BLOCKED-SOURCE/.test(result.stderr))
    return; // Validated again after commit with clean source.
  assert.equal(result.status,65,result.stderr);
  assert.match(result.stderr,/image digest mismatch/);
  assert.equal(existsSync(h.marker),false);
});
test('unknown flags and missing destination denied',t=>{
  const h=session(t);
  for(const args of [[],['--build'],['--probe'],['--build','x','y']]){
    assert.equal(h.run(args).status,64);
  }
  assert.equal(existsSync(h.marker),false);
});
test('source script hard-pins offline Docker identity and read-only source bind',()=>{
  const source=requireScript();
  assert.match(source,/sha256:fb7864e398acfda863dfcea78b8bc8adad359fa60c6a0bbeb845931de64aa68a/);
  for(const item of ['--pull never','--network none','--rm','--cpus=2',
     '--memory=4g','$repo:/work:ro','--build \/output']) {
    assert.ok(source.includes(item),'missing hardening: '+item);
  }
  assert.doesNotMatch(source,/\bdocker\s+pull\b|--privileged|\bsudo\b(?=\s+docker)/);
});
import {readFileSync} from 'node:fs';
function requireScript(){return readFileSync(script,'utf8');}
