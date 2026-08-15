// One-off maintenance script: wipes ONLY the demo account's journal entries
// and chat session (the demo User document itself is left untouched, along
// with its HealthData/RetrospectAnalysis), then seeds 30 days of long-form,
// continuous, first-person journal entries -- 250-500 words each, following
// one real narrative arc (a product launch at work, a manager conflict, a
// post-launch burnout crash, family/relationship threads) instead of the
// old seed.js's disconnected two-sentence demo lines. Each entry runs
// through the exact same real pipeline a live quick-entry does --
// extractThemes() for `themes` (no hand-authored keyword list) and
// embedJournalEntry() for semantic search -- so the seeded data behaves
// identically to real usage everywhere in the app (Retrospect themes, mood
// calendar, Core Memories globe, semantic journal search, health
// correlation).
//
// Run from server/: node src/scripts/seedDemoJournal.js
import mongoose from "mongoose";
import ChatSession from "../models/ChatSession.js";
import JournalEntry from "../models/JournalEntry.js";
import User from "../models/User.js";
import { env } from "../shared/config/env.js";
import { extractThemes } from "../shared/utils/extractThemes.js";
import { embedJournalEntry } from "../shared/services/embeddings.js";

// Ordered oldest -> newest. `daysAgo: 0` is today. One continuous voice
// across the month: Jordan (partner), Maya (best friend), Derek (manager),
// Elena/"Mom", Priya (sister), Dr. Chen (therapist), Biscuit (dog), and the
// "Meridian" launch as the throughline -- so themes/correlations/Retrospect
// have real, connected material to work with instead of isolated one-offs.
const entries = [
  {
    daysAgo: 29,
    mood: "happy",
    title: "Kickoff Day",
    tags: ["work", "launch", "intentions"],
    content: `Today was the official kickoff for the Meridian launch -- the project I've been quietly dreading and looking forward to in equal measure for the last month. Derek pulled the whole team into the big conference room at 9, the one with the bad AC, and walked through the timeline on the whiteboard like it was the most normal thing in the world to compress twelve weeks of work into seven. I felt that familiar flutter in my chest, half excitement and half dread, the kind I get right before something is going to demand a lot of me.

I volunteered to own the onboarding flow redesign, which I've wanted to touch for over a year. Jordan asked me at dinner why I looked so lit up talking about spreadsheets and Figma files, and I didn't have a great answer except that this is the kind of work that makes me feel like myself. There's a difference between being busy and being engaged, and today felt like the second one.

Still, I noticed myself doing the thing where I mentally start rehearsing all seven weeks of the project before I've even finished dinner. Maya texted to see if I wanted to grab coffee this weekend and I almost said no before catching myself -- that's exactly the instinct I want to get better at resisting this time around. Last year's crunch period cost me sleep, a chunk of my patience, and honestly some of the goodwill I had with Derek by the end of it, mostly because I never said out loud that the timeline felt unrealistic.

I want this round to be different. Not less ambitious, just more honest along the way. I'm writing that down here so future-me, probably typing this at 11pm in three weeks, can be held to it.

Biscuit fell asleep on my feet while I worked tonight, which is objectively the best part of my day.`,
  },
  {
    daysAgo: 28,
    mood: "calm",
    title: "Dinner with Jordan",
    tags: ["relationships", "work", "boundaries"],
    content: `Quieter day. I stayed late for a design review that went better than expected -- the onboarding wireframes landed well, and Derek only had two rounds of notes instead of his usual five, which I'm choosing to take as a good sign for how the next few weeks might go.

Jordan made pasta with the good tomatoes from the farmers market and we ate on the balcony even though it was a little too warm out. We didn't talk about work at all, which I'm realizing happens less often than it should. Instead we argued, in the fun way, about whether the new coffee place near the station is actually better than the old one (it isn't, I maintain this) and planned a trip we probably won't take until next spring at the earliest.

I've been trying to notice when my body actually feels calm versus when I'm just telling myself I'm calm because I'm tired. Tonight was the real thing -- shoulders down, breathing slow, no mental to-do list running in the background. I think it's because I made a decision this afternoon to not open my laptop again after 8pm, and somehow just having made the decision in advance took the pressure off completely. I didn't have to keep deciding not to work; I'd already decided.

Small thing, but I want to remember it: calm seems to come more from removing an option than from having more willpower in the moment. I'm not great at willpower. I might be okay at removing options.

Went to bed early. Biscuit did not, and spent twenty minutes doing what Jordan calls "the witching hour zoomies" around the apartment.`,
  },
  {
    daysAgo: 27,
    mood: "reflective",
    title: "What Pace Do I Actually Want",
    tags: ["reflection", "self-awareness", "boundaries"],
    content: `Woke up before my alarm again, which has been happening more since the kickoff, my brain apparently deciding 6:40am is a fine time to start running through onboarding flow diagrams. Instead of fighting it I made coffee and sat with the question that's been circling for a few weeks now: what pace do I actually want my life to run at, separate from what pace this particular project demands of me.

I think I conflate being valuable with being available. If Derek pings me and I answer within ten minutes, some part of me reads that as evidence I'm doing a good job, when really it's just evidence that I'm anxious. I don't think anyone on this team has ever actually asked me to respond that fast. I've just decided, somewhere along the way, that's the tax for being taken seriously.

Talked to Jordan about it a little at breakfast, not in a big dramatic way, just out loud while we were both half paying attention to toast. Jordan's read was that I do this in relationships too -- the fast-responding thing, the pre-empting what people need before they ask. Which stung a little because it's true, and because it means this isn't really a work problem, it's a me problem wearing a work costume.

I don't have a resolution here, just the noticing. I want to write down that noticing counts as progress even when nothing changes yet. It's tempting to feel like insight without immediate behavior change is wasted, but I don't actually believe that when I think about it clearly -- every real change I've made in the last few years started as an annoying, repeated observation exactly like this one before it turned into anything I could act on.

Went for a short walk with Biscuit before work. No epiphany, just quieter than usual.`,
  },
  {
    daysAgo: 26,
    mood: "happy",
    title: "Actually Finished a Run",
    tags: ["health", "gym", "work"],
    content: `Ran 4 miles this morning for the first time since spring without stopping to walk, and I'm disproportionately thrilled about it. There's a hill on the river route that has beaten me every single time I've tried it this year and today I just... didn't stop. Nothing about my training has been different, I think my body just decided today was the day.

Work was genuinely good too. The onboarding flow I've been sketching got its first real look from the design team and the feedback was almost entirely positive, with a few smart suggestions I hadn't thought of. Derek stopped by my desk to say the early direction "finally feels like something users would actually enjoy using," which from him is basically a standing ovation.

Grabbed a celebratory smoothie with Maya after work, we sat outside even though it started drizzling halfway through and neither of us cared. She's dealing with her own work stuff -- a promotion she wants but isn't sure she's ready to fight for -- and it was nice to be the one listening for once instead of the one unloading.

I keep noticing that the good days this month feel more earned than usual, like they mean more because I know how hard the next stretch is going to be. I don't love that framing, actually -- I don't want happiness to only register when it's rare or hard-won. I want to get better at just letting a good day be a good day.

Cooked a real dinner instead of ordering in. Small thing. Felt like a win anyway.`,
  },
  {
    daysAgo: 25,
    mood: "stressed",
    title: "First Real Crunch Day",
    tags: ["work", "stress", "sleep"],
    content: `First day that actually felt like crunch. Three meetings back to back, then a fourth that got added at 4pm because a stakeholder wanted "just twenty minutes" that turned into fifty. By the time I sat down to actually do design work it was almost 6 and I had maybe ninety focused minutes before I needed to leave to make it home for Jordan's work thing.

I hate the specific feeling of a day where I was busy the entire time but can't point to anything I actually finished. It's not the same as being tired from real effort -- it's a scattered, thin kind of tired, like I spent all day reacting instead of doing.

Derek moved up part of the internal review to Thursday, which I understand given the timeline but which also means the next 48 hours just got considerably tighter. I said "sounds good" in the meeting because everyone else did, and I'm annoyed at myself for that now, writing this at 9pm. I could have said the truth, which is that Thursday is tight but doable if nothing else gets added, and instead I said nothing and now I'm carrying both the tightness and the resentment of not having said anything.

Noticing a pattern here that I think I already half-know about myself: I default to agreeable in the room and process the actual feeling later, alone, usually too late to do anything useful with it. I want to try saying the true, slightly less convenient thing in the moment instead of after. Small experiment for tomorrow's stand-up.

My shoulders have been up near my ears most of the day. Did a few stretches before bed. Didn't help much but felt like at least doing something instead of nothing.`,
  },
  {
    daysAgo: 24,
    mood: "sad",
    title: "Missed Mom's Call",
    tags: ["family", "guilt", "attention"],
    content: `Mom called twice this afternoon and I let both go to voicemail because I was in back-to-back meetings, and by the time I actually listened to them at 7 it felt too late in the day to call back, which I know isn't really true, it's a two-hour time difference at most, but that's the story my brain told me and I let it stick.

Her voicemail was just checking in, nothing urgent, she'd seen a bird at the feeder that reminded her of the ones from the old house and wanted to tell someone. That specific detail is what got me. She used to tell me things like that in person all the time when I still lived close by, and now it's a voicemail I didn't answer live.

I don't think I'm homesick exactly, or not only that. I think I'm sad about the shape my attention has taken lately -- how full it is of Derek's timeline and Slack threads and onboarding flows, and how little room is left over for the people who aren't asking anything hard of me, who would just be glad to hear my voice for five minutes. The people who make no demands are somehow the easiest to deprioritize, which feels backwards when I actually write it out like that.

I called her back before bed. We talked for twenty minutes about nothing important -- the bird, a neighbor's new fence, whether I'm eating enough vegetables (her words). It helped, but it also didn't fully undo the heaviness from earlier. I think some of today's sadness isn't really about the phone call at all. It's about noticing, in one small moment, a bigger pattern I don't love in myself.

Going to try to call her on Sundays without being asked. Writing it here so it's a promise, not just a thought.`,
  },
  {
    daysAgo: 23,
    mood: "reflective",
    title: "Why That Hit So Hard",
    tags: ["family", "reflection", "relationships"],
    content: `Sat with yesterday's heaviness a bit more today instead of rushing past it. I think missing Mom's call landed the way it did because it's evidence for a fear I don't usually let myself look at directly -- that I'm becoming the kind of person who is reachable for everyone except the people who matter most, simply because they're the ones who won't complain about being deprioritized.

Jordan doesn't do that -- Jordan will absolutely complain, loudly and immediately, if I disappear into work for too long, and I think that's actually one of the things I love most, even when it's annoying in the moment. Mom won't. Maya mostly won't either, though she'll go quiet in a way I've learned to read. The people who let me off the hook easily are exactly the people I should be more deliberate about, not less.

I don't want to overcorrect into some dramatic life restructuring based on one heavy evening. But I do want to take the specific, small commitment from yesterday seriously -- calling Mom on Sundays, not waiting for her to call first. It's such a small thing to write down and such an easy thing to let slide in three weeks when the launch crunch peaks.

Tried to notice today whether I was doing the same "available for everyone except the safest people" pattern anywhere else, and I think work is actually the mirror image of it -- I'm hyper-available to Derek, who absolutely would complain, and less available to teammates who wouldn't push back. Something to keep watching.

Slept better than the last two nights. Small mercy.`,
  },
  {
    daysAgo: 22,
    mood: "stressed",
    title: "Thursday Review Looming",
    tags: ["work", "deadlines", "sleep"],
    content: `Two days until the internal review Derek moved up, and I can feel the shape of the next 48 hours already -- heads-down, minimal breaks, ordering dinner instead of cooking it. I used to think I did my best work under exactly this kind of pressure, and I'm starting to suspect that's a story I tell myself to make the pressure feel like a choice rather than a cost.

Spent most of today finishing the onboarding flow's edge cases -- what happens if someone abandons signup halfway, what happens on a failed verification, the unglamorous plumbing nobody notices unless it's broken. It's good work, genuinely, but it's the kind that eats hours without producing anything visually satisfying to show for it, which makes the day feel longer than it was.

Skipped lunch, which I always regret and always do anyway when a deadline gets close. Had a headache by 3pm that a granola bar and too much coffee did not fix. I know the actual fix is eating an actual meal at an actual time, and I know this every single time I skip one, and yet.

Jordan ordered takeout without asking what I wanted, which on a different day might have annoyed me and today was exactly the right call -- one less decision I had to make. Ate on the couch, didn't talk about work, watched something forgettable and low-stakes on purpose.

Tomorrow I want to actually take a real lunch. Writing it here because past-me clearly doesn't listen to just deciding it in my head. Maybe a note on the desk will do better.`,
  },
  {
    daysAgo: 21,
    mood: "angry",
    title: "The Scope Conversation",
    tags: ["work", "conflict", "boundaries"],
    content: `Angry in a way I haven't been in a while, and it's taken me most of the evening to figure out how much of it is actually about Derek versus how much is about me not saying anything sooner.

In today's review, Derek added two features to the onboarding flow that were never part of the original scope -- casually, in the meeting, like it was a minor tweak, while the timeline stayed exactly the same. Nobody else in the room pushed back, so I didn't either, even though I could feel my jaw tightening the entire time. Afterward I sat in an empty conference room for ten minutes before I could trust myself to go back to my desk and be normal about it.

The infuriating part isn't even the extra work, honestly -- it's that this is the third time this quarter he's done this exact move, and I've let it slide the first two times specifically because I didn't want to be "difficult." Which means some of this anger is really at myself, for building the pattern that made today possible. He's not wrong to keep doing it if it's kept working.

I drafted an email to him tonight, deleted it, drafted a calmer version, deleted that too. I don't think email is actually the right format for this -- it needs to be a real conversation where I can say, without it sounding like a threat, that the timeline only holds if scope doesn't keep growing, and that I need him to either protect the deadline or protect the scope, but not quietly erode both while expecting me to absorb the difference.

Jordan listened to me vent for a solid twenty minutes tonight and, credit where due, didn't try to fix it or talk me down from being annoyed, just let me be annoyed, which is apparently what I needed.

Going to ask for fifteen minutes with Derek tomorrow. Actually going to say the thing this time instead of processing it alone at 9pm like usual.`,
  },
  {
    daysAgo: 20,
    mood: "sad",
    title: "Didn't Have the Conversation",
    tags: ["work", "avoidance", "self-criticism"],
    content: `Didn't ask Derek for that fifteen minutes today. Told myself it was because the morning got busy, which is technically true and also not the real reason. The real reason is that by 10am my anger from last night had cooled into something closer to sad and tired, and sad-tired doesn't have the same activation energy that angry does. Angry wanted to have the conversation. Sad-tired just wanted to get through the day.

I feel a little disappointed in myself about it, though I'm trying not to layer shame on top of an already low day. I did the work today -- the actual output was fine, nobody would know anything was off. But there's a specific kind of tiredness that comes from doing fine work while quietly carrying something unresolved, and that's what today was.

I think I keep waiting for the "right" calm, unemotional moment to have hard conversations, and that moment mostly doesn't arrive on its own -- it has to be scheduled on purpose, ideally before the feeling has fully cooled into avoidance. Something to remember for next time, though I notice I write some version of this same lesson every few weeks, which is its own slightly discouraging pattern.

Low-key evening. Didn't feel like cooking or talking much. Jordan seemed to sense it and didn't push, just put a movie on and left space. Grateful for that kind of care that doesn't require me to explain myself first.

Going to try again tomorrow, earlier in the day this time, before the feeling has a chance to cool into something quieter and easier to postpone. Writing that down mostly so tomorrow-me has one less excuse available.`,
  },
  {
    daysAgo: 19,
    mood: "calm",
    title: "Coffee with Maya",
    tags: ["friendship", "support", "work"],
    content: `Got coffee with Maya this morning before work, something we used to do every week and have let slide to maybe once a month since her promotion push started and my launch crunch started. Good timing -- I needed it more than I realized.

Told her the whole Derek situation, the scope creep, the almost-conversation that didn't happen. She didn't offer advice right away, just asked good questions -- what am I actually afraid will happen if I bring it up directly. Turns out, when I said it out loud, the honest answer was something like "he'll think I can't handle pressure," which is a strange thing to be afraid of when I've handled two years of exactly this kind of pressure already.

Naming the actual fear made it smaller somehow. Not gone, but smaller -- more like a specific, addressable thing instead of a vague cloud following me around all week.

We also just talked about normal things for a while, her promotion case, a show we're both watching, whether either of us has the energy to plan anything social this month given how packed both our calendars are (verdict: probably not, and that's okay). It's strange how restorative an hour of just being known by someone can be, completely separate from whatever gets solved or not solved in the conversation.

Walked back to the office slower than I needed to. Felt settled for most of the day afterward, even through a mildly chaotic afternoon of last-minute review prep. I think I'm going to actually ask Derek for that conversation tomorrow, before the internal review, not after. Smaller ask, better timing.`,
  },
  {
    daysAgo: 18,
    mood: "reflective",
    title: "What Maya's Question Unlocked",
    tags: ["reflection", "friendship", "boundaries"],
    content: `Kept turning over that question from Maya yesterday -- what am I actually afraid will happen. It's such a simple thing to ask and I don't think anyone's asked me that directly in a long time, including myself.

I think a lot of my conflict-avoidance at work traces back further than this job, further than Derek. There's an old, familiar shape to it: don't be the one who complains, don't be the one who needs something, be the reliable one, because reliable people don't get left. I don't know exactly where that belief was installed, but I recognize it instantly once I see it named, the way you recognize your own handwriting.

I don't think the answer is to swing all the way to the other extreme and become someone who pushes back on everything. I actually like being reliable, and I don't want to lose that. I think the actual skill I'm missing is being able to be reliable and also honest about cost, instead of reliable meaning silently absorbing whatever gets added.

Wrote Derek a short, calm message asking for fifteen minutes tomorrow morning, before I could talk myself out of it again. Kept it simple: wanted to align on scope versus timeline before the review. No apology, no over-explaining, which took real effort to leave out.

Small, unglamorous progress. The kind that doesn't feel like much in the moment but that I suspect I'll be glad about later.

Told Jordan about sending it, half-expecting some big reaction, and got a simple "good, proud of you," which was somehow exactly the right size of response for a thing that felt enormous to me and genuinely small from the outside.`,
  },
  {
    daysAgo: 17,
    mood: "stressed",
    title: "The Conversation Happened, Mostly Fine",
    tags: ["work", "conflict", "stress"],
    content: `Had the fifteen minutes with Derek this morning. It went better than the version of it I'd been rehearsing anxiously for two days, though not perfectly -- he was a little defensive at first, said something like "I didn't realize it felt like that much," which is probably true and also probably wouldn't be true if I'd said something after the first time instead of the third.

We landed somewhere reasonable: the two added features get pushed to a fast-follow after launch instead of squeezing into this timeline, and he agreed to loop me in before adding scope going forward instead of announcing it live in a review. I don't fully trust that second part will hold under pressure, but it's a real commitment I can point back to if it doesn't.

Should have felt like relief, and it did, briefly, but the rest of the day was still genuinely stressful in its own right -- the internal review itself this afternoon, which went fine on the surface, no major red flags, but I could feel the particular tightness of performing competence while running on not enough sleep and too much coffee.

I keep noticing that resolving one source of stress doesn't reset the whole system the way I want it to. My shoulders are still up near my ears even though the thing that put them there is technically handled. I think stress has a kind of lag to it, longer than I expect, and I keep being surprised by that every time even though it's happened before.

Going to try to actually rest this weekend instead of using it to get ahead on next week. We'll see if I actually do that or just write the intention down again.`,
  },
  {
    daysAgo: 16,
    mood: "stressed",
    title: "Didn't Rest, Obviously",
    tags: ["work", "sleep", "health"],
    content: `Did not, in fact, rest this weekend. Told myself I'd work "just Saturday morning" to get ahead, which turned into most of Saturday and a chunk of Sunday too, because once I opened the laptop the actual scope of what's left before launch became very visible and very hard to un-see.

Physically I can feel it now -- tight neck, a headache that's been low-grade for two days, and I noticed my hands were slightly shaky after too much coffee and not enough food again today. None of this is dramatic or alarming, just the accumulated cost of three weeks of this pace without a real off day in between.

Jordan gently pointed out at dinner that I've said some version of "I'll rest this weekend" for three weekends running now, and asked, not unkindly, whether I actually believe that anymore or whether it's become a thing I say to make the current push feel temporary. That landed harder than I expected. I don't have a good answer.

I think the honest version is that with eight days left until launch, an actual full rest day isn't realistic right now, and pretending otherwise just sets up another broken promise to myself. What might be realistic is smaller -- a real two-hour block on Sunday with the laptop physically in another room. Lower bar, but one I might actually clear.

Going to try that next weekend instead of the bigger, nicer-sounding promise I keep not keeping. Lower the bar until I can actually clear it, then raise it again once clearing it feels normal instead of aspirational.`,
  },
  {
    daysAgo: 15,
    mood: "reflective",
    title: "Dr. Chen Session",
    tags: ["therapy", "reflection", "family"],
    content: `Had my session with Dr. Chen today, first one in a few weeks since scheduling got messy with the launch. Told her about the Derek conversation, the missed call with Mom, the pattern Maya's question surfaced two weeks ago. She connected some dots I hadn't quite put together myself.

Her read: a lot of what I've been journaling about this month -- over-responding to Derek, under-responding to Mom, avoiding the scope conversation until anger forced it, promising myself rest I don't deliver -- is one pattern wearing different outfits. Something like: I trust urgency more than I trust my own judgment about what actually matters. If something is loud and immediate, I show up for it completely. If something is quiet and doesn't complain, I let it wait, even when it's more important.

That reframe stuck with me more than I expected. It's not really about Derek or Mom or rest specifically -- it's about which signal I let set my priorities. Loud, urgent, external signals win by default, and quiet, important, internal ones lose by default, unless I deliberately overweight them.

We talked about one small experiment: at the start of each day, name one "quiet important thing" on purpose, separate from whatever's loudest, and give it real time before the loud stuff eats the whole day. Not a productivity hack, more a way of practicing trusting my own sense of what matters over whatever's shouting the loudest.

Left feeling lighter than I have in a couple weeks, even though nothing external changed today. There's something genuinely useful about finally having language for a pattern I could feel but couldn't quite name. I think that's most of what today's session actually did -- not solved anything, just made something visible enough to work with.

Going to try the quiet-important-thing experiment starting tomorrow. Today's would probably have been calling Mom back before the day got away from me, which, notably, I did.`,
  },
  {
    daysAgo: 14,
    mood: "happy",
    title: "Onboarding Flow, Actually Done",
    tags: ["work", "gratitude", "relationships"],
    content: `Finished the onboarding flow today -- actually finished, not "90% done with edge cases pending" finished. Sent it to Derek and the team for final sign-off and got back mostly enthusiastic responses, including one from a teammate I don't usually hear from much who said the failed-verification flow was "the first time this app has ever apologized to me instead of just failing." Genuinely made my week.

Tried the quiet-important-thing experiment from yesterday's session -- this morning before checking Slack, I spent twenty minutes on a personal project I've been meaning to start for months, a small photo book from a trip Jordan and I took last year that's been sitting half-organized in a folder since. It felt almost illicit, doing something with no deadline and no stakeholder attached to it, first thing in the morning, before the loud stuff had a chance to grab me.

Celebrated finishing the flow with Jordan over dinner out, nothing fancy, just the noodle place near the apartment we both actually like instead of default-ordering in again. Talked about the trip photos a little, which felt full-circle given the morning.

I notice today's happiness feels different from earlier in the month -- less relief-shaped, more just genuinely good. I think that's the difference between a good day that happens to you and a good day that comes from something you actually built. The onboarding flow took three weeks and a hard conversation with Derek and a lot of stressed evenings to get here, and today it just quietly worked. That feels earned in the good way, not the exhausting way.

Slept eight hours. First time in a while.`,
  },
  {
    daysAgo: 13,
    mood: "calm",
    title: "Quiet Saturday Morning",
    tags: ["health", "relationships", "rest"],
    content: `Actually did the smaller version of rest I promised myself last week -- laptop in the bedroom, out of sight, and a real slow morning instead of a working one. Made a proper breakfast, sat on the balcony with coffee and no agenda for almost two hours, which might be a record for this month.

Jordan and I ended up doing almost nothing productive by any normal definition and it was exactly what the week needed. Walked to the farmers market, bought too many tomatoes again, took the long way home past the park where Biscuit could actually run instead of the quick around-the-block loop we've been doing on weeknights.

Kept coming back to something from Dr. Chen's session -- the idea that quiet things need to be deliberately prioritized or they lose by default. Today felt like proof of concept. Nothing about this morning was urgent or loud, and if I hadn't decided in advance to protect it, some version of "just checking Slack for five minutes" would have eaten the whole thing, the way it usually does.

Seven days until launch. I can feel the next week gathering itself, the particular quality of anticipation before a big push. But today I actually feel rested going into it, which hasn't been true for any of the previous three weekends this month, and I want to notice that difference on purpose instead of letting it pass without registering it.

Short entry today. Sometimes a calm day doesn't need much said about it, which might be the whole point.`,
  },
  {
    daysAgo: 12,
    mood: "stressed",
    title: "Final Week",
    tags: ["work", "deadlines", "sleep"],
    content: `Final week before launch officially started today, and it has that specific texture I remember from every big push -- time both dragging and evaporating at once, where a single day feels enormously long while you're in it and the whole week somehow disappears anyway.

QA found two real bugs in the verification flow this afternoon, not catastrophic but the kind that needed same-day fixes, which meant reshuffling tomorrow's plan entirely. Spent the evening pairing with one of the engineers, Sam, to track down an edge case that only reproduced on a specific browser version, the kind of bug that eats three hours and turns out to be one missing null check.

I noticed I handled today's chaos better than I would have three weeks ago, and I think it's actually the small stuff -- the Derek conversation, the quiet-important-thing mornings, actually resting last weekend -- compounding rather than any one big fix. Stress doesn't feel gone, it's still very present, but it feels more like weather I'm dressed for instead of something ambushing me.

That said, my sleep is already starting to slip again, and I can feel the old pattern wanting to reassert itself -- work later, skip the walk, eat standing up at the counter instead of sitting down. I don't think I can avoid this week being genuinely hard. I don't think that's even the goal anymore. The goal is getting through a genuinely hard week without abandoning every single thing I've been practicing this month the moment it gets inconvenient.

Small experiment for the rest of this week: keep the twenty-minute morning thing even if it means starting the actual workday twenty minutes later. Testing whether it survives contact with real pressure or was only ever possible in a calmer week.

Six days to launch.`,
  },
  {
    daysAgo: 11,
    mood: "angry",
    title: "Bug, and Me",
    tags: ["work", "self-criticism", "friendship"],
    content: `Frustrating day, and if I'm honest, more at myself than at anyone else, though a specific bug bore the brunt of it out loud for about ten minutes this afternoon.

A fix I pushed yesterday for the verification edge case broke something else entirely -- a fairly basic regression I should have caught with a five-minute manual test before merging, and didn't, because I was rushing to close it out before end of day. Sam caught it in this morning's QA pass, which is exactly what QA is for, and objectively nothing bad happened because of it. But I still spent a chunk of the afternoon annoyed in a way that was disproportionate to a caught, fixed bug six days before launch.

I think the anger is really about the gap between the version of this week I described in yesterday's entry -- dressed for the weather, handling it better -- and today's reality, which was rushed and sloppy in exactly the way I said I wanted to avoid. It's uncomfortable to write a hopeful entry and then immediately do the thing you said you were getting better at not doing.

Talked to Sam about it directly, actually, instead of stewing -- said something like "sorry, that was a rushed fix, thanks for catching it," which is a small, ordinary thing to say and also not something I would have said out loud a month ago without turning it into a bigger self-flagellating deal first.

I don't think today undoes the last few weeks' progress. I think it's evidence that progress isn't linear, and that a hard week can produce both a genuine slip and a genuinely better response to the slip, at the same time. Trying to hold both of those without picking one to be "the real story" of today.

Five days to launch.`,
  },
  {
    daysAgo: 10,
    mood: "stressed",
    title: "Launch Eve",
    tags: ["work", "anxiety", "relationships"],
    content: `Tomorrow's the day. Everything that can reasonably be tested has been tested, everything that can reasonably be prepared has been prepared, and there's still that specific pre-launch feeling of standing at the edge of something you can't fully control anymore no matter how ready you are.

Derek sent a genuinely kind message tonight to the whole team, actually naming specific people's contributions instead of the usual generic "great work everyone." Mine mentioned the onboarding flow by name and said the "apologizes instead of fails" line from a few weeks back had made it into his own thinking about the whole product. Small thing, but it landed.

Couldn't fully wind down tonight even though there's genuinely nothing left to do -- the particular kind of tired where your body wants sleep and your brain wants to keep running through scenarios that have already been accounted for twice. Did the stretches, made the tea, all the usual wind-down things, and still lay awake longer than I wanted to.

Jordan reminded me, not for the first time this month, that I've done this before and it's gone fine before, which is true and which I know and which doesn't fully reach the anxious part of my brain that doesn't operate on evidence at 11pm. Said it anyway, which I appreciated even without it fully working.

Whatever happens tomorrow, I want to remember that the work itself -- the actual flow, the actual fixes, the actual late nights with Sam -- was good. Genuinely good, not just "good enough under pressure." That part isn't riding on tomorrow going perfectly.

Launch day tomorrow.`,
  },
  {
    daysAgo: 9,
    mood: "happy",
    title: "Launch Day",
    tags: ["work", "gratitude", "relationships"],
    content: `It shipped. It's live. After seven weeks it's an actual real thing that actual real users are clicking through right now instead of a Figma file or a staging environment.

The morning was tense in the specific way launch mornings are -- final checks, a nervous stand-up, Derek pacing near the deploy dashboard like watching it harder would make it go smoother. It did not, notably, need that. The deploy went cleanly, no major incidents, no 3am pages, just a quiet, almost anticlimactic "it's up" in the team channel around 10am that took me a solid minute to fully register.

Watched the early metrics come in over the afternoon -- completion rate on the new onboarding flow already tracking meaningfully higher than the old one, which is exactly the thing I spent three weeks and a hard conversation with Derek fighting for. There's something genuinely moving about seeing a number move because of specific decisions I made about specific screens, even though I know rationally that a hundred small things had to go right for that number to move at all.

Team went out for drinks after work, the first time this whole team's been together outside a conference room in months. Derek bought the first round and, unprompted, brought up the scope conversation from a few weeks ago, said something like "you were right to push back, for what it's worth," which is about as close to a direct apology as I think he does, and I'll take it.

Came home exhausted in the good way, the way that comes after something real gets finished instead of something merely survived. Jordan had a small cake, of all things, waiting on the counter. Didn't expect that. Cried a little, actually, which surprised me.

It shipped.`,
  },
  {
    daysAgo: 8,
    mood: "calm",
    title: "The Day After",
    tags: ["rest", "family", "hobby"],
    content: `Quiet day, deliberately. Slept in for the first time in what feels like a month, woke up without an alarm to Biscuit staring directly at my face, which is objectively an unpleasant way to wake up and somehow still felt nice given the alternative of waking up already anxious about the day.

No launch fires today, which I'd half-braced for despite yesterday going cleanly -- the metrics are still holding steady, nothing broke overnight, and I found myself checking the dashboard out of habit a few times anyway before consciously deciding to stop and actually let the day be as quiet as it wanted to be.

Spent the afternoon on the photo book project again, further than the twenty-minute morning version from a couple weeks back -- actually laid out a dozen spreads, picked a cover image, ordered a proof copy. It felt good to give real, unhurried time to something that exists purely because I want it to, with no launch date and no stakeholders and no Derek.

Called Mom, unprompted, just because it was Sunday, the way I said I would back at the start of the month. Talked for almost forty minutes this time, longer than either of us probably expected. She mentioned the bird feeder again. I actually asked follow-up questions this time instead of half-listening.

Noticing how different calm feels today compared to earlier calm days this month -- less like the absence of stress and more like something I chose and protected on purpose. Small distinction, but it feels like an important one to hold onto going into whatever September ends up looking like.`,
  },
  {
    daysAgo: 7,
    mood: "sad",
    title: "The Crash",
    tags: ["health", "burnout", "relationships"],
    content: `Hit a wall today that I think has been building since launch day and just caught up with me now that there's nothing urgent left to run on. Woke up flat, low-energy, not sad about anything specific, just sad in that diffuse, hard-to-point-at way that's honestly harder to explain to people than a clear reason would be.

Called in a personal day, which I almost didn't do -- some part of me still wanted to treat this as weakness rather than the entirely predictable comedown after seven weeks of sustained adrenaline finally has nowhere left to go. Dr. Chen's had a name for this before: the crash isn't a failure of the push, it's the bill for it, and it always comes due eventually whether or not you've scheduled time for it.

Spent most of the day doing very little. Watched something forgettable, didn't answer texts for a few hours, cried at one point for no reason I could clearly identify, which felt embarrassing in the moment and, writing it now, actually seems like a fairly reasonable response to a body finally getting permission to stop holding everything together.

Jordan came home early without me asking and didn't try to fix the day, just existed nearby, made tea, put a hand on my shoulder while I stared at nothing for a while. I don't think I said much of anything useful to explain what was going on, and I don't think I needed to.

I know rationally this isn't a step backward from the last few weeks of progress -- if anything it's what letting the stress actually finish processing looks like, instead of stuffing it down and calling it resilience. Still doesn't feel great in the moment. Trying to let today just be a low day instead of a problem I need to solve by tomorrow.`,
  },
  {
    daysAgo: 6,
    mood: "reflective",
    title: "What the Crash Taught Me",
    tags: ["reflection", "health", "gratitude"],
    content: `Felt more like myself today, though still slower than usual, like recovering from a mild flu that was actually just a month of sustained stress with nowhere to go until now. Thinking a lot about yesterday, and about the shape this whole month has actually taken when I look at it end to end rather than day by day.

I think I went into this launch believing that handling pressure well meant not feeling its cost until afterward, and some part of me is realizing that's backwards, or at least incomplete. The stress didn't disappear because I managed my way through it well -- it got paid, just later than I expected, in one dense day instead of spread thin across the month. I don't know yet whether that's actually worse than the alternative or just differently shaped.

What I do think changed for the better this month: I said the hard thing to Derek instead of sitting on it for a fourth time. I called Mom back, and then kept calling her, instead of letting the pattern quietly continue. I let a rest day be small and achievable instead of an all-or-nothing promise I kept breaking. None of that prevented yesterday's crash, but I don't think prevention was ever realistic for something this size. What it did was make the month leading up to the crash meaningfully less lonely and less avoidant than it would have been otherwise.

Maybe that's actually the honest goal, going forward -- not preventing every hard landing, just making sure I'm not doing the hard stretch alone or in total denial about its cost. That feels like a more sustainable version of "handling pressure well" than the one I walked in with seven weeks ago.

Going for a short, slow walk later. Not trying to be productive about recovering. Just recovering.`,
  },
  {
    daysAgo: 5,
    mood: "happy",
    title: "Hike with Jordan",
    tags: ["relationships", "hobby", "health"],
    content: `First real day off in what feels like forever, no half-checking Slack, no laptop even in the apartment -- Jordan physically hid it, which I found both funny and slightly necessary. Drove out early to the trail we keep saying we'll do and keep not doing, the one with the overlook about two hours up that everyone says is worth it.

It was worth it. Brought the camera for the first time in months, actual camera, not just my phone, and took an embarrassing number of photos of the same ridge line in slightly different light as the morning went on. Something about having a task with literally no stakes -- nobody needs these photos, nothing depends on them being good -- made the whole day feel unusually light.

Jordan and I talked, really talked, for most of the drive back, about the last two months, about the launch, about the crash a few days ago, about what I actually want the next stretch of work to look like versus what I default into without deciding on purpose. Nothing was resolved in some neat, tidy way, but it felt good to say a lot of it out loud to the person who watched most of it happen up close.

Got back exhausted in the purely physical, uncomplicated way -- legs tired, a little sunburned, hungry for something that wasn't a snack bar. Ordered way too much food and ate on the floor because neither of us wanted to deal with plates. Simple, good day. The kind I want more of, on purpose, not just as a reward that has to be earned by surviving something hard first.

Printed one of the photos when we got home. Ridge line, golden light. Going up on the wall.`,
  },
  {
    daysAgo: 4,
    mood: "calm",
    title: "Priya's Visit",
    tags: ["family", "rest", "gratitude"],
    content: `My sister Priya came by for the weekend, first time in a few months, and it was the specific kind of calm that only happens around family you're actually close to -- low-effort, no agenda, comfortable silences included.

We didn't do anything particularly notable. Cooked together, badly attempted her attempt at Mom's dal recipe from memory, which came out fine but not quite right, the way it never quite is without Mom actually there correcting the spices in real time. Walked Biscuit together, who was thrilled to have double the attention. Watched old family videos on her laptop at one point, which somehow led to both of us laughing until we couldn't breathe about a birthday party disaster from probably fifteen years ago.

Told her a condensed version of the last two months -- the launch, the Derek thing, the crash. She listened well, asked one really good question near the end: whether I actually like my job or whether I've just gotten good at surviving it. I didn't have an immediate answer, which is itself sort of an answer, though not necessarily a bad one. I think the honest version is that I like specific parts of it a lot -- the actual craft, the moments like launch day -- and I'm less sure about the parts I've just gotten used to tolerating.

Good weekend. Quiet in the way that doesn't need much explaining after a month like this one. Priya left this evening. Apartment feels a little too quiet now that she's gone, in the nice way that means the company was genuinely missed rather than merely present.`,
  },
  {
    daysAgo: 3,
    mood: "reflective",
    title: "One Month, Looking Back",
    tags: ["reflection", "work", "family"],
    content: `Roughly a month since the Meridian kickoff entry that started this stretch of journaling, and I wanted to actually sit with the whole arc of it rather than just moving on to whatever's next without looking back.

Reading back through the month, I notice how much of it wasn't really about the launch at all, even though the launch was the loudest, most obvious thread running through it. The quieter through-line was about attention -- where I put it by default versus where I actually want it to go. Derek got fast, anxious attention by default. Mom got deprioritized by default. Rest got postponed by default. None of that was really about capacity; it was about which signals I trust automatically and which ones I have to consciously choose to honor.

What actually changed, concretely: I had the scope conversation with Derek instead of letting it fester a fourth time. I started calling Mom on Sundays without being asked and I've actually kept it going three weeks running now. I let "rest" mean something small and real instead of an all-or-nothing promise. I noticed the crash after launch and let it be a crash instead of pushing through it and calling that strength.

None of this fixed the underlying pattern Dr. Chen named a few weeks back -- I don't think a pattern that old fixes in a month, and I'd be suspicious of myself if I thought it had. But I do think I have better handles on it now than I did at the start: a name for it, a few concrete counter-moves that actually worked at least some of the time, and enough evidence from this month that the counter-moves are worth the discomfort of trying them.

Going into next month, I want to carry forward specifically: the Sunday calls with Mom, the small-rest-not-big-rest framing, and saying the true thing to Derek closer to the first time instead of the third. Modest goals. I think modest and actually kept beats ambitious and abandoned, which itself might be the real lesson of this whole month.`,
  },
  {
    daysAgo: 2,
    mood: "angry",
    title: "Retro Meeting Annoyance",
    tags: ["work", "conflict", "boundaries"],
    content: `Launch retro meeting today, which was mostly fine and productive right up until the last ten minutes, when Derek casually floated the two "fast-follow" features we'd explicitly agreed to defer as if they were already scheduled for next sprint, in front of the whole team, without having looped me in first -- the exact thing he agreed a few weeks ago he'd stop doing.

I said something in the moment this time, at least, which is real progress even if the something wasn't perfectly calm -- pointed out that we'd need to actually scope and plan that separately, not just assume it slots in immediately. He backed off reasonably gracefully, said "fair, let's set up time for that properly," which is a better outcome than staying silent and stewing about it for two days like last time.

Still annoyed on the walk home, mostly because it's confirmation that the agreement from a few weeks ago is more of a "when I remember to" commitment than a real structural change on his end, and that keeping this boundary is probably going to be an ongoing, recurring effort rather than a one-time fix. I don't love that. Some part of me wanted the one hard conversation to have solved it permanently.

Talked to Jordan about it, who pointed out, correctly if a little annoyingly, that I did actually handle it better in real time than I would have a month ago, and that "ongoing effort" isn't the same as "failed." Grudgingly, fairly, true. Doesn't make tonight less annoying, but I can hold both things -- annoyed at the pattern recurring, and genuinely glad I didn't just absorb it silently again.`,
  },
  {
    daysAgo: 1,
    mood: "calm",
    title: "Actually Followed Up",
    tags: ["work", "boundaries", "rest"],
    content: `Set up real time with Derek today to properly scope the fast-follow features from yesterday's retro, instead of letting it stay a vague, half-agreed thing hanging over the next few weeks. Went in with a rough estimate already prepared instead of waiting for him to drive the conversation, which felt different -- less reactive, more like someone bringing a plan instead of someone absorbing whatever gets handed to them.

He was receptive, actually engaged with the estimate instead of just accepting or dismissing it, and we landed on a scoped, reasonable timeline that doesn't require another crunch stretch to hit. Small thing, but doing this proactively instead of waiting for scope to arrive unannounced again felt like the actual structural fix that the conversation a few weeks ago was reaching for but didn't quite land on its own.

Left the meeting feeling calm in a way that's different from the earlier calm days this month -- less like relief after avoiding something, more like the ordinary, unremarkable calm of having handled something reasonably well and moved on. I think that's actually a better kind of calm to be aiming for generally: not the dramatic peace after a storm, just the quiet competence of handling things as they come.

Quiet evening otherwise. Cooked, walked Biscuit, read for a bit instead of scrolling before bed, which has been happening more often lately without me deciding it on purpose -- maybe a sign that some of this month's practice is starting to become just how things are, rather than something I have to actively remember to do.`,
  },
  {
    daysAgo: 0,
    mood: "reflective",
    title: "Where I'm At",
    tags: ["reflection", "gratitude", "family"],
    content: `End of the month, and I wanted to close this stretch of journaling the same deliberate way I opened it, rather than just letting it trail off into whatever comes next without marking it.

Looking back at day one, kickoff day, I wrote that I wanted this launch to be different -- not less ambitious, just more honest along the way. Reading it again now, I think that mostly held, more than I expected it to when I first wrote it down half-hoping and half-doubting it would actually happen. I said the hard thing to Derek, more than once, including today's version of it that felt almost ordinary compared to how much it cost me to say it the first time. I kept the Sunday calls with Mom going for a full month, not perfectly, but for real. I let rest be small and real instead of big and broken. I let the post-launch crash be a crash instead of pretending it wasn't happening.

None of that came from some big insight that fixed everything at once. It came from Maya asking one good question over coffee, and Dr. Chen naming a pattern I could feel but couldn't name myself, and Jordan pointing out things I couldn't see from inside my own head, and a lot of small, unglamorous repetition -- writing the same intention down more than once, failing at it, trying again a few days later with slightly better odds.

Going into next month, work looks calmer for now -- the fast-follow features are properly scoped, nothing urgent is looming the way Meridian was for seven straight weeks. I want to use that calmer stretch on purpose, not just let it happen to me: keep the Sunday calls, keep some version of the quiet-important-thing mornings, maybe actually finish that photo book instead of leaving it half-laid-out in a folder.

Mostly, I want to remember that this month proved something I'd sort of stopped believing: that the patterns I've been stuck in for years aren't fixed, they're just old and well-practiced, and a month of consistent small counter-moves genuinely does bend them. Slowly, imperfectly, but really.

Biscuit is asleep on my feet again, same as day one. Some things, at least, stay simple.`,
  },
];

function wordCount(text) {
  return String(text).trim().split(/\s+/).filter(Boolean).length;
}

async function run() {
  await mongoose.connect(env.MONGO_URI);

  const demo = await User.findOne({ email: env.DEMO_EMAIL });
  if (!demo) {
    console.error(`No demo user found for ${env.DEMO_EMAIL} -- run npm run seed first, or check DEMO_EMAIL.`);
    await mongoose.disconnect();
    process.exit(1);
  }

  // Sanity-check every entry is really in the requested 250-500 word range
  // before touching the database, so a copy-paste slip fails loudly instead
  // of silently seeding a too-short/too-long entry.
  const outOfRange = entries
    .map((e) => ({ title: e.title, words: wordCount(e.content) }))
    .filter((e) => e.words < 250 || e.words > 500);
  if (outOfRange.length) {
    console.error("Entries outside the 250-500 word range:", outOfRange);
    await mongoose.disconnect();
    process.exit(1);
  }

  const [journalsDeleted, chatDeleted] = await Promise.all([
    JournalEntry.deleteMany({ userId: demo._id }),
    ChatSession.deleteMany({ userId: demo._id }),
  ]);
  console.log(`Cleared for ${demo.email}: ${journalsDeleted.deletedCount} journal entries, ${chatDeleted.deletedCount} chat session(s).`);
  console.log("Demo user account left untouched.\n");

  const now = Date.now();
  const docs = entries.map((e) => {
    // Spread across the day rather than all at midnight, so createdAt looks
    // like a real person journaling at a plausible hour (mostly evenings,
    // matching the reflective/end-of-day voice of the content itself).
    const createdAt = new Date(now - e.daysAgo * 24 * 60 * 60 * 1000);
    createdAt.setHours(20, 30 + (e.daysAgo % 20), 0, 0);
    return {
      userId: demo._id,
      content: e.content.trim(),
      mood: e.mood,
      title: e.title,
      tags: e.tags,
      themes: extractThemes(e.content),
      createdAt,
      updatedAt: createdAt,
    };
  });

  // .create() (not .insertMany()) -- content/title/tags/themes are encrypted
  // via Mongoose setters that only .create() reliably runs, same reasoning
  // documented in seed.js.
  const created = await JournalEntry.create(docs);
  console.log(`Seeded ${created.length} journal entries (${entries[0].daysAgo} days ago -> today).\n`);

  // Real embeddings so semantic search ("Memory Search" on the Journal page)
  // works over this seeded data exactly like it does for real entries --
  // awaited here (not fire-and-forget like the live quick-entry route) since
  // this is a one-off batch script and we want to know if Ollama's embedding
  // model isn't reachable/pulled rather than silently finishing with no
  // embeddings.
  let embedded = 0;
  for (const entry of created) {
    const ok = await embedJournalEntry(entry);
    if (ok) embedded += 1;
    process.stdout.write(ok ? "." : "x");
  }
  console.log(`\nEmbedded ${embedded}/${created.length} entries.`);
  if (embedded < created.length) {
    console.log("Some entries weren't embedded -- check Ollama is running with nomic-embed-text pulled (ollama pull nomic-embed-text), then re-run: npm run embed-journals -- --force");
  }

  console.log("\nDone.");
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
