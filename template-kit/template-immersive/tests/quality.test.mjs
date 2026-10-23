import test from "node:test";
import assert from "node:assert/strict";
import { detectQuality } from "../src/scene/quality.js";

const media = (matches) => () => ({ matches });

test("coarse + peu de cœurs → low", () => {
  assert.equal(detectQuality({ matchMedia: media(true), hardwareConcurrency: 4, deviceMemory: 8, innerWidth: 1280, innerHeight: 800 }), "low");
});

test("coarse + mémoire faible → low", () => {
  assert.equal(detectQuality({ matchMedia: media(true), hardwareConcurrency: 8, deviceMemory: 4, innerWidth: 1280, innerHeight: 800 }), "low");
});

test("coarse + petit écran → low", () => {
  assert.equal(detectQuality({ matchMedia: media(true), hardwareConcurrency: 8, deviceMemory: 8, innerWidth: 390, innerHeight: 844 }), "low");
});

test("desktop confortable → high", () => {
  assert.equal(detectQuality({ matchMedia: media(false), hardwareConcurrency: 8, deviceMemory: 8, innerWidth: 1280, innerHeight: 800 }), "high");
});

test("coarse mais machine puissante → high", () => {
  assert.equal(detectQuality({ matchMedia: media(true), hardwareConcurrency: 8, deviceMemory: 8, innerWidth: 1280, innerHeight: 1000 }), "high");
});

test("2 cœurs → low même sur desktop", () => {
  assert.equal(detectQuality({ matchMedia: media(false), hardwareConcurrency: 2, deviceMemory: 16, innerWidth: 1920, innerHeight: 1080 }), "low");
});

test("exception matchMedia → high (dégradation gracieuse)", () => {
  assert.equal(detectQuality({
    matchMedia: () => { throw new Error("refusé"); },
    hardwareConcurrency: 8, deviceMemory: 8, innerWidth: 1280, innerHeight: 800,
  }), "high");
});
