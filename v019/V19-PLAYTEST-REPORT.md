# Like Flies v19 — playtest handoff

**Experimental build for Job and Sage · October 27, 2026**

Four playable activities follow your priority order: Buzz Tag, Hide-a-Crumb, Ghost Wings and Backyard Field Guide. Open **Menu → Activities** in the headset, or the Activities section of the page menu. Nobody is enrolled in Tag automatically. The v18b fallback is preserved.

## What to try first

1. **Buzz Tag:** both join the same room as flies and choose Join Buzz Tag. One becomes IT, with an amber halo/badge and a clear HUD status. Touch another opted-in fly to transfer IT and gain one pass. The new IT has a two-second get-ready delay; the previous IT has four seconds of protection. Separate before tagging back. Leaving Tag restores racing. Humans, bots and opted-out flies are excluded.
2. **Hide-a-Crumb:** land on a still surface, choose Hide here, select a hint and Confirm. Your friend picks the crumb with Next crumb, selects Find this, and follows Cold/Warm/HOT scent. Each seeker can find it once; finding does not consume it for other people. For a later session, export the crumb code from the page menu and have your friend import it. The original hider cannot self-find; an importer can find a friend's crumb.
3. **Ghost Wings:** leave Tag and complete a normal valid race lap. Choose My best, then race from the **same start ring** to see the replay and a same-gate time gap. Watch gives a demonstration replay. Sharing is off until the record holder chooses Share: on; another player chooses Record. Ghosts never collide or award points.
4. **Backyard Field Guide:** turn Scan on and look closely at a sunflower, the chicken, the floating rubber duck, tomatoes and a paper moth under a lawn chair. Sustained visible gaze adds entries to your personal journal. Scan through walls should not work.

## Important playtest limitation

**A reliable high-speed Buzz Tag fly-by between two real headsets is not yet proven.** Delayed-path logic and held-contact browser checks have evidence. The bounded live fast-pass check on the software-rendered test machine failed before the final timing correction; it is not a pass. Treat reach, responsiveness, visual readability and Quest performance as your first feedback targets. High latency can still cause missed crossing paths. This is a playtest delivery, not a production-readiness claim.

## Persistence and scoring

- Tag passes, crumb finds, journal discoveries and race points stay separate.
- A room's crumb challenges survive a hider leaving while another peer remains. There is no permanent always-on room server. Exported codes let friends carry a challenge to a later session.
- Authored/imported crumbs, personal finds, journal entries, ghost options and bounded best replays are browser-local. Clearing that browser's storage removes its local progress. The same headset using another browser/origin has separate storage.
- Ghost compatibility includes start ring and tuning/course signature. A ghost from another start is unavailable rather than misleadingly compared.

## What was checked

**Independent verification of the exact final downloaded file:** Script syntax passes; all 17 embedded model hashes/containers match; 54 recorded defaults and existing migrated-profile edits remain intact. Eight isolated authority/contact checks and five focused usability checks pass on the exact exported final module. These are bounded source-execution fixtures, not a headset or full browser regression. See independent-static-qa/*.json.

**Claude's focused evidence, with scope kept explicit:**

- Original candidate: actual peer-connected browsers on one machine checked membership, one IT, held-contact transfer, protection/no overlap ping-pong, spectator exclusion, host departure and crumb receipts. These results belong to that candidate, not a fresh full regression of the final file.
- Revised b: scripted checks covered import → search → find, original-hider denial, unauthorized move/delete rejection, sender-bound snapshots and malformed-state rejection. A live late join adopted coordinator state. The complete three-player live handoff was not repeated under the new authority check.
- Revised b: synthetic delayed/sparse paths checked contact, near misses, teleports and stale streams. Two cases missed by the original sweep were caught. Live held contact was seen after the final timing fix; live fast crossing remains unproven.
- Revised b: joining Tag suppressed racing; switching to Human left Tag without points; returning to Fly and explicit Leave re-armed racing. Four focused checks passed without page errors.
- Original candidate: crumb room finds/hider departure, consent-gated ghost sharing, invalid replay rejection, five Guide targets, storage reload and the corrected moving-duck target were checked. The initial duck-follow failure was superseded by its separate fix/check log.
- Ghost lap evidence used **scripted rig repositioning through the actual gate detector**, not human-input flight. No claim of a person flying a lap is made.
- Final usability changes: Independent exact-function fixtures prove that a friend-code recipient can search, first activation does not instantly discover, sustained gaze still discovers, disabled scan time does not count, and repeated menu redraw preserves code text/focus/selection. The headset strip now uses compact Duck/Tomato/Moth labels. These final small changes were checked in fixtures; a new browser/headset screenshot of the local patch was not captured.

## What was preserved and what was not tested

All 17 embedded models remain the existing approved assets. This build adds activity presentation, a small visual sign and the paper moth; it is not a merge of Sage's separate art work. Exact v18b defaults and migrated user preferences are retained. Sampled flight/crawl/attachment/combat function bodies are unchanged; that is code-integrity evidence, not a complete gameplay regression.

No headset tests, Quest frame-rate/comfort measurements, real-home-internet trial, public service check or full final multiplayer race regression is claimed. Food, human hands and swatting were not newly exercised in this activity pass. Existing CDN/network dependencies remain required. GitHub was not accessed or published to. No new software, paid service or backend was installed.

## Files and fallback

**Upload file:** `W:\Downloads\Like-Flies\Builds\v019\index.html`.

**Fallback:** `W:\Downloads\Like-Flies\Builds\v018\index.html`, SHA256 `4bc06de6ea52d50f77e9f9fe1a1db37f0c2cb3be8336a71bdc8596f0a7e7834d`.

**Recommended local delivery:** v19b + usability review 1. Menu still says v0.0.19b. HTML 5,515,686 bytes, SHA256 `ee683f7276256034db74c559a744e9c347189838735740ebfbf4cfcac2cffce2`. This is the recommended upload file, rather than the earlier unpatched files inside the original Claude ZIPs.

Claude has the v19 and v19b downloadable artifacts. A final c request containing the same three usability corrections was submitted, but its output was not collected or verified because the Claude window was actively in use elsewhere. It is not the canonical delivery described here. Keep using this local file unless a later build is explicitly reviewed.

The delivery ZIP contains the exact playable file, this handoff, the implementation brief, focused reports/logs and actual screenshots. Older screenshots are labeled by their candidate version; they are not headset captures. Save the entire v019 folder for your archive; upload only the intended game file when you choose to publish it.
