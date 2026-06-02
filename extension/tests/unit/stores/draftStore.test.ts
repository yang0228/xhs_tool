import { describe, it, expect, beforeEach } from "vitest";
import { useDraftStore } from "../../../src/sidepanel/stores/draftStore";

describe("draftStore", () => {
  beforeEach(() => {
    useDraftStore.getState().reset();
  });

  it("starts with default values", () => {
    const state = useDraftStore.getState();
    expect(state.title).toBe("");
    expect(state.content).toBe("");
    expect(state.selectedImageIds).toEqual([]);
    expect(state.isDirty).toBe(false);
  });

  it("setTitle updates title and marks dirty", () => {
    useDraftStore.getState().setTitle("New Title");
    const state = useDraftStore.getState();
    expect(state.title).toBe("New Title");
    expect(state.isDirty).toBe(true);
  });

  it("setContent updates content and marks dirty", () => {
    useDraftStore.getState().setContent("Body text");
    const state = useDraftStore.getState();
    expect(state.content).toBe("Body text");
    expect(state.isDirty).toBe(true);
  });

  it("toggleImage adds image id and marks dirty", () => {
    useDraftStore.getState().toggleImage("img-1");
    const state = useDraftStore.getState();
    expect(state.selectedImageIds).toEqual(["img-1"]);
    expect(state.isDirty).toBe(true);
  });

  it("toggleImage removes existing image id", () => {
    useDraftStore.getState().toggleImage("img-1");
    useDraftStore.getState().toggleImage("img-2");
    useDraftStore.getState().toggleImage("img-1");
    const state = useDraftStore.getState();
    expect(state.selectedImageIds).toEqual(["img-2"]);
  });

  it("toggleImage supports multiple images", () => {
    useDraftStore.getState().toggleImage("a");
    useDraftStore.getState().toggleImage("b");
    useDraftStore.getState().toggleImage("c");
    expect(useDraftStore.getState().selectedImageIds).toEqual(["a", "b", "c"]);
  });

  it("markClean sets isDirty to false", () => {
    useDraftStore.getState().setTitle("Something");
    expect(useDraftStore.getState().isDirty).toBe(true);

    useDraftStore.getState().markClean();
    expect(useDraftStore.getState().isDirty).toBe(false);
    // Title should persist
    expect(useDraftStore.getState().title).toBe("Something");
  });

  it("reset clears all fields and isDirty", () => {
    useDraftStore.getState().setTitle("T");
    useDraftStore.getState().setContent("C");
    useDraftStore.getState().toggleImage("img");
    expect(useDraftStore.getState().isDirty).toBe(true);

    useDraftStore.getState().reset();
    const state = useDraftStore.getState();
    expect(state.title).toBe("");
    expect(state.content).toBe("");
    expect(state.selectedImageIds).toEqual([]);
    expect(state.isDirty).toBe(false);
  });
});
