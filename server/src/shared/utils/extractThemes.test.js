import { describe, expect, it } from "vitest";
import { extractThemes } from "./extractThemes.js";

// Pure-function suite, no DB/network needed -- guards against the exact
// regression this file's STOPWORDS expansion was written to fix: generic
// filler words ("actually", "instead", "like", "think", "good") winning a
// real entry's top-3 keywords over words someone would actually recognize as
// a topic. Retrospect's recurringThemes and Year in Review's topThemes both
// aggregate this field directly (see retrospect/routes.js,
// yearInReview/routes.js), so a regression here shows up straight in the UI.
describe("extractThemes", () => {
  it("returns [] for short entries with no real signal", () => {
    expect(extractThemes("too short")).toEqual([]);
    expect(extractThemes("")).toEqual([]);
    expect(extractThemes(null)).toEqual([]);
  });

  it("filters out generic filler/hedge words even when they're the most frequent", () => {
    const content =
      "Actually I think I actually just want to say that work has been good, " +
      "like really good, and I think I handled the deadline well this time.";
    const themes = extractThemes(content, 5);
    for (const filler of ["actually", "think", "like", "good", "well", "time"]) {
      expect(themes).not.toContain(filler);
    }
  });

  it("still surfaces a real recurring topic word once filler is excluded", () => {
    const content =
      "Work has been overwhelming this week. Every conversation at work turns back to work " +
      "deadlines, and I keep thinking about work even when I'm not there.";
    const themes = extractThemes(content, 3);
    expect(themes).toContain("work");
  });

  it("is deterministic and alphabetically tie-breaks equal-frequency words", () => {
    const content = "zebra zebra yellow yellow xray xray plenty enough words here today filler";
    const first = extractThemes(content, 2);
    const second = extractThemes(content, 2);
    expect(first).toEqual(second);
    expect(first).toEqual(["xray", "yellow"]);
  });

  it("caps output at the requested limit", () => {
    const content =
      "mountains mountains rivers rivers forests forests deserts deserts oceans oceans " +
      "canyons canyons plains plains this is plenty of real words to extract from";
    expect(extractThemes(content, 3)).toHaveLength(3);
  });
});
