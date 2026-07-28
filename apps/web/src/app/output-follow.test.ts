// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { createOutputFollowControl, scrollOutputToEnd } from "./output-follow";

describe("output follow control", () => {
  it("starts enabled and follows new output", () => {
    const follow = vi.fn();
    const control = createOutputFollowControl({ follow });

    expect(control.following).toBe(true);
    expect(control.input.checked).toBe(true);
    control.notify();
    expect(follow).toHaveBeenCalledTimes(1);
  });

  it("stops following while unchecked and resumes immediately", () => {
    const follow = vi.fn();
    const control = createOutputFollowControl({ follow });

    control.setFollowing(false);
    control.notify();
    expect(follow).not.toHaveBeenCalled();

    control.setFollowing(true);
    expect(follow).toHaveBeenCalledTimes(1);
  });

  it("scrolls an output element to its end", () => {
    const element = { scrollTop: 4, scrollHeight: 120 };
    scrollOutputToEnd(element);
    expect(element.scrollTop).toBe(120);
  });
});
