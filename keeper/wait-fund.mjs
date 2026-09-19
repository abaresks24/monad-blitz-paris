import { createPublicClient, http, formatEther } from "viem";
const c = createPublicClient({ transport: http("https://testnet-rpc.monad.xyz") });
const addr = "0x19f2899A66Fe74c1EE7b3343f3e3852c36329cbb";
const deadline = Date.now() + 40*60*1000;
while (Date.now() < deadline) {
  try {
    const b = await c.getBalance({ address: addr });
    if (b > 0n) { console.log("FUNDED:", formatEther(b), "MON"); process.exit(0); }
  } catch {}
  await new Promise(r => setTimeout(r, 15000));
}
console.log("TIMEOUT: still 0 after 40min");
process.exit(1);
