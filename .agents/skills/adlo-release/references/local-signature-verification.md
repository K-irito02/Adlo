# 本地 verify 更新签名（不发布也能做）

`release:verify` 只读线上双源清单，**不校验签名**。本地构建完成后，用下面这条命令直接验证
「安装包字节 + 应用内置公钥 + `.sig`」三方一致——与 `tauri-plugin-updater` 下载后做的校验同一套算法。

前提：Node ≥ 20（自带 `blake2b512` 与 Ed25519），在**仓库根**执行。

```powershell
node -e "const fs=require('fs'),c=require('crypto');const root='adlo';const ver=process.argv[1];const exe=root+'/target/release/bundle/nsis/Adlo_'+ver+'_x64-setup.exe';const pub=JSON.parse(fs.readFileSync(root+'/src-tauri/tauri.conf.json','utf8')).plugins.updater.pubkey;const pubBytes=Buffer.from(Buffer.from(pub,'base64').toString('utf8').trim().split(/\r?\n/)[1],'base64');const block=Buffer.from(fs.readFileSync(exe+'.sig','utf8').trim(),'base64').toString('utf8').split(/\r?\n/);const sig=Buffer.from(block[1],'base64');const alg=sig.subarray(0,2).toString();const keyId=(b)=>b.subarray(2,10).toString('hex');if(keyId(sig)!==keyId(pubBytes))throw new Error('key id mismatch: 签名私钥与内置公钥不是一对');const data=alg==='ED'?c.createHash('blake2b512').update(fs.readFileSync(exe)).digest():fs.readFileSync(exe);const der=Buffer.concat([Buffer.from('302a300506032b6570032100','hex'),pubBytes.subarray(10,42)]);const key=c.createPublicKey({key:der,format:'der',type:'spki'});console.log('alg:',alg);console.log('keyId:',keyId(sig));console.log('trusted:',block[2]);console.log('SIGNATURE_OK=',c.verify(null,data,key,sig.subarray(10)));" 0.1.1
```

判定：

- `alg` 为 `ED`（Tauri 默认的预哈希签名）；
- `keyId` 与内置公钥一致（脚本已先做相等断言）；
- `trusted` 里出现 `file:Adlo_0.1.1_x64-setup.exe`，时间戳是本次构建；
- 最后一行 `SIGNATURE_OK= true`。

若本机装有 `minisign`，等价做法是先把 `.sig` 从 base64 解开，再用内置公钥验证：

```powershell
$exe = "adlo/target/release/bundle/nsis/Adlo_0.1.1_x64-setup.exe"
$tmp = "$env:TEMP\adlo-sig-check"; New-Item -ItemType Directory -Force $tmp | Out-Null
[IO.File]::WriteAllText("$tmp\app.sig", [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String((Get-Content "$exe.sig" -Raw).Trim())))
$pubKey = (Get-Content adlo/src-tauri/tauri.conf.json | ConvertFrom-Json).plugins.updater.pubkey
$pubText = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($pubKey))
$pubLine = ($pubText -split "`r?`n")[1]
minisign -Vm $exe -P $pubLine -x "$tmp\app.sig"
```

期望 `Signature and comment signature verified`。

**这不是**签名检查的替代品：`release:verify` 的两行 `OK` 只证明清单可达、版本一致、安装包 HEAD 200。
首次发布仍必须在干净机器上完成一次真实安装与旧版本→新版本升级。
