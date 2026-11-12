# LIKE FLIES v19 — the living asynchronous backyard

**Implementation brief · Job and Sage · October 27, 2026**

**Authorized now:** build a playable v19 with four features, in this order: **1. Buzz Tag; 2. Hide-a-Crumb; 3. Ghost Wings; 4. Backyard Field Guide.** Job is away on errands and explicitly authorizes implementation, sensible design choices, Claude collaboration and focused testing without waiting for approval of this document. This is an experimental playtest, with v18b preserved as the fallback. Ship working vertical slices of all four rather than leaving three as menu placeholders. If something remains incomplete, say exactly what; never label a stub finished.

## 1. Product goal

The yard is a persistent-feeling place people can join at different times and enjoy differently. Two flies can chase each other while a third follows a racing ghost and a fourth explores. The new systems must encourage fly-to-fly interaction, discovery and return visits without forcing the whole room into a synchronized match. Buzz Tag is the signature experiment and must be immediately understandable and enjoyable with just Job and Sage.

The mantra remains **high quality, low fidelity**: early PS1 forms, authored late-SNES texture craft, saturated playful backyard scale. Keep the current models, enlarged yard and v18 retro/VHS controls. Use small matching effects and clear iconography. Do not start an unrelated art overhaul or silently merge Sage's separate work.

Names: **Buzz Tag**, **Hide-a-Crumb** (Job pronounced this as “Hidachrom”), **Ghost Wings**, **Backyard Field Guide**. Grover's cap stays MAJOR.

## 2. Exact baseline and deliverable

Start from final **v0.0.18b**, not the first v18 candidate:

- File: `W:\Downloads\Like-Flies\Builds\v018\index.html`.
- Size: **5,443,933 bytes**.
- SHA256: `4bc06de6ea52d50f77e9f9fe1a1db37f0c2cb3be8336a71bdc8596f0a7e7834d`.
- Claude already created this version in the Like Flies VR game conversation. Reuse the exact source there if its fingerprint matches; otherwise use the attached baseline ZIP.

Return **one playable standalone HTML delivery file named index.html**, menu label **Test v0.0.19 · Backyard activities**, plus a downloadable ZIP containing that exact file, change notes, known issues, a concise playtest guide and actual desktop screenshots. Save/download locally to a new `W:\Downloads\Like-Flies\Builds\v019\` folder. Keep the previous versions intact. A single file can retain the same existing CDN dependencies; disclose any change to dependencies. No GitHub access or publication. No paid services, installs, account changes, credentials or backend deployment.

Preserve v18b's remote articulated fly, alternating tripod fix, head look, wings and default migration. Keep flight, crawling, attachment to humans, swatting, grabbing/carrying food, hand/controller input, roles, effective player scale, tuning sharing, racing and leaderboard behavior. Do not reset saved player identity, preferences or race points to install activities. Version activity storage independently.

## 3. Common activity presentation and controls

Add an **Activities** page to both desktop and in-headset menus, with four readable cards and short instructions. Use existing UI interaction paths; do not require keyboard entry or precise tiny buttons for essential headset actions. Allow scrolling/pagination if needed, and check the headset panel's actual rendered layout. The page should show what is available now, not just explanatory prose.

Buzz Tag card: Join / Leave, participant count, current IT and cooldown/status. Hide-a-Crumb: Hide / Browse / Find / Stop search, own active challenge and finds. Ghost Wings: Off / My best / Shared room record, sharing toggle, replay status. Field Guide: discovered count and entries, scan mode toggle. A lightweight HUD line shows only the activity the player is actively doing. Do not cover the existing race HUD or show four full instruction panels at once.

Provide one clear can-side “Activities” marker near an existing spawn can as an optional discoverable entry point; the menu remains available anywhere. Do not move colliders, block spawn points, obstruct racing rings or rebuild the yard to accommodate it. Avoid using the racing crown for tag status.

Core feedback uses shape/text as well as color. Honor sound off. Add short original procedural tones with a volume/rate limit, no fetched copyrighted audio. Do not force camera rotation, motion effects or vibration patterns that imply a new comfort mode. Display names remain existing player names, escaped/truncated for UI rendering.

### Coexistence rules

- Spectators and opted-out flies are never tag targets. Humans and practice bots do not join tag in v19.
- Joining Tag cancels the local active race with a short explanation and suspends automatic race starts while opted in. Leaving Tag restores ordinary racing readiness. This avoids accidental race resets and involuntary mixed scoring.
- Active Hide-a-Crumb searching may coexist with exploration; taking a ranked race start can pause its guidance, not delete its challenge. Field Guide scans do not affect racing. Ghosts are purely visual.
- Role changes, death, respawn, room change and disconnect have explicit transitions below. A nonparticipant can keep exploring, eating or racing while others play Tag.
- Keep race points, Tag passes, Crumb finds and Guide entries separate. An Activities summary may display them together, but do not invent a new global currency or change the existing crown-award rules.

## 4. Shared-state architecture and persistence truth

Use the current room/peer networking and stable player ID. Implement a **single authoritative activity coordinator per room**, using the existing host-election approach where suitable, without coupling activity revisions to the race ledger. An activity snapshot has schema version, room identity, host/authority identity, epoch/revision, participant IDs, Tag state, Crumb challenge records and completed-find acknowledgments. Transport requests separately from accepted state. Never let a client make another player IT merely by broadcasting a claim.

Late joiners request and receive one current snapshot; repeated/out-of-order messages are ignored. Dedupe tag/find operations by unique operation ID plus activity revision. Validate finite numbers, bounded strings/arrays, known participants and room identity. Accept messages only through the appropriate sender connection; don't trust a payload's claimed player ID alone. Cap state sizes. Avoid sending full activity state on every 15Hz avatar pose update.

Host departure: surviving peers elect a coordinator and carry forward the newest agreed snapshot, participants, IT/cooldowns, crumbs and accepted find receipts. Do not clear everything just because the race host changes. If peers disagree, choose the latest valid epoch/revision deterministically and reject stale operations from the previous authority. Reconnect keeps the same identity and should not award duplicate points. If alone/offline, local activities and stored progress still work; Tag waits for a second participant.

This prototype is peer hosted, not a secure competitive server. Bound and validate for correctness, not a false promise of cheat-proof networking. Never create a backend to meet the brief.

**Persistence labels must be honest:** room challenges survive a hider disconnect while someone remains in the room. Browser-local authored challenges and personal progress survive reload on that browser. If every peer leaves, there is no always-running server: exported challenge codes carry a hide to a later session. Do not call room-only data permanent friend persistence.

## 5. Priority 1 — Buzz Tag

### First-time flow

From Activities, choose **Join Buzz Tag**. The card immediately confirms membership, tells you how to leave, and shows “Waiting for another fly” if only one is opted in. When there are at least two eligible participants, choose IT deterministically, preferring the least recently IT participant if available; a first fresh session can use stable ID order. Joining an already active game does not steal IT or restart everyone's activity.

IT gets a distinctive **amber pulsing buzz halo and IT badge** above their fly. Eligible runners have a small blue membership marker visible nearby. Everyone in Tag sees who is IT; opted-out players need not receive an intrusive HUD. The glow/marker must not change avatar scale or collision. An optional subtle direction indicator points toward IT without exposing every player's location to unrelated players.

IT tags another opted-in fly by a **clean close pass/body touch**. Use avatar body centers/bounds, not controller/hand positions or wing tips. Crawling flies can tag/be tagged: both flight and under-bench routes should work. It should not require a button press or weapon.

### Detection and authority

Choose a tag reach from the current effective fly body size (roughly one body-width contact zone, tune after seeing it). Record the exact formula in the report. Do not use a giant human-scale radius. Account for each participant's fly scale with conservative bounds, and avoid larger sliders producing a huge competitive advantage. If gameplay tuning differs, label Tag casual/mixed tuning; do not rewrite slider settings on opt-in.

The coordinator validates recent poses and membership. Detect swept relative movement between recent samples so a fast crossing doesn't tunnel through. A tag request can suggest an interaction, but the coordinator confirms plausibility from the recent authoritative pose buffer. Do not accept teleports, a respawn crossing, stale/invisible/dead players, role switches or a path through a solid wall as a tag. Use existing line-of-sight/occlusion primitives with short-body-contact tolerance. Cap rewind/sample age (e.g. 250ms) and document it. Discontinuities clear contact history rather than drawing a sweep across the yard.

One accepted tag atomically transfers IT and increments the **former IT player's successful passes** by one. Use the same receipt ID for all peers. Immediate repeated requests cannot transfer it back or award more points.

### Escape window and anti-loop rules

After transfer, the new IT has a **2-second get-ready window** before they can tag. Show a clear countdown; both participants hear one short sound if enabled. The previous IT additionally cannot be retagged by the new IT for **4 seconds**. The new IT can pursue a third eligible player after the 2-second window. With two players, the protected former IT gets a real escape chance. Avoid turning a stationary overlapping pair into an infinite score machine: require separation beyond the contact zone before the same pair can establish another fresh contact.

A clean transfer produces “You tagged Sage!” / “You're IT — get ready” and one modest visual pulse. No knockback, forced velocity, camera flash or death. Human swats continue normally; being tagged does not affect food, health, lives or racing points.

### Leaving and disruptions

- Joiners remain safe until they opt in and their avatar is ready; no tag during spawn grace.
- Dead/respawning players are temporarily ineligible. If IT becomes ineligible or leaves, transfer IT after a short clear delay to another available participant. Do not award a pass for administrative transfer.
- Switching to Human leaves Tag. Disconnect removes active membership after the room's normal presence timeout. Leaving the room removes it immediately when known.
- Fewer than two eligible members pauses Tag, preserving pass totals and ready to resume. Never nominate a spectator to fill a vacancy.
- Explicit Leave is immediate locally and sent to coordinator. No more tags can target the leaver after acknowledgment; pending requests are checked against the updated revision.

### Scoring and settings

Show Tag pass totals for the current room/session in Activities, separate from racing. They persist through a host handoff/reconnect while that session exists. No rewards for being selected IT, staying IT, repeatedly respawning or leaving/rejoining. This is an exploratory casual mode, not a full tournament.

Expose **tag reach multiplier, new-IT delay and retag protection** only if easily integrated as a small activity-specific host setting. Sensible defaults above are enough; don't bury basic fun under new sliders. A room setting change increments activity rules/version and clears contact history, not existing race records. Keep these out of the physics/race tuning signature unless a specific shared physics parameter is changed.

## 6. Priority 2 — Hide-a-Crumb

### Goal and interaction

A player leaves a reachable crumb challenge, another chooses it and explores to find it. Use a **dedicated golden folded crumb** visually distinct from edible/carryable food. Do not consume, steal or count against existing food inventory. Challenge crumbs are noncolliding and do not alter health, satiety or physics.

Choose **Hide a crumb** to preview placement at the fly's current landed point or a short controller/head-directed surface hit. The menu must state how to confirm/cancel. Prefer current landed placement for the first headset slice: it inherently demonstrates the player reached the location. Spawn the crumb offset from the actual surface normal with enough clearance to see it. The hider may inspect and adjust before Confirm.

Validate against actual existing landing/collision data: finite in-yard coordinates; supported surface; not inside closed geometry, outside the fence, below the world, in a spawn or racing gate opening, or on a moving human/duck/animated part. Use static surfaces in v19 to keep codes stable. Require a safe empty approach volume for a fly, using existing clearance checks. Don't rely solely on the mesh's bounding box. If unsupported, say why and allow another placement rather than creating an impossible challenge.

One active authored crumb per player, up to **8 room challenges**. Replacing/deleting your own challenge is explicit. Other players cannot move/delete it. The hider sees their crumb; other seekers only see its exact sparkle once nearby or found. Do not reveal exact coordinates in ordinary menus. A challenge contains stable challenge ID, creator ID/name, world/course version key, static position/normal, preset hint and creation metadata. Choose from stock hints such as “Near something blue”, “Up above the lawn”, “Look underneath”. No freeform public messaging UI is needed.

### Finding

Browse available challenges, choose one and see the creator plus stock clue. A small **scent meter** reports Cold / Warm / Hot based on distance, with a visual pulse and optional rate-limited chirp. Avoid an exact arrow or automatic straight-line route that defeats exploration. It can show relative distance bands, not the hidden position. Give a manual “stronger hint” that shows the broad landmark/region after about a minute or on request; no penalty necessary.

Find by approaching the crumb within an appropriately scaled radius, with unobstructed line of sight, and a short dwell (about 0.4s). A coordinator validates active challenge, current proximity and visibility, then records one found receipt per seeker/challenge. No reward to the hider finding their own challenge. A second player can find the same crumb independently; one finder never removes it for everyone. Repeated overlaps, duplicate packets, reconnects and imported copies of the same ID cannot farm finds.

Successful find: short sparkle, creator credit, your find count +1, optional “Hide your own” prompt. A personal Found stamp appears in Browse. No hard timer or failure state; Stop search clears guidance but leaves the challenge available. Local authored and personal found IDs use namespaced bounded storage; storage failure is handled without crashing.

### Asynchronous portability

Provide **Export challenge** as a compact copyable code and/or downloadable JSON. Provide Import/paste on desktop; headset users can receive imported challenges from a friend already in the room. This is the bridge for a hider and seeker who are not online together. Keep room and browser-local labels clear. A hider departure alone must not remove the challenge from remaining peers.

Import is untrusted data: accept a small versioned schema, maximum roughly 4KB/code, bounded creator name/IDs, finite vectors, correct world key and fresh placement validation against this build. Do not evaluate code, fetch a URL, insert raw HTML or accept arbitrary files as executable content. Preserve the original challenge ID for dedupe, but don't allow an imported author claim to impersonate a connected player's ownership/deletion privileges. Incompatible geometry version should show a readable rejection. Do not promise cross-device cloud saves.

## 7. Priority 3 — Ghost Wings

### Goal

Make an already-completed race line visible and followable. This is a **noncolliding visual replay**, never a second player, score submission or moving obstacle. It doesn't collect food/rings, trigger Tag, emit player-presence packets or attract combat effects. Keep at most **one** ghost visible per viewer.

The card offers Off, My best and Shared room record. Default Off to keep the yard clear. Record local ranked valid laps as sparse world pose samples, sampled around **5Hz**, with timestamps relative to the first accepted gate. Record start ring, course key, physics/tuning signature, race duration, finish metadata and display name/ID. Keep a local best per start-ring and compatible signature, bounded to a small number of replays. Do not replace a good ghost with a failed, timed-out or practice run.

Starting at different rings changes the measured start/finish path in the existing circuit. **Only compare/replay a ghost from the same start ring and course/tuning signature.** Do not silently rotate a different-start replay or change existing race scoring to accommodate it. If unavailable, say “No matching ghost for this start” and let the user view a demonstration replay separately, clearly labelled.

When a matching trial starts, the selected ghost launches at t=0 and interpolates by recorded time, not frame count. Show elapsed gap if it can be computed meaningfully at the same gate; don't invent a precise progress gap from raw Euclidean distance. A non-racing “Watch route” replay can be restarted from Activities and loops only on explicit choice. At replay end, fade out/restart only as selected. Death, role/room changes and incompatible course/tuning hide/pause it cleanly.

### Appearance and recording bounds

Reuse a very cheap fly silhouette or simplified existing mesh with translucent cyan/white tint, outline/wing cue and name + GHOST label. No opaque halo covering the next gate, no CRT-heavy particles, no shadows or collision. Avoid cloning the full expensive articulated rig for a cosmetic trail if a cheaper silhouette reads well. Keep the actual green/gold/red racing semantics unchanged.

Quantize positions/heading sensibly and interpolate smoothly. Keep recordings bounded: at most about **3,600 samples** and a strict serialized byte cap (target <=128KiB/replay). If a valid long race exceeds the limit, save its score as usual and say the ghost wasn't saved; do not invalidate the lap. Store no microphone/headset video or unrelated telemetry.

### Room sharing

Add a per-player **Share my best race ghost** opt-in, initially off. Sharing advertises only that player's best compatible replay. With consent, a peer can request the current compatible room-record holder's replay. Use existing data connections, bounded chunks (~8KiB), request ID, total byte/sample limits, order/revision checks and a timeout. Do not send the full replay at avatar update frequency. Cache one or two replays and skip retransmitting unchanged IDs. Display “record available, ghost not shared” if appropriate.

Validate imported/shared replay schema, sample timestamps monotonic, finite in-yard positions, duration bounds, start ring/course/signature and identity/record metadata. Treat it as a visual route, not proof for ranking. Do not award race points based on replay data. Host handoff should retain the record metadata; a missing/offline replay owner may make shared ghost unavailable without erasing their score. A local personal ghost should still function offline.

## 8. Priority 4 — Backyard Field Guide

### Goal and content

A calm exploration activity with **five actual discoverable entries**, individual completion and an illustrated journal. Reuse existing art and landmarks so this can ship today without blocking on new models. Suggested entries:

1. **Sunflower:** one reachable large flower head/leaf region.
2. **Chicken:** observe the chicken at/near the coop.
3. **Rubber duck:** observe the existing pool duck, following its live transform.
4. **Tomato cluster:** a reachable identifiable cluster in the garden.
5. **Under-the-chair secret:** add one tiny noncolliding paper moth/sticker under a specific chair seat as a new surprise, with a matching simple journal icon.

If exact landmarks differ, choose five equally clear reachable targets and document them. Do not label an invisible trigger in empty space as a creature/model. Do not add a dozen unrequested new animals. Use stable IDs and art-bounds/anchors derived from actual integrated objects, not guessed obsolete coordinates.

### Scanning

Enable **Field Guide scan mode** in Activities. Looking at a discoverable target at close range for roughly **1.2 seconds** fills a small reticle and adds the entry. Use the actual headset view direction, desktop camera equivalent, range and line of sight. Do not award through walls, across the yard, behind the player or while a UI menu covers the view. Moving targets track their current bounds; do not auto-collect simply because the player spawned nearby. Forgive short gaze breaks with a small decay, but don't finish a scan after looking away.

The scanner distinguishes looking at the duck from looking at pool water or the whole yard. Acquired entries remain visible to other players; this is not a consumable pickup. No score denial because a friend found it first. Allow a controller/head gaze method without requiring eye tracking hardware. Scan effects honor sound preference and don't interfere with flight inputs.

### Journal

Show **0/5 discovered** and five entries with silhouettes. On discovery, unlock a small image/icon and a one-sentence original field note in Like Flies' playful tone. Mark first discoveries once, persist personally in local storage, and keep their IDs stable across reload. Do not mix Guide entries with race leaderboard points. Shared presence can show a subtle discovery toast if easy, but must not reveal coordinates or grant completion to everyone. Role changes preserve journal progress; initially allow fly scanning, with human scanning optional only if it requires no input changes.

## 9. Implementation sequence and integration discipline

1. Verify baseline. Add activities module/state and menu scaffolding with genuine transitions.
2. Finish Buzz Tag end-to-end with two players, opt-out spectator and host handoff. Inspect marker scale, contact reach, escape window and crawling.
3. Finish Hide-a-Crumb reachable placement, room sync, find receipt and code export/import. Ensure hider leave and independent seekers work.
4. Finish local Ghost Wings recording/playback before sharing. Hook to actual valid race completion, not a fake replay button only. Then add bounded consent-based sharing.
5. Finish five Field Guide targets with real view/range/occlusion scan and journal.
6. Integrate UI, check costs and regressions, package the exact candidate. Priorities guide polish and debugging time; the requested delivery includes all four.

Keep changes isolated in named functions/modules within the single HTML rather than rewriting flight/networking wholesale. New payloads should have distinct message types and bounded dispatch paths. Use deterministic seeded IDs/operation IDs where needed; never derive a challenge identity from display name alone. Use existing stable `racePid` or an equivalent identity without resetting it. Clear per-room ephemeral buffers when changing rooms.

Performance: reuse geometry/materials, cap effects, avoid repeated full-scene raycasts/allocations every frame, scan near targets at a modest rate and lerp UI presentation. No full ghost payload in pose broadcasts. Account for both desktop and stereo headset rendering. Report actual desktop complexity changes; do not invent Quest frame rates.

## 10. Focused acceptance checks

Use bounded focused checks, each with a clear assertion and deadline. Prefer a few short real-browser checks plus isolated logic checks. Do not recreate the v16 hours-long browser wait cycle. A failed test must report a reason and terminate. Roughly 30 minutes total automated verification is a useful initial ceiling, then fix concrete defects and rerun only affected checks. Job allows sustained implementation, not redundant unbounded tests.

### Buzz Tag — must demonstrate

- A joins alone: waiting; B joins: one IT; C opted out: cannot be tagged.
- One close pass transfers IT once and +1 former-IT pass. Duplicate and stale requests do nothing.
- New IT delay, previous-IT protection and separation rule prevent ping-pong farming.
- A fast legal crossing counts; through-wall/teleport/stale pose doesn't.
- Crawling remains eligible. Death/role/room leave removes eligibility without bonus points.
- Coordinator departure produces one agreed IT/score state, with no reset/duplicate transfer.

### Hide-a-Crumb — must demonstrate

- A reachable static hide confirms; inside/unsupported/outside placements reject.
- B can receive/search/find; A gets no self-find; C can still find afterward.
- Repeated receipt/reconnect adds no duplicate find. Hider disconnect leaves the challenge while a peer remains.
- Export/import roundtrip works, incompatible/malformed/oversized codes reject without executing anything.

### Ghost Wings — must demonstrate

- One actually completed valid lap saves a replay; invalid or timed-out lap doesn't replace it.
- Matching start/signature launches at the first accepted gate and uses recorded time. Mismatch is labelled unavailable.
- Opt-in shared replay arrives with bounds; Off removes it; no collision, scoring or Tag participation.
- No consent means no replay transfer. Large/invalid replay rejects without breaking the room.

### Field Guide — must demonstrate

- Five targets exist and all can be discovered through real camera/range/visibility checks.
- Looking away/through a wall doesn't complete a scan. Duck target follows motion.
- Journal saves across reload; duplicate scans don't add progress; one player's discovery doesn't consume another's.

### Baseline smoke checks

Syntax, exact 17 embedded model fingerprints unless a clearly documented tiny added asset is required; effective fly scale; v18b tripod fix/defaults preserved; basic fly movement/crawl/takeoff/swats/food; ten-gate race start/timeout/finish; share tuning; menus render on desktop and headset-panel canvas. Verify no new activity is auto-enabled for every player on join. No headset tests claimed unless actually performed.

### Required delivery evidence

Capture actual candidate screenshots: two-player Tag with IT and escape-window UI, Crumb placement/search/find, visible ghost during a race, Field Guide scan/journal. Label synthetic state injection vs real peer networking. Include one clear table per feature: Implemented / Checked / Known limits. No fabricated perfect rating. Include known pre-existing v18 limitations rather than implying this pass fixed everything.

## 11. Definition of ready for Job and Sage

The delivered v19 file opens and offers all four functioning activities; Tag works with two opted-in real peers and excludes spectators; crumbs can be left/found/shared asynchronously within the stated persistence model; race ghosts actually replay completed lines; the guide has five discoverable targets. Existing flight and racing remain usable. A concise headset playtest script tells Job and Sage exactly how to try it in 10–15 minutes. The HTML is downloadable in Claude and saved locally in v019 with its SHA256, fallback and honest report.

No approval pause is needed to implement these choices. Resolve routine detail with judgment. Escalate only an actual consequential install/account/publishing action or an ambiguity that cannot be handled within the reversible prototype. Do not wait for Job to return to start building.
