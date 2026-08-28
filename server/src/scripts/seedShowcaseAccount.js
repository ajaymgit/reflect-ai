// One-off script: creates a BRAND NEW account (separate from the real demo
// account, env.DEMO_EMAIL) and seeds it with two full months of realistic,
// continuous data -- journal entries, health readings, a chat history, and a
// Retrospect analysis -- so the app can be shown off at full depth without
// touching the actual demo account's data at all.
//
// Story: Nora Whitfield, six weeks into a cross-country move and a new job
// as Senior Marketing Manager at a company called Arcvale, told first-person
// across Aug 1 - Sep 30. One continuous cast: Theo (partner), Val (new
// friend from a run club), Renata (manager), Carol (mom), Owen (brother),
// Dr. Osei (therapist, starting partway through), and Pepper (a cat adopted
// partway through) -- so themes/tags/Retrospect/health correlation all have
// real, connected material instead of disconnected one-offs. Mirrors the
// proven shape of seedDemoJournal.js (adjust -> conflict -> crash ->
// recovery -> integration) with an entirely different specific story so it
// doesn't read as a reskin of the existing demo account.
//
// Run from server/: node src/scripts/seedShowcaseAccount.js
// Safe to re-run -- fully wipes and recreates this one account each time.
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import ChatSession from "../models/ChatSession.js";
import HealthData from "../models/HealthData.js";
import JournalEntry from "../models/JournalEntry.js";
import RetrospectAnalysis from "../models/RetrospectAnalysis.js";
import User from "../models/User.js";
import { env } from "../shared/config/env.js";
import { extractThemes } from "../shared/utils/extractThemes.js";
import { embedJournalEntry } from "../shared/services/embeddings.js";

const SHOWCASE_EMAIL = "showcase@reflectai.com";
const SHOWCASE_PASSWORD = "Showcase@123";
const SHOWCASE_NAME = "Nora Whitfield";

// Ordered oldest -> newest, real calendar dates (not "days ago") since the
// whole point is a specific two-month window, Aug 1 - Sep 30 2026, not a
// window relative to whenever this script happens to run.
const entries = [
  {
    date: "2026-08-01",
    mood: "reflective",
    title: "Six Weeks In",
    tags: ["relocation", "reflection", "gratitude"],
    content: `Six weeks since the movers pulled away and it still doesn't quite feel like my apartment, more like a very well-appointed hotel I haven't checked out of yet. I keep reaching for light switches that aren't where they were in Chicago. Small, dumb thing, but it happens multiple times a day and every time it's a little reminder that I chose to make everything unfamiliar at once.

Work starts for real on Monday -- I've had orientation and paperwork so far, nothing that actually tests whether taking this job was the right call. I'm nervous about it in a way I wasn't expecting to still be, six weeks out. Senior Marketing Manager sounded like a clean, deserved next step when I said yes back in June. It sounds a lot bigger sitting here the weekend before it actually starts.

Theo's been unpacking boxes faster than me, mostly I think to give me something to feel behind on that isn't the job itself. Found the last box of kitchen stuff today, including the mug Owen gave me for my birthday two years ago, and just sat on the floor holding it for a minute longer than the moment really required.

Trying to let "unfamiliar" and "wrong" be two different feelings instead of automatically treating the first one as evidence for the second.`,
  },
  {
    date: "2026-08-03",
    mood: "stressed",
    title: "First Big Meeting",
    tags: ["work", "anxiety"],
    content: `First real strategy meeting today, my whole new team plus Renata, and I spent most of the drive in rehearsing things to say that I then didn't say because someone else said something adjacent first and I lost my window. Classic new-job anxiety, I know the shape of it, knowing the shape of it did not make it feel any less real at 9am.

Renata seems sharp and fast-moving, the kind of manager who thinks out loud in a way that's either energizing or terrifying depending on whether you're keeping up. I mostly kept up. There was one stretch about the Q4 campaign calendar where I genuinely didn't, and I said so instead of nodding along, which felt like a small, specific risk to take in week one.

Nobody reacted like it was a big deal. I reacted like it was a big deal, internally, for the rest of the afternoon.

I used to think impostor syndrome was something you grew out of with enough seniority. I have more title now than I've ever had and somehow the feeling is exactly as loud as it was at my very first job. Maybe louder, actually, because now there's more to visibly lose.

Theo asked how it went and I said "fine, I think," which was true and also not the whole story.`,
  },
  {
    date: "2026-08-05",
    mood: "happy",
    title: "Run Club",
    tags: ["health", "friendship"],
    content: `Found a Tuesday/Thursday run club along the river through an app, mostly to force myself to have a life here that isn't just apartment-to-office-to-apartment. Showed up not knowing a single person, which is a specific kind of vulnerable I haven't had to be in a long time -- I usually meet people through work or through Theo, not by just standing alone at a meeting point hoping I picked the right pace group.

Ended up next to a woman named Val for most of the four miles, mostly because we both fell off the front pack around mile two and had no choice but to talk to each other or run in silence, and silence felt weirder. She's a physical therapist, moved here from Denver three years ago, and said something that stuck with me -- that the first year in a new city is basically just collecting proof that you can build a life somewhere on purpose instead of by accident, the way it mostly happens when you're younger.

We're doing it again Thursday. I don't know if this becomes an actual friendship or stays a nice recurring conversation with a stranger, but either way it's the first time since the move that a Tuesday has felt like something other than a day to get through.

Legs are wrecked. Worth it.`,
  },
  {
    date: "2026-08-08",
    mood: "sad",
    title: "Missing Chicago",
    tags: ["homesickness", "family"],
    content: `Saw a photo dump in the group chat tonight -- everyone at the lake house for the weekend, the one we've gone to every August for six years running, minus me this time. Nobody did anything wrong, I'm the one who moved, of course they still went. Still sat with my phone for longer than I want to admit, scrolling through photos of a dock I know exactly how sun-warm the wood gets by 2pm, a place I wasn't in.

It's a strange, specific grief, missing an event you knew you'd miss, that you agreed to miss when you took this job. Doesn't make it hurt less in the moment, just means I can't be surprised by it.

Told Theo I was feeling it and got a genuinely good response -- no fixing, no "but think about all the new things," just sitting next to me on the couch while I looked at lake photos and being quietly there. I think that's actually the whole ask most of the time when I say I'm sad about the move. Not a solution. Just company in the missing.

Texted the group chat something normal and light so I wouldn't be the person who makes everyone feel guilty for having a nice weekend without me. Not sure that's the healthiest instinct but it's the one I had tonight.`,
  },
  {
    date: "2026-08-11",
    mood: "reflective",
    title: "Small Wins",
    tags: ["work", "self-awareness"],
    content: `Got my first campaign brief approved today with almost no notes, which after last week's anxious meeting spiral felt disproportionately huge. Renata's exact words were "yeah, ship it," which I've learned in two weeks is about as enthusiastic as she gets in writing, and I screenshotted it anyway like a child.

I think what actually happened this week is I stopped trying to prove I belonged in the abstract and just did one specific piece of work well. Obvious in hindsight. Wasn't obvious on Monday, when the anxiety was still mostly about a general feeling of not-yet-earned rather than anything concrete I could point to and improve.

Noticing a pattern I want to remember: the fear is loudest right before I actually start something, and almost always quieter once I'm a few real hours into doing the work itself. The doing seems to be the actual antidote, not more reassurance beforehand. I keep relearning this and then forgetting it under pressure, which is its own mildly annoying loop.

Told Val about the brief at run club and she said "so the job's actually going fine, you've just been scared it wouldn't," which is annoyingly accurate for someone I've known two weeks.

Slept well. First time in a while I didn't wake up already running tomorrow's meeting in my head.`,
  },
  {
    // A second capsule, nearer-term than the closing "next September" one
    // below -- opens two weeks out (well before the real Sep 30 close of
    // this story, and before whenever this script actually gets run), so
    // the showcase account has a genuine "arrived" letter to show alongside
    // the far-future "still waiting" one, not just one or the other.
    date: "2026-08-12",
    mood: "reflective",
    title: "Checking In With Two-Weeks-From-Now",
    tags: ["future-self", "work", "check-in"],
    revealAt: "2026-08-25",
    content: `Sealing a short one today, mostly because last night's "ship it" high and this morning's low-grade dread about next week's Renata sync are living in the same body twenty-four hours apart, and I want a record of exactly how unresolved this still feels rather than a memory of it that's been smoothed over by whatever happens next.

Future me, two weeks out: did the "small wins compound" theory actually hold, or did one good week turn out to be a fluke I'm now embarrassed about believing in? Is Renata's feedback style starting to make sense, or still landing like eleven contradictory notes at 6:40pm?

Mostly I just want to know if it's gotten any less exhausting to constantly calibrate how much to trust my own read on things here. Two weeks isn't long. I know that. Asking anyway.`,
  },
  {
    date: "2026-08-13",
    mood: "stressed",
    title: "Renata's Notes",
    tags: ["work", "boundaries"],
    content: `Different week than last week's screenshot-worthy "ship it." Sent Renata the Q4 campaign concept today and got back eleven separate comments, several of them contradicting each other, all landing at 6:40pm with an implicit expectation of a revised deck by tomorrow morning stand-up.

I stayed until almost 9 working through them. Some were genuinely useful, sharpened the concept in ways I wouldn't have gotten to alone. A few felt like reflexive editing, changing things because changing things is what a first pass gets, not because the original version was actually wrong. I don't have enough history with her yet to know which of those two things I'm looking at most of the time, which is its own kind of tiring -- not just doing the work, but constantly calibrating how much to trust my own read on her feedback.

I didn't push back on anything tonight, just absorbed all eleven notes and reworked the deck. Some part of me knows that's not sustainable if this becomes the pattern every week, and another part of me knows it's week three and pushing back yet feels premature, before I've built any credibility to spend.

Filing this away rather than acting on it yet. Watching to see if tonight was an outlier or a preview.`,
  },
  {
    date: "2026-08-15",
    mood: "happy",
    title: "Val's Birthday",
    tags: ["friendship", "gratitude"],
    isKeepsake: true,
    content: `Val invited me to her birthday thing tonight -- a loud, warm apartment full of people I'd never met, mostly other run club regulars and a few coworkers of hers. I almost didn't go, the specific exhaustion of meeting a whole new group of strangers after a long work week nearly won out. Genuinely glad it didn't.

Ended up talking to three different people for real stretches of time, not just polite small talk -- someone who used to live two neighborhoods from my old place in Chicago, small world; someone who does something in city planning that I now understand slightly better than I did an hour ago; Val's roommate, who is apparently also newish to the city and equally happy to have someone to compare notes with about which grocery store actually has decent produce.

At one point I looked around the room and had this quiet, almost embarrassing realization: I know people here now. Not many, not deeply yet, but real, specific people with names and inside jokes forming, not just Theo and a run club acquaintance. Two months ago this exact room would have been a room full of strangers I'd never see again. Tonight it was just a party.

Walked home instead of getting a car, cool night, genuinely happy the whole way. Want to remember this exact feeling -- the first night the new city felt like it had people in it who'd notice if I disappeared.`,
  },
  {
    date: "2026-08-16",
    mood: "calm",
    title: "Call with Owen",
    tags: ["family"],
    content: `Long call with Owen this afternoon, the kind that starts as a quick check-in and ends up over an hour because neither of us actually hung up when the natural stopping point came. He's deep in some work drama of his own, a coworker taking credit for a project he led, and it was oddly comforting swapping "is this a me problem or an actual problem" stories with someone who's known me since before I had any professional instincts at all.

Told him about the room-full-of-strangers-turned-friends feeling from Val's party last night. He said something I want to remember -- that I've always been slow to let a new place feel like mine, going back to every college dorm and apartment I've ever moved into, and it's never once actually failed to happen eventually, it just takes me longer than I expect it to every single time. Annoyingly, he's right, and annoyingly, I forget this specific fact about myself at the start of every single move like it's new information.

We made a loose plan for him to visit sometime this fall, nothing locked in yet, just enough of an idea that it feels real rather than hypothetical.

Ended the call feeling more like myself than I have most days this month. Family calls that aren't logistics or check-ins-out-of-obligation are rarer than they should be, and I want more of exactly this kind.`,
  },
  {
    date: "2026-08-18",
    mood: "stressed",
    title: "Campaign Crunch Begins",
    tags: ["work", "deadlines"],
    content: `Renata locked the Q4 campaign launch date today -- September 6th -- in a way that makes the last two and a half weeks suddenly feel very different than the leisurely-by-comparison first month here. Real date, real dependencies, a launch deck with my name on the creative lead line in front of the whole department.

Spent the afternoon mapping out what actually has to happen between now and then and the honest answer is: a lot, on a timeline that assumes nothing goes wrong, which nothing ever fully does. I like this kind of pressure in theory, the kind that comes from something real and deserved rather than manufactured urgency. In practice it still produced the specific tight-chest feeling I've been trying to get better at noticing instead of just pushing through.

Told Theo tonight that the next few weeks are probably going to look like more work-brain than usual, wanted to say it out loud in advance rather than have it just quietly happen and get discovered later, which is more the old pattern. Theo's response was easy -- "okay, thanks for telling me, let me know what you need" -- no drama, no worry, just information received.

Small thing, saying it out loud ahead of time instead of after. Want to actually keep doing that over the next few weeks, not just tonight when it's easy.`,
  },
  {
    date: "2026-08-20",
    mood: "angry",
    title: "Credit Where Due",
    tags: ["work", "conflict"],
    content: `Angry in a specific, hard-to-shake way tonight. In the department-wide check-in this afternoon, Renata presented the Q4 campaign concept to the VP as her own strategic direction, mentioning "the team" once in passing, no mention that I'd built the actual creative concept from scratch over the last two weeks, including the exact framing the VP specifically complimented.

I said nothing in the room. Six weeks in, presenting to a VP I've met exactly once, it did not feel like the moment to correct my manager in front of leadership, even though every part of me wanted to. Sat through the rest of the meeting composing sentences in my head I never said out loud.

I know rationally this happens, that managers presenting team work as their own strategic direction is an old, common, unglamorous pattern, not some unique betrayal aimed at me specifically. Knowing that doesn't fully touch the anger, which is really about being six weeks in and already unsure whether speaking up costs me more than staying quiet does, before I've even built up any real standing to spend on a fight like this.

Didn't tell Theo the specifics tonight, just that work was frustrating. Not ready to say the whole thing out loud yet, still deciding what I even think it means.`,
  },
  {
    date: "2026-08-21",
    mood: "sad",
    title: "Didn't Say Anything",
    tags: ["work", "avoidance", "self-criticism"],
    content: `Had a full day to say something to Renata about yesterday and didn't. Told myself the morning was too busy, then the afternoon had back-to-back meetings, then by end of day the moment had cooled from angry into a flatter, sadder kind of tired that didn't have the activation energy left to start a hard conversation.

I recognize this shape. It's not new to me even if the specific city and job are new -- the anger that has all the energy to act and somehow never quite gets the chance before it fades into something quieter and easier to let slide. I did this at my last job too, more than once, and told myself moving somewhere new might also mean moving away from the pattern itself. It didn't, obviously. Patterns travel.

Feeling a little disappointed in myself tonight, trying not to layer extra shame on top of an already low day about it. The actual work today was fine, competent, nobody would know anything was off watching me in meetings. But there's a specific tired that comes from doing fine work while carrying something unresolved underneath it, and that's what today was.

Going to try to actually say something this week, before the launch crunch gets any tighter and makes it even easier to keep postponing. Writing it here mostly so there's a record if I don't.`,
  },
  {
    date: "2026-08-23",
    mood: "reflective",
    title: "What I'm Afraid Of",
    tags: ["self-awareness", "reflection"],
    content: `Sat with the Renata thing more today instead of rushing past it into the next task. Tried an exercise I half-remember from somewhere -- actually naming, specifically, what I'm afraid will happen if I bring it up, instead of just feeling generally anxious about it.

The honest answer, once I made myself write it down: I'm afraid she'll decide I'm someone who needs credit and validation to do good work, six weeks into a job where I'm still actively trying to prove I don't need hand-holding. Which is a strange fear to sit with directly, because framed like that it's obviously not really about credit at all. It's about not wanting to be seen as needy this early, even when the actual ask -- being named for work I did -- is completely reasonable and not needy in any real sense.

I think I do this generally, actually, not just at work. Confuse "asking for something reasonable" with "being difficult," and then quietly absorb the cost of not asking instead. Owen does something similar with his own manager, come to think of it, maybe it runs in the family, or maybe it's just a common enough shape that it's easy to recognize once you're looking for it.

I don't have a plan yet, just a clearer name for the fear underneath the anger. That already feels like something, even if nothing external has changed.`,
  },
  {
    date: "2026-08-24",
    mood: "stressed",
    title: "Late Night, Again",
    tags: ["sleep", "work"],
    content: `Second night in a row up past midnight finishing campaign assets, and I can feel my sleep starting to fray at the edges the way it does every single time I let a work stretch run long enough. Waking up at 3am with my brain already halfway into tomorrow's task list, which is a specific kind of unhelpful since nothing productive happens with a half-asleep brain at 3am except worry.

Sixteen days to launch. The list of what's left doesn't feel unreasonable exactly, just relentless in a way that leaves very little slack for anything going even slightly wrong, and something always goes at least slightly wrong.

Skipped run club today for the first time since starting it a few weeks ago, told myself it was because of the deadline and that's true, though I also know skipping the one thing that's been genuinely good for my head this month during exactly the week I need it most is not a great trade even if it's an understandable one under pressure.

Theo left a note on the counter, just "you're allowed to sleep," which I appreciated and did not fully act on tonight. Going to try to actually protect tomorrow's run club slot instead of letting the deadline eat it too. Small experiment, low bar, more achievable than promising myself a full reset I probably won't deliver this week.`,
  },
  {
    date: "2026-08-26",
    mood: "sad",
    title: "Owen's Birthday, From Afar",
    tags: ["family", "guilt"],
    content: `Owen's birthday today, and instead of being there like every year until this one, I called in for twenty minutes on video during his dinner, propped against someone's water glass, half the table waving at the phone before going back to their actual conversation at the actual table.

It was fine, genuinely, nobody made me feel bad about it, Mom made a point of saying how good it was to see my face even briefly. But there's a version of tonight where I'm actually there, actually holding the cake, actually part of the room instead of a small rectangle propped against a glass, and I felt the gap between those two versions pretty sharply for a while after we hung up.

This is the cost side of the move that I knew about in the abstract back in June and am only really learning in the specific now -- not the big obvious costs, the ones you brace for, but this kind, small and recurring, a birthday here, a lake weekend there, a hundred ordinary Tuesdays I'm simply not present for anymore.

I don't regret the move. I want to be clear with myself about that, even tonight. But I think I can hold "I don't regret it" and "this specific part genuinely hurts" at the same time without one canceling out the other. Going to try to actually hold both instead of picking one to be the whole story of tonight.`,
  },
  {
    date: "2026-08-28",
    mood: "calm",
    title: "Theo Made Dinner",
    tags: ["relationships", "gratitude"],
    content: `Came home late again, launch prep eating most of the week, and Theo had actually cooked -- real dinner, not the usual takeout default we've both leaned on this month -- and set the table like it was an occasion instead of a random Friday. Small thing. Landed like a much bigger one.

We ate slow, didn't talk about work at all, which I'm noticing happens less than it should lately given how much of my headspace the launch has been taking up. Talked instead about nothing important -- a show we're both behind on, whether the plant in the living room is actually dying or just going through something, low-stakes, easy conversation that didn't ask anything of me.

I think I've been quietly worried, under the launch stress, about whether Theo's noticing how absent I've been this month, work-brain-wise, and tonight felt like a small, direct answer without either of us having to name the question out loud. Theo noticed I was tired and stretched, and instead of being annoyed about it, just made dinner and made room.

Told Theo, honestly, how much tonight meant, not in a big dramatic way, just plainly, over the dishes. Got a simple "of course" back, which was somehow exactly the right size of response.

Nine days to launch. Feeling steadier going into the final stretch than I expected to, mostly because of tonight.`,
  },
  {
    date: "2026-08-30",
    mood: "reflective",
    title: "One Month of Run Club",
    tags: ["health", "friendship"],
    content: `Realized on today's run that it's been almost exactly a month since I first showed up not knowing anyone. Val pointed out, somewhere around mile three, that I've missed exactly one session this whole month -- last week, the late-night deadline day -- which she remembered and I hadn't.

Legs feel genuinely different than they did in week one, less like surviving four miles and more like actually running them. But the bigger change, I think, isn't physical. It's that Tuesday and Thursday mornings have become the two fixed points in an otherwise unpredictable week, the thing I can count on regardless of what Renata's inbox looks like that day.

Told Val a condensed version of the Renata situation -- the credit thing, the still-unspoken conversation -- during the cooldown walk. She didn't have advice exactly, just asked whether I'd actually pictured what happens if I say something and it goes fine, since I seem to have spent a lot more time picturing it going badly. Hadn't, actually. Going to try to sit with that version too, not just the anxious one.

Two days until launch week officially starts. Feeling more ready than I did when the date first got locked two weeks ago, which itself feels worth noting -- proof that the last two weeks of work weren't just survived, they actually built something.`,
  },
  {
    date: "2026-09-01",
    mood: "stressed",
    title: "Final Sprint",
    tags: ["work", "deadlines"],
    content: `Launch week, officially, five days out. The list that felt relentless-but-manageable a week ago now just feels relentless, full stop, though I notice I'm handling today's version of it a little differently than I would have in week one -- less spiraling, more just doing the next concrete thing in front of me.

QA flagged an issue with the landing page tracking this afternoon, not catastrophic but the kind of thing that needs a same-day fix, which meant reshuffling the whole evening's plan. Paired with one of the engineers for almost three hours tracking down what turned out to be one misconfigured tag. The specific, expensive kind of bug that eats an evening and resolves into something small.

Skipped this morning's run club again, second time this month, and felt it more this time -- not just guilt about missing it, but the actual absence of the one part of my week that reliably de-stresses me, on exactly the week I'd benefit from it most. Texted Val to say I'd be back Thursday. She sent back a single thumbs up, no guilt trip, which I appreciated more than I probably needed to.

Sleep is already starting to slip the way it always does this time in a crunch. Trying to at least notice it happening this time instead of being surprised by it later, the way I usually am.`,
  },
  {
    date: "2026-09-03",
    mood: "angry",
    title: "The Meeting",
    tags: ["work", "conflict", "boundaries"],
    content: `Finally said something to Renata today. Asked for fifteen minutes before the afternoon stand-up, went in with the exact sentence I'd rehearsed since the VP meeting two weeks ago: that I was proud of the campaign and wanted to make sure my name was actually attached to the strategic work going forward, not just the execution.

She was quiet for a second, then said something like "I didn't realize that landed the way it did, I'm used to presenting as 'the team' and forgetting that reads as erasing the specific person," which is probably true and also probably wouldn't have been said if I'd stayed quiet a third and fourth time the way I almost did.

Wasn't a perfect conversation. There was a defensive beat in the middle where I had to just hold my ground and repeat the actual ask instead of backing off it. But we landed somewhere real -- she agreed to name me directly in the launch-day leadership update, and to loop me into any exec-facing materials before they go out, not after.

Still a little shaky-angry on the walk back to my desk, mostly leftover adrenaline from finally saying the thing I've been carrying for two weeks. But underneath the shakiness, something that felt like relief, and something else that felt almost like pride -- not at how the conversation went exactly, but that I had it at all, six weeks after I might have let it slide the way I have before.`,
  },
  {
    date: "2026-09-04",
    mood: "calm",
    title: "It's Out There",
    tags: ["work", "relationships"],
    isKeepsake: true,
    content: `Quieter day after yesterday's conversation, and I noticed the calm today feels different from other calm days this month -- less like relief after narrowly avoiding something, more like the plain, unremarkable calm of having actually handled something instead of continuing to carry it silently.

Renata followed through already, mentioned my name specifically in this morning's leadership update thread, no reminder needed. Small thing, exactly what was asked for, and it mattered more seeing it happen unprompted than it would have if I'd had to chase it.

Told Theo the whole story tonight, the real one this time, not the "work was frustrating" version from two weeks ago. Got a long hug and an "I'm proud of you" that felt earned rather than automatic, the kind Theo says when it's actually meant rather than just supportive-partner reflex.

I think what I want to remember from today isn't really about Renata at all. It's that the version of me who says the true, slightly uncomfortable thing directly, closer to the first time instead of the third, is a version I actually like better than the one who absorbs everything quietly and calls it being easy to work with. Going to try to keep being that version going forward, not just when a VP meeting forces the issue.

Two days to launch. Feeling ready in a way that has nothing to do with the campaign assets being done, though those are also, finally, done.`,
  },
  {
    date: "2026-09-06",
    mood: "happy",
    title: "Launch Day",
    tags: ["work", "gratitude"],
    content: `It's live. After five weeks of crunch and one very necessary hard conversation, the Q4 campaign is actually out in the world instead of a deck in a shared drive. The morning was tense in the specific way launch mornings are -- final checks, a slightly too-quiet stand-up, everyone refreshing a dashboard that wasn't going to update any faster for the attention.

Renata pulled me aside right after the go-live confirmation and said, in front of two other directors who happened to be walking by, "this campaign is Nora's, top to bottom, best work we've shipped this quarter," which is about as direct an acknowledgment as I could have asked for, unprompted, exactly two days after asking for it once.

Team went out after work, the first time this specific group has been together outside a conference room since I started. Val texted asking how it went, and I realized mid-reply that I now have people in two different parts of my life here who both, unprompted, wanted to know how my launch day went -- work people and run-club people, both real now, both actually mine.

Called Owen on the walk home to tell him. He said "so the job's real now, huh," which is exactly the kind of thing only a brother says, and exactly right.

It shipped. I'm exhausted in the good way, the way that comes after something real gets finished instead of merely survived.`,
  },
  {
    date: "2026-09-07",
    mood: "sad",
    title: "The Crash",
    tags: ["health", "burnout"],
    content: `Hit a wall today that I think has been building since launch day and just caught up with me the second there was nothing urgent left to run on. Woke up flat, heavy, not sad about anything specific I could point to, just a diffuse low that's harder to explain to people than a clear reason would be.

Almost went into the office anyway out of habit, then didn't, called in a personal day for basically the first time since starting this job. Some part of me still read that as weakness rather than the entirely predictable comedown after five weeks of sustained adrenaline finally running out of things to be adrenaline about.

Spent most of the day doing very little. Didn't answer texts for a few hours. Cried at one point for no reason I could clearly name, which felt embarrassing in the moment and, writing it now, actually seems like a reasonable response to a body finally getting permission to stop holding everything together at once.

Theo came home early without me asking, didn't try to fix the day, just made tea and sat nearby while I stared at nothing for a while. Didn't need to explain much. I think the explaining would have taken more than I had today.

Trying to let today just be a low day instead of a problem I need to solve by tomorrow. Not sure I'm succeeding at that yet, but trying counts for something.`,
  },
  {
    date: "2026-09-08",
    mood: "sad",
    title: "Still Flat",
    tags: ["health", "burnout", "self-criticism"],
    content: `Second day of the crash and it hasn't lifted the way I half-expected it to after a night's sleep. If anything today felt heavier, with the added weight of a small, unhelpful voice saying I should be over this by now, it's just two low days, other people push through worse without falling apart.

Went into work today, physically present, mentally somewhere else most of the afternoon. Nobody said anything, the campaign's numbers are holding steady on their own for now and doesn't need much from me today, which is lucky timing even if it doesn't feel like much of anything right now.

Texted Val, more honest than I've been with her about anything so far, just "having a rough couple days, not sure why." She didn't try to diagnose it, just said she'd been there after a big work push before and that it usually takes longer to actually pass than it feels like it should while you're in it.

I think I keep expecting recovery to be as fast as the crash was sudden, and it isn't working that way. Slower, less linear, no clean edge where it's obviously over.

Looked up a therapist tonight, something I've circled around doing since before the move and never actually done. Found someone, a Dr. Osei, taking new patients. Didn't book yet. Just looked. Small step, but a real one.`,
  },
  {
    date: "2026-09-09",
    mood: "reflective",
    title: "Calling Dr. Osei",
    tags: ["therapy", "self-awareness"],
    content: `Actually called and booked with Dr. Osei today, first available slot is Friday. Felt strangely nervous making the call, more nervous than the actual ask required -- it's just scheduling, nobody on the other end of that call needed to know anything about why.

I think part of the nervousness is that booking it makes something real that's been easier to keep abstract. Not just "I should probably talk to someone sometime," which can live comfortably in the background indefinitely, but an actual Friday at 2pm with a name attached to it.

Feeling a little more like myself today than yesterday, though still slower than usual, like recovering from something that was never quite a flu but behaved like one for a few days. Went for a short, slow walk instead of a real run, first time back outside since Thursday's session, which already feels like a long time ago given how much has happened since.

Thinking about the whole arc of the last five weeks a little -- the move, the credit conversation, the launch, the crash -- and noticing that none of it was really separate from anything else, even though it felt like distinct events while I was living through them. I think that's part of what I want Friday's session to actually be about. Not just "I'm tired," but the whole shape underneath the tired.`,
  },
  {
    date: "2026-09-11",
    mood: "reflective",
    title: "First Session",
    tags: ["therapy", "family", "reflection"],
    isKeepsake: true,
    content: `First session with Dr. Osei today. Spent most of it just laying out the last three months -- the move, the job, Renata, the crash -- more or less in order, and she mostly listened, asked good, specific questions rather than offering anything yet.

One thing she said stuck with me more than anything else: that grief and growth aren't opposites, and a move like this one produces both at once, in the same weeks, often about the same specific things. Missing the lake house and being proud of finally speaking up to Renata aren't contradictory feelings that need resolving into one clean story. They're just both true, at the same time, about the same stretch of my life.

She also asked, almost in passing, whether this pattern -- staying quiet under pressure until anger forces the issue, then feeling guilty about the anger -- shows up anywhere else in my life, past this job. I mentioned Owen's birthday, mentioned some old version of this with my last manager in Chicago too. She just nodded, didn't push further today, said we'd come back to where that pattern might have started.

Left feeling lighter than I expected to, even though nothing external actually changed today. Something about finally saying the whole shape of it out loud, in order, to someone whose only job in the room was to actually listen.

Booked a standing Friday slot going forward.`,
  },
  {
    date: "2026-09-13",
    mood: "calm",
    title: "Slow Sunday With Theo",
    tags: ["relationships", "rest"],
    content: `First real slow weekend since the move, no launch prep, no crash recovery pulling focus, just an ordinary Sunday that got to be ordinary. Slept late, made a real breakfast instead of grabbing something on the way out, sat on the balcony with coffee for almost two hours doing absolutely nothing that counted as productive by any normal definition.

Theo and I walked to the farmers market that's a few blocks from the new apartment, the one we've walked past a dozen times and never actually stopped at until today. Bought too many tomatoes, the specific kind of overbuying that happens when you're enjoying the browsing more than actually needing the produce. Took the long way home through the park.

Talked, really talked, about the last three months for the first time in a while without it being immediately in service of solving some specific problem -- just narrating the whole arc out loud to each other, the move, the job, the crash, Dr. Osei. Nothing got resolved in any dramatic way, it just felt good to say a lot of it out loud to the person who's watched most of it happen up close.

Noticing calm today feels different from earlier calm days this month -- less like the absence of stress, more like something actually chosen and protected on purpose, the way Dr. Osei's "quiet important things" framing from a friend's advice a while back keeps turning out to be right.`,
  },
  {
    date: "2026-09-14",
    mood: "happy",
    title: "Numbers Came In",
    tags: ["work", "gratitude"],
    content: `First full week of campaign metrics came in today and they're genuinely strong -- conversion tracking meaningfully above the target Renata and the VP set back in July, the kind of number that's hard to argue with regardless of how anyone feels about anything else.

There's something specifically satisfying about a number moving because of decisions I actually made, screen by screen, even though I know rationally a hundred small things had to go right for it to move at all -- the engineers who caught the tracking bug during launch week, the design team, Renata's actual good notes buried among the reflexive ones back in August.

Renata sent a note to the whole team highlighting the numbers, named me specifically again, no prompting needed this time either, two weeks running. I think something in how we work together has actually shifted, not just because of one hard conversation, but because I've kept being direct in smaller ways since, and she's kept meeting that instead of it fading back to how it was.

Told Val at run club this morning, first session back in over a week. She said the numbers thing was great but seemed more interested in how I was doing generally after last week's crash, which was its own kind of nice -- someone tracking the whole me, not just the launch outcome.

Good week. Feels earned rather than merely lucky, which is a distinction that matters more to me than it probably should.`,
  },
  {
    date: "2026-09-15",
    mood: "reflective",
    title: "Renata Said Something",
    tags: ["work", "relationships"],
    content: `Small moment today that I want to remember properly instead of letting it blur into the general good week. Renata stopped by my desk, not for anything work-related, and said, a little awkwardly, that she appreciated me telling her directly about the credit thing back in September, that most people on her teams just quietly get resentful instead of saying anything, and she'd rather know.

I said something about how it wasn't easy to say, and she said "I could tell, you did it anyway, that's the part that mattered," which is about as close to an actual compliment on the conversation itself, not just the campaign outcome, as I think she's capable of giving.

Sat with that for a while after she walked off. I think I've spent most of my career assuming that speaking up costs you something with the person you're speaking up to, some permanent ding against being easy to work with. This is the first real, specific evidence I have that it can go the other way -- that it can actually build trust instead of spending it, at least with the right person on the other end of it.

Not sure this generalizes to every manager I'll ever have. But it's one real data point against a fear I've been carrying around as if it were a settled fact instead of just one story I'd never actually tested until six weeks ago.`,
  },
  {
    date: "2026-09-17",
    mood: "happy",
    title: "Pepper",
    tags: ["pets", "gratitude", "relationships"],
    isKeepsake: true,
    content: `We have a cat. This was not a plan going into today -- Theo and I went to the shelter "just to look" after weeks of half-joking about it, the classic setup to exactly what happened, which is that a small gray cat with one white paw walked straight up to the front of her enclosure and put a paw through the bars like she'd been expecting us specifically.

Her shelter name was Pepper and neither of us felt strongly enough about changing it to bother. She's maybe two years old, according to the intake paperwork, cautious for the first twenty minutes in the apartment and then, without much transition, asleep on the couch like she'd lived here for years.

I think some part of this decision was about actually planting something here on purpose, the way run club and the farmers market and Val have slowly become real anchors too. A cat is a small, ordinary, slightly absurd way of saying this is where I live now, not a place I'm passing through until it's convenient to leave.

Called Owen to tell him, mostly because he's been asking for weeks whether the new city has "started to feel like home yet" and I think tonight I can actually say yes, at least a little, in a way I couldn't have honestly said even two weeks ago.

Pepper is currently asleep on my feet while I write this. Feels like a good sign.`,
  },
  {
    date: "2026-09-18",
    mood: "calm",
    title: "Settling With Pepper",
    tags: ["pets", "rest"],
    content: `Quiet day at home getting Pepper settled, which mostly meant sitting very still on the couch for long stretches so she'd get comfortable coming out from behind the bookshelf on her own terms instead of being coaxed. Cat logic, apparently, rewards patience over effort.

She's braver today than yesterday, explored the whole apartment by afternoon, decided the windowsill in the bedroom is her preferred daytime spot, watched the street below for what must have been an hour straight without moving.

Theo went out to get a proper litter box and food, since the shelter starter kit was clearly meant to last a day or two at most, and came back with what can only be described as an excessive number of cat toys for an animal that's shown interest in exactly zero of them so far, preferring instead an empty cardboard box that arrived the same day by pure coincidence.

Low-key, good day. No launch metrics to check, no therapy session to process, just a new animal in the apartment slowly deciding we're safe. There's something almost meditative about spending a whole afternoon organized around another creature's comfort instead of my own to-do list.

Went to bed early. Pepper, notably, did not, and spent a solid twenty minutes doing laps around the apartment that Theo immediately named "the zoomies," like she'd been saving up energy all day specifically for this.`,
  },
  {
    date: "2026-09-20",
    mood: "reflective",
    title: "Second Session",
    tags: ["therapy", "family"],
    content: `Dr. Osei picked up the thread from the first session today -- where the quiet-under-pressure pattern might have started, before this job, before Chicago even. Talked for a while about growing up as the reliable one in the family, the one who didn't add to Mom's plate by needing much, while Owen, younger and louder, got more room to ask for things directly.

I hadn't really put those two facts next to each other before -- being the reliable one as a kid, and now being the person who absorbs eleven contradictory notes from a manager without pushing back until it becomes unbearable. Said out loud, in the room, it sounded almost too neat, the kind of pattern that feels invented after the fact. Dr. Osei's read was that it's neat because it's real, not despite it -- these patterns usually are simpler and older than we expect once we actually look directly at them instead of around them.

We talked a little about Mom too, about the guilt I still carry around the move, around missing Owen's birthday, around not calling enough. She didn't offer an answer, just asked what it would actually cost me to call Mom more regularly, on a schedule, rather than only when guilt finally accumulates enough to force it.

Going to try calling her Sundays. Simple, small, exact same shape as the run-club and quiet-important-thing patterns that have actually worked this year. Lower the bar until I can clear it consistently.`,
  },
  {
    date: "2026-09-21",
    mood: "sad",
    title: "Mom Called",
    tags: ["family", "guilt"],
    content: `Mom called today, unprompted, before I'd gotten around to starting the Sunday-calls plan from yesterday's session, which made the guilt land harder than it probably needed to. She wasn't upset exactly, just gently worried, said it feels like she hears from me less since the move and wanted to make sure everything's actually okay, not just okay in the version I tell people.

Told her more of the truth than I usually do -- the crash a couple weeks ago, starting therapy, even a little about the Renata thing. She got quiet for a second, then said something I wasn't expecting: that she'd noticed the same reliable-one pattern in me for years, worried about it more than once, and never quite knew how to bring it up without it sounding like criticism.

Sat with that for a while after we hung up. There's a strange comfort in learning someone else already saw the pattern Dr. Osei and I are just now naming directly, that I wasn't hiding it as well as I thought, that the people who love me most were quietly noticing and worrying in their own way the whole time.

Feeling the guilt less about missing calls specifically tonight, and more about how long it took me to actually tell her the real version of how I've been, instead of the manageable, reassuring one. Going to start the Sunday calls for real this week. Not because of guilt this time. Because I actually want to.`,
  },
  {
    date: "2026-09-22",
    mood: "calm",
    title: "Sunday Calls, Starting Now",
    tags: ["family", "boundaries"],
    content: `Called Mom again today, on purpose this time, the actual start of the Sunday habit rather than a guilt-driven one-off. Talked for almost forty-five minutes about nothing especially urgent -- a neighbor's new fence, whether I'm eating enough vegetables (her words, always), a recipe she wants to send me for the dal Owen apparently botched trying to make it from memory last month.

It felt different from yesterday's call, lighter, less loaded, exactly the kind of ordinary check-in that doesn't have to carry an entire month's worth of unspoken worry because there was a call last week too, and there'll be one next week, so nothing has to be squeezed into a single conversation out of scarcity.

Told her about Pepper. She asked to see a photo three separate times over the course of the call, which felt about right for a first grandcat, even a temporary one that technically belongs to me and Theo.

I think what I actually want from these calls, going forward, isn't to resolve the guilt about the move or fully close the distance -- some of that distance is just real, and always will be, given where I chose to live now. I think I want the calls themselves to be the thing, small and regular and not really about anything, the way they used to be before there was a whole month of not-calling sitting heavy underneath every single one.`,
  },
  {
    date: "2026-09-24",
    mood: "happy",
    title: "Theo and I Talked About Next Year",
    tags: ["relationships", "gratitude", "milestone"],
    isKeepsake: true,
    content: `Long conversation with Theo tonight, the kind that started over dishes and ended up on the couch two hours later, about what next year actually looks like for us here. Not a hypothetical "someday" conversation the way it's mostly been since the move -- an actual one, about staying in this apartment past the lease, about whether this city is genuinely starting to feel like ours rather than just mine, career-wise, with Theo along for it.

Theo said something that landed hard, in a good way -- that watching me build an actual life here these last three months, the run club, Val, the Renata conversation, therapy, now Pepper, made this feel less like Theo's life on pause while I have mine, and more like something we're actually building together, on purpose, even though the job that started it was mine.

We talked, half-seriously, about whether we're the kind of couple who gets married because we've been together long enough or because we actually chose to at a specific moment, and landed on wanting the second kind, whenever it happens, not on any particular timeline tonight, just as an actual shared intention instead of a vague assumption sitting in the background.

Nothing official happened tonight. No date, no ring, nothing that would make a good group-chat announcement. But it felt like one of those quiet, private turning points anyway, the kind where two people say a true thing to each other and something settles differently afterward.

Pepper slept on both our feet the whole time. Fitting.`,
  },
  {
    date: "2026-09-26",
    mood: "calm",
    title: "Two Months In",
    tags: ["reflection", "gratitude"],
    content: `Almost exactly two months since the movers pulled away, and today, for maybe the first time, the apartment actually felt like mine rather than a very well-appointed hotel I hadn't checked out of yet. Hard to say exactly what tipped it -- Pepper asleep in her windowsill spot, the tomatoes from Sunday's market still sitting on the counter, Theo's stuff fully unpacked and integrated instead of half in boxes.

Went for an easy run along the river alone this morning, no run club today, just me and the route that's become genuinely familiar now instead of new. Passed the spot where Val and I first talked, two months and what feels like several lifetimes ago, back when I didn't know a single person in this city and wasn't sure the job was going to work out at all.

Made a mental list, unprompted, of the actual anchors here now: Val, run club, Dr. Osei's Friday slot, the farmers market, Pepper, Renata being, genuinely, a better manager to work with than she was in August. None of that existed two months ago. All of it exists now because of a hundred small, unglamorous decisions along the way, not one big turning point.

Calling Mom later today, same as every Sunday now. That's its own small anchor too, maybe the one I'm proudest of building, given how long it took to actually start.`,
  },
  {
    date: "2026-09-27",
    mood: "reflective",
    title: "What Changed",
    tags: ["self-awareness", "reflection"],
    content: `Spent part of today's session with Dr. Osei looking back at the whole two-month arc instead of the usual week-to-week focus, and it was strange seeing it laid out end to end rather than lived day by day the way it actually happened.

The thing I keep landing on: almost nothing that actually shifted came from one big insight or one dramatic moment. It came from a lot of small, specific repetitions -- saying the true thing to Renata, then saying it again with Owen's birthday guilt, then again with Mom last week. Showing up to run club even on the weeks I didn't feel like it. Calling Dr. Osei instead of just thinking about calling her. None of it felt significant in the moment. All of it, added up, is most of what actually changed.

Dr. Osei's read, which I want to remember, is that the reliable-one pattern from childhood isn't gone, probably never fully will be, but I have real, tested evidence now that I can act differently inside it when it matters, which is a meaningfully different thing than the pattern simply disappearing. I think that's actually a more honest goal than the one I might have set for myself back in August, which was something closer to "stop being anxious," full stop, as if that were a realistic finish line.

Going into whatever comes after this two-month stretch, I want to keep the small things going, not chase some bigger fix. Sunday calls, run club, saying things closer to the first time instead of the third.`,
  },
  {
    date: "2026-09-29",
    mood: "reflective",
    title: "A Letter to Next September",
    tags: ["reflection", "gratitude", "family"],
    isKeepsake: true,
    revealAt: "2027-09-29",
    content: `Writing this one to open next September, a year from now, mostly to see how much of what feels true tonight still feels true a year further into whatever this city becomes.

Future me: if you're reading this, I hope the city feels less like a project and more like just where you live by now. I hope Val is still a real friend and not just a run-club acquaintance who faded once the daily proximity did. I hope Pepper has gotten fat and lazy and thoroughly unbothered by anything, the way good cats do with enough time in one home. I hope the Sunday calls with Mom are just a normal, unremarkable part of the week by now, not something you have to remember to protect on purpose anymore.

I hope work is still generally good, and if it isn't, I hope you handled whatever went wrong the way this year taught you to -- saying the true thing closer to the first time, not the third. I hope you and Theo are wherever this conversation from a few nights ago was actually pointing toward, whatever that turned out to mean in practice.

Mostly I want you to remember that this year proved something I'd half-stopped believing by the time the crash hit in September: that the patterns you've carried a long time aren't fixed, they're just old and well-practiced, and a few months of consistent, unglamorous small counter-moves genuinely does bend them. Slowly. Imperfectly. But really.

See you next September. I hope you're proud of this year, the same way I'm trying to be proud of it tonight, mid-way through, before I even know how the rest of it turns out.`,
  },
  {
    date: "2026-09-30",
    mood: "happy",
    title: "Where I'm At",
    tags: ["gratitude", "reflection", "relationships"],
    isKeepsake: true,
    content: `End of two full months since the move, and I wanted to close this stretch the same deliberate way the very first entry opened it, rather than just letting September trail off into October without marking it.

Reading back to that first entry, sitting on the floor with Owen's mug, nervous about a job that hadn't started yet -- I think almost everything I was afraid of back then either didn't happen or happened and turned out to be survivable, and a few good things happened that I couldn't have predicted at all. I didn't know Val yet. I didn't know Renata would end up someone I actually trust. I definitely didn't know there'd be a cat asleep on my feet right now while I write this.

None of it came from one big turning point. It came from run club on the days I didn't feel like going, a hard conversation with Renata I almost didn't have, a therapy appointment I almost didn't book, Sunday calls with Mom that took two months longer to start than they should have. Small, repeated, unglamorous choices, the kind that don't feel like much individually and add up to an actual life somewhere new.

Going into October, I want to keep doing the same small things rather than look for the next big fix: the calls, the runs, Friday sessions, saying the true thing early instead of late. I think that's actually the whole lesson of these two months, the one I keep relearning in smaller and smaller doses until it finally sticks.

Pepper is asleep on my feet. Theo's making tea. This, right now, is enough.`,
  },
];

function wordCount(text) {
  return String(text).trim().split(/\s+/).filter(Boolean).length;
}

// Simple deterministic PRNG (mulberry32) so re-running the script produces
// the same "random" health noise every time -- easier to reason about /
// screenshot-compare than fresh Math.random() jitter on every run.
function mulberry32(seed) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260801);
function jitter(base, spread) {
  return base + (rand() * 2 - 1) * spread;
}

// Same formula health/routes.js's estimateStressScore() uses, duplicated
// here deliberately rather than imported (that function isn't exported --
// it's a private helper in the route file) -- see resolveStressInputs'
// comment there for why sleep + resting heart rate are the two real inputs.
function estimateStressScore({ restingHeartRate, sleepHours }) {
  let score = 50;
  if (Number.isFinite(restingHeartRate)) score += (restingHeartRate - 62) * 1.1;
  if (Number.isFinite(sleepHours)) score += (7 - sleepHours) * 6;
  return Math.max(0, Math.min(100, Math.round(score)));
}

// Health data follows the same four-act shape as the journal entries --
// adjusting, crunch building, launch-week/crash, recovery/integration --
// so the Health page's correlation feature has a real, honest signal to
// find instead of random noise. Deliberately NOT a perfectly smooth ramp or
// alternating pattern (the exact thing flagged as looking "glitchy" on the
// real demo account) -- every value gets real jitter, and ~8 days are
// skipped entirely to look like a real person who doesn't sync every day.
function actFor(dateStr) {
  if (dateStr <= "2026-08-14") return "adjusting";
  if (dateStr <= "2026-08-31") return "crunch";
  if (dateStr <= "2026-09-06") return "launch";
  if (dateStr <= "2026-09-10") return "crash";
  if (dateStr <= "2026-09-16") return "recovering";
  return "integrated";
}

const ACT_BASELINES = {
  adjusting: { sleep: 7.2, sleepSpread: 0.6, steps: 6400, stepsSpread: 1300, hr: 68, hrSpread: 3 },
  crunch: { sleep: 6.3, sleepSpread: 0.8, steps: 5800, stepsSpread: 1800, hr: 71, hrSpread: 3 },
  launch: { sleep: 5.6, sleepSpread: 0.7, steps: 5200, stepsSpread: 1600, hr: 75, hrSpread: 3 },
  crash: { sleep: 5.9, sleepSpread: 1.6, steps: 2100, stepsSpread: 900, hr: 77, hrSpread: 3 },
  recovering: { sleep: 6.9, sleepSpread: 0.7, steps: 5600, stepsSpread: 1400, hr: 71, hrSpread: 3 },
  integrated: { sleep: 7.6, sleepSpread: 0.6, steps: 7600, stepsSpread: 1700, hr: 65, hrSpread: 3 },
};

// Days deliberately skipped entirely (no HealthData row) -- a real person's
// phone doesn't sync/log every single day. Spread across the range rather
// than clustered, so no single act looks suspiciously either perfectly
// complete or entirely empty.
const SKIPPED_DAYS = new Set([
  "2026-08-04", "2026-08-10", "2026-08-17", "2026-08-25",
  "2026-09-02", "2026-09-12", "2026-09-19", "2026-09-23", "2026-09-28",
]);

// Local-time Y/M/D formatting, deliberately NOT toISOString().slice(0, 10) --
// toISOString() converts to UTC first, which silently shifts the date by one
// day in either direction depending on the machine's timezone offset (e.g.
// local midnight Aug 1 in a UTC+5:30 zone is still July 31 in UTC). Every
// other date in this file (journal createdAt, the health row's own `date`
// field below) is built from a local "YYYY-MM-DDTHH:mm:00" string with no
// "Z", so this has to match that same local-time convention or the two
// datasets drift a day apart from each other depending on who runs this.
function toDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function buildHealthRows(userId) {
  const rows = [];
  const start = new Date(2026, 7, 1); // Aug 1 2026, local midnight (month is 0-indexed)
  const end = new Date(2026, 8, 30); // Sep 30 2026, local midnight
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dateStr = toDateStr(d);
    if (SKIPPED_DAYS.has(dateStr)) continue;

    const act = actFor(dateStr);
    const base = ACT_BASELINES[act];
    const isWeekend = d.getDay() === 0 || d.getDay() === 6;

    const sleepHours = Number(
      Math.max(3.5, Math.min(10, jitter(base.sleep + (isWeekend ? 0.5 : 0), base.sleepSpread))).toFixed(1),
    );
    const steps = Math.max(500, Math.round(jitter(base.steps + (isWeekend ? 900 : 0), base.stepsSpread)));
    const restingHeartRate = Math.round(Math.max(55, Math.min(90, jitter(base.hr, base.hrSpread))));
    const stressScore = estimateStressScore({ restingHeartRate, sleepHours });

    rows.push({
      userId,
      date: new Date(`${dateStr}T00:00:00`),
      sleepHours,
      steps,
      restingHeartRate,
      stressScore,
      completeness: 1,
      confidence: 0.85,
      source: "seed",
    });
  }
  return rows;
}

// Two grounded chat exchanges, hand-written (not live AI calls) so the Chat
// page has real content immediately without depending on the machine
// running this script having a working AI API key configured. Written in
// the app's "gentle" persona voice -- warm, validating, one open question,
// no unsolicited advice -- and directly reference real entries above so
// they read as a continuation of the same story, not generic filler.
function buildChatTurns() {
  return [
    {
      userMessage:
        "My manager presented my campaign concept as her own idea to a VP today and I didn't say anything. I'm still angry about it hours later.",
      aiResponse:
        "That sounds like a genuinely frustrating moment to sit with, especially six weeks into a new job where speaking up can feel riskier than it normally would. It makes sense that the anger is still here hours later -- it often takes longer to process than the moment itself lasted. What do you think made staying quiet feel like the safer choice in that room?",
      evidence: [{ quote: "Renata presented the Q4 campaign concept to the VP as her own strategic direction", date: "2026-08-20" }],
      confidence: 0.82,
      fallback: false,
      reasoning: "User described a specific unresolved workplace conflict with clear emotional charge; reflected the feeling before asking an open question about the underlying fear, consistent with the gentle persona.",
      focus: "workload",
      createdAt: "2026-08-20T21:15:00.000Z",
    },
    {
      userMessage:
        "I finally told my manager I wanted credit for my work. It went okay but I'm still shaky. Not sure why I'm not just relieved.",
      aiResponse:
        "It's really common for the body to still be running on adrenaline even after a hard conversation goes reasonably well -- relief and shakiness aren't contradictory, they can just be two different systems catching up at different speeds. It also sounds like this wasn't just about one conversation with Renata, but about a pattern you've been carrying a while. What feels different about having actually said it this time, compared to the times you didn't?",
      evidence: [{ quote: "Wasn't a perfect conversation... something that felt almost like pride", date: "2026-09-03" }],
      confidence: 0.85,
      fallback: false,
      reasoning: "User reported successfully breaking an avoidance pattern but described lingering physiological activation; normalized the mixed response and connected it to the recurring theme rather than treating it as an isolated event.",
      focus: "self_worth",
      createdAt: "2026-09-03T22:40:00.000Z",
    },
    {
      userMessage:
        "I've been flat and low for two days since the campaign launched and I don't really know why, everything actually went well.",
      aiResponse:
        "A crash right after something goes well is more common than it might feel right now -- five weeks of sustained pressure doesn't just switch off the moment the deadline passes, and the body sometimes only lets itself feel the cost once the urgency is gone. It doesn't need a specific reason to be valid. Has anything helped even a little over the last two days, even something small?",
      evidence: [{ quote: "Hit a wall today that I think has been building since launch day", date: "2026-09-07" }],
      confidence: 0.78,
      fallback: false,
      reasoning: "User reported an unexplained low mood following a positive outcome, a classic post-exertion crash pattern already visible in the journal history; validated it as expected rather than something requiring a cause, and asked a grounding, low-pressure question.",
      focus: "energy",
      createdAt: "2026-09-08T20:05:00.000Z",
    },
  ];
}

async function run() {
  await mongoose.connect(env.MONGO_URI);

  // Sanity-check every entry meets "at least two paragraphs" before writing
  // anything -- a paragraph here is a blank-line-separated block, so this
  // just counts them, same fail-loudly-before-touching-the-DB principle as
  // seedDemoJournal.js's word-count check.
  const tooShort = entries
    .map((e) => ({ title: e.title, paragraphs: e.content.trim().split(/\n\s*\n/).length, words: wordCount(e.content) }))
    .filter((e) => e.paragraphs < 2);
  if (tooShort.length) {
    console.error("Entries with fewer than 2 paragraphs:", tooShort);
    await mongoose.disconnect();
    process.exit(1);
  }

  let user = await User.findOne({ email: SHOWCASE_EMAIL });
  if (user) {
    console.log(`Found existing ${SHOWCASE_EMAIL} -- wiping its data and reseeding fresh.`);
    await Promise.all([
      JournalEntry.deleteMany({ userId: user._id }),
      HealthData.deleteMany({ userId: user._id }),
      ChatSession.deleteMany({ userId: user._id }),
      RetrospectAnalysis.deleteMany({ userId: user._id }),
    ]);
  } else {
    const passwordHash = await bcrypt.hash(SHOWCASE_PASSWORD, 10);
    user = await User.create({ name: SHOWCASE_NAME, email: SHOWCASE_EMAIL, passwordHash });
    console.log(`Created new account: ${SHOWCASE_EMAIL}`);
  }

  // Journal entries -- through the exact same real pipeline a live
  // quick-entry does (extractThemes for `themes`, embedJournalEntry for
  // semantic search), same reasoning as seedDemoJournal.js.
  const journalDocs = entries.map((e) => {
    const createdAt = new Date(`${e.date}T20:${30 + (entries.indexOf(e) % 25)}:00`);
    const doc = {
      userId: user._id,
      content: e.content.trim(),
      mood: e.mood,
      title: e.title,
      tags: e.tags,
      themes: extractThemes(e.content),
      createdAt,
      updatedAt: createdAt,
    };
    if (e.isKeepsake) doc.isKeepsake = true;
    if (e.revealAt) doc.revealAt = new Date(`${e.revealAt}T09:00:00`);
    return doc;
  });
  const createdJournals = await JournalEntry.create(journalDocs);
  console.log(`Seeded ${createdJournals.length} journal entries (2026-08-01 -> 2026-09-30).`);

  let embedded = 0;
  for (const entry of createdJournals) {
    const ok = await embedJournalEntry(entry);
    if (ok) embedded += 1;
    process.stdout.write(ok ? "." : "x");
  }
  console.log(`\nEmbedded ${embedded}/${createdJournals.length} entries.`);
  if (embedded < createdJournals.length) {
    console.log("Some entries weren't embedded -- semantic search will just skip those. Check Ollama is running with nomic-embed-text pulled if you want full coverage.");
  }

  // Health data -- four-act realistic arc with real jitter and skipped
  // days, see buildHealthRows() above.
  const healthRows = buildHealthRows(user._id);
  await HealthData.create(healthRows);
  console.log(`Seeded ${healthRows.length} health data rows (${61 - healthRows.length} days deliberately skipped).`);

  // Chat -- one session doc with 3 grounded turns (see buildChatTurns()).
  const turns = buildChatTurns();
  await ChatSession.create({ userId: user._id, turns });
  console.log(`Seeded ${turns.length} chat turns.`);

  // Retrospect -- one hand-written analysis matching the real story, in the
  // exact shape retrospect/service.js's AI call normally produces (see its
  // prompt schema), so the Retrospect page has real, specific content
  // immediately without depending on a working AI API key.
  await RetrospectAnalysis.create({
    userId: user._id,
    summary:
      "A recurring pattern of staying quiet under pressure until it becomes unbearable, then recovering through direct conversations and consistent small routines.",
    detectedPatterns: [
      "Silence before confrontation",
      "Guilt around family distance",
      "Recovery through routine",
      "Growth through direct conversation",
    ],
    behavioralLoops: [
      "Manager oversteps -> stays quiet -> resentment builds -> eventually speaks up",
      "Big deadline passes -> adrenaline drops -> low mood crash follows",
      "Guilt about family -> avoids calling -> guilt deepens -> finally calls",
    ],
    healthCorrelation:
      "Stress score and sleep move together closely across this account's history, spiking during the campaign crunch and launch week, and dropping sharply once the routine of run club and therapy sessions resumed in late September.",
    socraticQuestion:
      "What would it look like to say the uncomfortable thing the first time, instead of waiting until it's the third?",
    confidence: 0.81,
  });
  console.log("Seeded 1 Retrospect analysis.");

  console.log(`\nDone. Log in with:\n  email: ${SHOWCASE_EMAIL}\n  password: ${SHOWCASE_PASSWORD}`);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
