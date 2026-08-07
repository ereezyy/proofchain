# ProofChain — Facebook / Threads Social Blast

## Primary Post (Facebook + Threads)

---

88% of orgs had an AI agent incident last year.
14% have audit trails.

When your agent makes a decision and something goes wrong — what do you show the regulator? A screenshot? Good luck.

ProofChain gives every AI agent a cryptographic identity and a tamper-evident audit trail, on-chain, forever.

Three layers. No bloat:

1. AgentID — soulbound NFT on X1. Your agent is provably yours.
2. HXMP audit trail — intent → context → decision → outcome. Tamper-evident. Privacy-preserving.
3. Automated compliance reports — EU AI Act, SOC 2, GDPR. One system. Zero spreadsheets.

We use ProofChain to prove ProofChain. The agent that posted this? Registered on-chain. Its entire operational history is public. No other compliance product can say that.

Live now at proofchain.us
Open source: github.com/ereezyy/proofchain

#AIAgents #Compliance #EUAIAct #Blockchain #ProofChain

---

## Alternate (Shorter, Higher Impact)

---

88% AI agent incidents. 14% audit trails. The EU AI Act is live.

Your agents need alibis. ProofChain gives them one.

proofchain.us

---

## Alternate (Architecture-Heavy, for Tech Audiences)

---

Every AI agent should have a cryptographic identity and a tamper-evident audit trail. Not "should" as in "nice to have." Should as in "the EU AI Act requires it and your enterprise prospects are about to ask for your SOC 2 evidence pack."

ProofChain architecture:
- AgentID: Soulbound NFT on X1 → provable agent ownership
- HXMP: Encrypted intent→context→decision→outcome memos → verifiable without exposing secrets
- Reports: Automated EU AI Act / SOC 2 / GDPR compliance from the same audit trail

100+ on-chain records. Open source. Live at proofchain.us.

Build agents. Stay compliant.

---

## Posting Instructions

**fb_post.py does not exist.** The only Facebook posting script in `C:\Users\Eddy\wf-deploy\` is `fb_post_video.py`, which:
- Requires a video file (`python fb_post_video.py <video.mp4> "<description>"`)
- Posts to the Waveforge page (PAGE_ID: `1231746766690079`), NOT a ProofChain page
- Reads tokens from `fb_page_token.txt` / `fb_token.txt`

To post ProofChain content to Facebook/Threads:
1. **Option A:** Create a dedicated ProofChain Facebook Page, get a page access token via Graph API, and adapt `fb_post_video.py` to post text-only using the `/page-id/feed` endpoint (POST with `message` and `access_token`).
2. **Option B:** Post manually through Meta Business Suite or the Facebook app.
3. **Option C:** Use the Threads API directly (requires a Threads-specific access token with `threads_basic` and `threads_content_publish` permissions).

For now: use the text above to post manually.
